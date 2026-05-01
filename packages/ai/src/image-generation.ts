import { LLMError } from "@nichijou/shared";

export interface ImageGenerationConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeout?: number;
}

export interface ImageGenerationRequest {
  prompt: string;
  size?: string;
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

export function createImageGenerationService(config: ImageGenerationConfig): ImageGenerationService {
  return new OpenAICompatibleImageGenerationService(config);
}
