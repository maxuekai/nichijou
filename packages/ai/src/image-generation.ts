import { LLMError } from "@nichijou/shared";
import type { MediaContent } from "@nichijou/shared";
import { promises as fs } from "node:fs";

export interface ImageGenerationConfig {
  provider?: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeout?: number;
}

export interface ImageGenerationRequest {
  prompt: string;
  size?: string;
  referenceImages?: MediaContent[];
  referenceType?: "character";
  promptOptimizer?: boolean;
}

export interface ImageGenerationResult {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

export interface ImageGenerationService {
  generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}

function parseDataUrl(value: string): { buffer: Buffer; mimeType: string } | null {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1]!,
    buffer: Buffer.from(match[2]!, "base64"),
  };
}

function imageExtension(mimeType: string): string {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "png";
}

function detectMimeType(buffer: Buffer, fallback = "image/png"): string {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return fallback;
}

async function downloadImage(url: string, timeoutMs: number): Promise<ImageGenerationResult> {
  const imageResponse = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!imageResponse.ok) {
    throw new LLMError(`Generated image download failed: ${imageResponse.status} ${imageResponse.statusText}`);
  }
  const headerMimeType = imageResponse.headers.get("content-type")?.split(";")[0] || undefined;
  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  const mimeType = headerMimeType || detectMimeType(buffer);
  return {
    buffer,
    mimeType,
    fileName: `generated-image-${Date.now()}.${imageExtension(mimeType)}`,
  };
}

async function mediaContentToImageFile(media: MediaContent): Promise<string> {
  if (/^https?:\/\//i.test(media.filePath) || media.filePath.startsWith("data:image/")) {
    return media.filePath;
  }

  const buffer = await fs.readFile(media.filePath);
  const mimeType = media.mimeType || detectMimeType(buffer, "image/jpeg");
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function sizeToMiniMaxAspectRatio(size?: string): string {
  if (!size || size === "auto") return "1:1";
  if (/^(1:1|16:9|4:3|3:2|2:3|3:4|9:16|21:9)$/.test(size)) return size;

  const match = size.match(/^(\d+)x(\d+)$/);
  if (!match) return "1:1";

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "1:1";
  }

  const ratio = width / height;
  const candidates: Array<[string, number]> = [
    ["1:1", 1],
    ["16:9", 16 / 9],
    ["4:3", 4 / 3],
    ["3:2", 3 / 2],
    ["2:3", 2 / 3],
    ["3:4", 3 / 4],
    ["9:16", 9 / 16],
    ["21:9", 21 / 9],
  ];
  return candidates.reduce((best, current) => (
    Math.abs(current[1] - ratio) < Math.abs(best[1] - ratio) ? current : best
  ))[0];
}

export class OpenAICompatibleImageGenerationService implements ImageGenerationService {
  private config: ImageGenerationConfig;

  constructor(config: ImageGenerationConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl.replace(/\/+$/, ""),
    };
  }

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      prompt: request.prompt,
    };
    if (request.size) body.size = request.size;

    const response = await fetch(`${this.config.baseUrl}/images/generations`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout ?? 120_000),
    });

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const error = data.error as Record<string, string> | undefined;
      throw new LLMError(error?.message ?? `Image generation API error: ${response.status} ${response.statusText}`);
    }

    const item = (data.data as Array<Record<string, unknown>> | undefined)?.[0];
    if (!item) {
      throw new LLMError("No image data in image generation response");
    }

    const b64 = item.b64_json;
    if (typeof b64 === "string" && b64) {
      const buffer = Buffer.from(b64, "base64");
      return {
        buffer,
        mimeType: "image/png",
        fileName: `generated-image-${Date.now()}.png`,
      };
    }

    const url = item.url;
    if (typeof url === "string" && url) {
      const parsed = parseDataUrl(url);
      if (parsed) {
        const extension = imageExtension(parsed.mimeType);
        return {
          ...parsed,
          fileName: `generated-image-${Date.now()}.${extension}`,
        };
      }
      const imageResponse = await fetch(url, {
        signal: AbortSignal.timeout(this.config.timeout ?? 120_000),
      });
      if (!imageResponse.ok) {
        throw new LLMError(`Generated image download failed: ${imageResponse.status} ${imageResponse.statusText}`);
      }
      const mimeType = imageResponse.headers.get("content-type")?.split(";")[0] || "image/png";
      const buffer = Buffer.from(await imageResponse.arrayBuffer());
      return {
        buffer,
        mimeType,
        fileName: `generated-image-${Date.now()}.${imageExtension(mimeType)}`,
      };
    }

    throw new LLMError("Unsupported image generation response format");
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }
}

export class MiniMaxImageGenerationService implements ImageGenerationService {
  private config: ImageGenerationConfig;

  constructor(config: ImageGenerationConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl.replace(/\/+$/, ""),
    };
  }

  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const prompt = request.prompt.trim();
    if (!prompt) {
      throw new LLMError("prompt 不能为空");
    }

    const referenceImages = (request.referenceImages ?? [])
      .filter((media) => media.type === "image" && media.filePath)
      .slice(0, 3);
    const body: Record<string, unknown> = {
      model: this.config.model,
      prompt: prompt.length > 1500 ? prompt.slice(0, 1500) : prompt,
      aspect_ratio: sizeToMiniMaxAspectRatio(request.size),
      response_format: "base64",
      n: 1,
      prompt_optimizer: request.promptOptimizer ?? false,
    };

    if (referenceImages.length > 0) {
      body.subject_reference = await Promise.all(referenceImages.map(async (media) => ({
        type: request.referenceType ?? "character",
        image_file: await mediaContentToImageFile(media),
      })));
    }

    const response = await fetch(this.endpoint(), {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeout ?? 120_000),
    });

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const baseResp = data.base_resp as Record<string, unknown> | undefined;
    const statusCode = baseResp?.status_code;
    if (!response.ok || (typeof statusCode === "number" && statusCode !== 0)) {
      const statusMsg = typeof baseResp?.status_msg === "string" ? baseResp.status_msg : undefined;
      throw new LLMError(statusMsg ?? `MiniMax image generation API error: ${response.status} ${response.statusText}`);
    }

    const payload = data.data as Record<string, unknown> | undefined;
    const base64Images = payload?.image_base64;
    if (Array.isArray(base64Images) && typeof base64Images[0] === "string" && base64Images[0]) {
      const buffer = Buffer.from(base64Images[0], "base64");
      const mimeType = detectMimeType(buffer, "image/jpeg");
      return {
        buffer,
        mimeType,
        fileName: `generated-image-${Date.now()}.${imageExtension(mimeType)}`,
      };
    }

    const imageUrls = payload?.image_urls;
    if (Array.isArray(imageUrls) && typeof imageUrls[0] === "string" && imageUrls[0]) {
      return downloadImage(imageUrls[0], this.config.timeout ?? 120_000);
    }

    throw new LLMError("Unsupported MiniMax image generation response format");
  }

  private endpoint(): string {
    if (this.config.baseUrl.endsWith("/image_generation")) {
      return this.config.baseUrl;
    }
    return `${this.config.baseUrl}/image_generation`;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }
}

export function createImageGenerationService(config: ImageGenerationConfig): ImageGenerationService {
  const provider = config.provider?.toLowerCase() ?? "";
  const baseUrl = config.baseUrl.toLowerCase();
  if (provider.includes("minimax") || baseUrl.includes("minimax.io") || baseUrl.includes("minimaxi.com")) {
    return new MiniMaxImageGenerationService(config);
  }
  return new OpenAICompatibleImageGenerationService(config);
}
