import { promises as fs } from "node:fs";
import type { TranscriptionService } from "./multimodal-provider.js";

export interface WhisperConfig {
  apiKey: string;
  baseUrl?: string; // 默认使用 OpenAI
  model?: string; // 默认使用 whisper-1
  temperature?: number;
  timeout?: number;
}

export class WhisperTranscriptionService implements TranscriptionService {
  private config: WhisperConfig;

  constructor(config: WhisperConfig) {
    this.config = {
      baseUrl: "https://api.openai.com/v1",
      model: "whisper-1",
      temperature: 0,
      timeout: 120_000,
      ...config,
    };
  }

  async transcribe(audioPath: string, language?: string): Promise<string> {
    try {
      // 读取音频文件
      const audioBuffer = await fs.readFile(audioPath);
      
      // 准备表单数据
      const formData = new FormData();
      const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
      formData.append('file', audioBlob, 'audio.mp3');
      formData.append('model', this.config.model!);
      
      if (language) {
        formData.append('language', language);
      }
      
      if (this.config.temperature !== undefined) {
        formData.append('temperature', this.config.temperature.toString());
      }

      // 调用 OpenAI Whisper API
      const response = await fetch(`${this.config.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: formData,
        signal: AbortSignal.timeout(this.config.timeout!),
      });

      if (!response.ok) {
        let errorMessage = `转录 API 错误: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json() as any;
          if (errorData.error?.message) {
            errorMessage = errorData.error.message;
          }
        } catch {
          // 忽略解析错误
        }
        throw new Error(errorMessage);
      }

      const result = await response.json() as any;
      return result.text || '';

    } catch (error) {
      if (error instanceof Error) {
        console.error('[WhisperService] 转录失败:', error.message);
        throw new Error(`语音转录失败: ${error.message}`);
      }
      throw new Error('语音转录失败: 未知错误');
    }
  }

  /**
   * 检查服务是否可用
   */
  async checkHealth(): Promise<boolean> {
    try {
      // 创建一个极小的测试音频文件
      const testAudio = Buffer.from([
        // 一个极简的 WAV 文件头
        0x52, 0x49, 0x46, 0x46, // "RIFF"
        0x24, 0x00, 0x00, 0x00, // 文件大小
        0x57, 0x41, 0x56, 0x45, // "WAVE"
        0x66, 0x6D, 0x74, 0x20, // "fmt "
        0x10, 0x00, 0x00, 0x00, // fmt chunk size
        0x01, 0x00, 0x01, 0x00, // PCM, mono
        0x40, 0x1F, 0x00, 0x00, // 8000 Hz
        0x40, 0x1F, 0x00, 0x00, // byte rate
        0x01, 0x00, 0x08, 0x00, // block align, bits per sample
        0x64, 0x61, 0x74, 0x61, // "data"
        0x00, 0x00, 0x00, 0x00, // data size
      ]);

      const formData = new FormData();
      const testBlob = new Blob([testAudio], { type: 'audio/wav' });
      formData.append('file', testBlob, 'test.wav');
      formData.append('model', this.config.model!);

      const response = await fetch(`${this.config.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: formData,
        signal: AbortSignal.timeout(5000), // 5秒超时
      });

      // 即使转录失败，只要 API 响应了就说明服务可用
      return response.status === 200 || response.status === 400;

    } catch (error) {
      console.warn('[WhisperService] 健康检查失败:', error);
      return false;
    }
  }

  /**
   * 获取支持的音频格式
   */
  getSupportedFormats(): string[] {
    return [
      'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'
    ];
  }

  /**
   * 检查音频格式是否支持
   */
  isFormatSupported(format: string): boolean {
    return this.getSupportedFormats().includes(format.toLowerCase());
  }
}

/**
 * 创建 Whisper 转录服务实例
 */
export function createWhisperService(config: WhisperConfig): WhisperTranscriptionService {
  return new WhisperTranscriptionService(config);
}