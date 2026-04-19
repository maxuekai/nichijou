import type { MediaContent, InboundMessage } from "@nichijou/shared";

export interface ErrorContext {
  operation: string;
  memberId?: string;
  messageId?: string;
  error: Error;
  timestamp: number;
  retryCount?: number;
}

export interface FallbackOptions {
  enableTextFallback: boolean;
  enableMediaSkip: boolean;
  enableReferenceFallback: boolean;
  maxRetries: number;
  retryDelayMs: number;
}

export class ErrorHandler {
  private fallbackOptions: FallbackOptions;
  private errorCounts = new Map<string, number>();
  private lastErrors = new Map<string, number>();

  constructor(options: Partial<FallbackOptions> = {}) {
    this.fallbackOptions = {
      enableTextFallback: true,
      enableMediaSkip: true,
      enableReferenceFallback: true,
      maxRetries: 3,
      retryDelayMs: 1000,
      ...options,
    };
  }

  /**
   * 处理媒体文件下载失败
   */
  async handleMediaDownloadError(
    error: Error,
    mediaInfo: { type: string; originalName?: string },
    context: { memberId: string; messageId: string }
  ): Promise<{ shouldSkip: boolean; fallbackText?: string }> {
    const errorContext: ErrorContext = {
      operation: 'media_download',
      memberId: context.memberId,
      messageId: context.messageId,
      error,
      timestamp: Date.now(),
    };

    this.logError(errorContext);

    if (!this.fallbackOptions.enableMediaSkip) {
      throw error;
    }

    // 生成降级文本
    const fallbackText = this.generateMediaFallbackText(mediaInfo, error);

    return {
      shouldSkip: true,
      fallbackText,
    };
  }

  /**
   * 处理语音转录失败
   */
  async handleTranscriptionError(
    error: Error,
    mediaContent: MediaContent,
    context: { memberId: string }
  ): Promise<{ shouldRetry: boolean; fallbackText?: string }> {
    const errorContext: ErrorContext = {
      operation: 'voice_transcription',
      memberId: context.memberId,
      error,
      timestamp: Date.now(),
    };

    const retryCount = this.getRetryCount(`transcription_${context.memberId}`);
    errorContext.retryCount = retryCount;

    this.logError(errorContext);

    // 检查是否应该重试
    if (retryCount < this.fallbackOptions.maxRetries) {
      await this.delay(this.fallbackOptions.retryDelayMs * (retryCount + 1));
      this.incrementRetryCount(`transcription_${context.memberId}`);
      return { shouldRetry: true };
    }

    // 生成降级文本
    const fallbackText = this.generateTranscriptionFallbackText(mediaContent, error);

    return {
      shouldRetry: false,
      fallbackText,
    };
  }

  /**
   * 处理多模态LLM调用失败
   */
  async handleLLMError(
    error: Error,
    message: InboundMessage,
    context: { memberId: string }
  ): Promise<{ shouldFallbackToText: boolean; modifiedMessage?: InboundMessage }> {
    const errorContext: ErrorContext = {
      operation: 'llm_multimodal',
      memberId: context.memberId,
      messageId: message.messageId,
      error,
      timestamp: Date.now(),
    };

    this.logError(errorContext);

    if (!this.fallbackOptions.enableTextFallback) {
      throw error;
    }

    // 构建纯文本降级消息
    const fallbackMessage = this.buildTextFallbackMessage(message);

    return {
      shouldFallbackToText: true,
      modifiedMessage: fallbackMessage,
    };
  }

  /**
   * 处理引用消息解析失败
   */
  async handleReferenceError(
    error: Error,
    context: { memberId: string; messageId?: string }
  ): Promise<{ shouldSkipReferences: boolean; fallbackText?: string }> {
    const errorContext: ErrorContext = {
      operation: 'reference_parsing',
      memberId: context.memberId,
      messageId: context.messageId,
      error,
      timestamp: Date.now(),
    };

    this.logError(errorContext);

    if (!this.fallbackOptions.enableReferenceFallback) {
      throw error;
    }

    return {
      shouldSkipReferences: true,
      fallbackText: '[引用消息解析失败，忽略引用内容]',
    };
  }

  /**
   * 处理文件存储错误
   */
  async handleStorageError(
    error: Error,
    context: { operation: string; filePath?: string; memberId?: string }
  ): Promise<{ shouldContinue: boolean; alternativeAction?: string }> {
    const errorContext: ErrorContext = {
      operation: `storage_${context.operation}`,
      memberId: context.memberId,
      error,
      timestamp: Date.now(),
    };

    this.logError(errorContext);

    // 根据错误类型决定处理方式
    if (this.isRecoverableStorageError(error)) {
      const retryKey = `storage_${context.operation}_${context.filePath || 'unknown'}`;
      const retryCount = this.getRetryCount(retryKey);

      if (retryCount < this.fallbackOptions.maxRetries) {
        await this.delay(this.fallbackOptions.retryDelayMs);
        this.incrementRetryCount(retryKey);
        return { shouldContinue: false }; // 重试
      }
    }

    return {
      shouldContinue: true,
      alternativeAction: 'skip_file_storage',
    };
  }

  /**
   * 生成媒体文件降级文本
   */
  private generateMediaFallbackText(
    mediaInfo: { type: string; originalName?: string },
    error: Error
  ): string {
    const fileName = mediaInfo.originalName || '未知文件';
    const mediaType = this.getMediaTypeName(mediaInfo.type);
    
    if (error.message.includes('timeout')) {
      return `[${mediaType}文件下载超时: ${fileName}]`;
    } else if (error.message.includes('size')) {
      return `[${mediaType}文件过大无法处理: ${fileName}]`;
    } else {
      return `[${mediaType}文件处理失败: ${fileName}]`;
    }
  }

  /**
   * 生成语音转录降级文本
   */
  private generateTranscriptionFallbackText(
    mediaContent: MediaContent,
    error: Error
  ): string {
    const fileName = mediaContent.originalName || '未知语音';
    
    if (error.message.includes('api_key') || error.message.includes('authentication')) {
      return `[语音文件: ${fileName}，转录服务未配置]`;
    } else if (error.message.includes('timeout')) {
      return `[语音文件: ${fileName}，转录超时]`;
    } else if (error.message.includes('format')) {
      return `[语音文件: ${fileName}，格式不支持转录]`;
    } else {
      return `[语音文件: ${fileName}，转录失败]`;
    }
  }

  /**
   * 构建纯文本降级消息
   */
  private buildTextFallbackMessage(message: InboundMessage): InboundMessage {
    let fallbackText = message.text;

    // 添加媒体文件描述
    if (message.mediaContent && message.mediaContent.length > 0) {
      fallbackText += '\n\n[媒体内容]\n';
      for (const media of message.mediaContent) {
        const mediaType = this.getMediaTypeName(media.type);
        const fileName = media.originalName || '未知文件';
        fallbackText += `- ${mediaType}: ${fileName}\n`;
      }
    }

    // 添加引用消息描述
    if (message.references && message.references.length > 0) {
      fallbackText += '\n[引用消息]\n';
      for (const ref of message.references) {
        fallbackText += `- "${ref.content}"\n`;
      }
    }

    return {
      ...message,
      text: fallbackText,
      mediaContent: undefined,
      references: undefined,
    };
  }

  /**
   * 判断是否为可恢复的存储错误
   */
  private isRecoverableStorageError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('timeout') || 
           message.includes('enoent') || 
           message.includes('eacces') ||
           message.includes('temporary');
  }

  /**
   * 获取媒体类型的中文名称
   */
  private getMediaTypeName(type: string): string {
    const typeMap: Record<string, string> = {
      image: '图片',
      voice: '语音',
      video: '视频',
      file: '文件',
    };
    return typeMap[type] || type;
  }

  /**
   * 记录错误
   */
  private logError(context: ErrorContext): void {
    const errorKey = `${context.operation}_${context.memberId || 'unknown'}`;
    const currentCount = this.errorCounts.get(errorKey) || 0;
    this.errorCounts.set(errorKey, currentCount + 1);
    this.lastErrors.set(errorKey, context.timestamp);

    console.error(
      `[ErrorHandler] ${context.operation} 错误 (${context.memberId || 'unknown'}):`,
      context.error.message,
      `(重试次数: ${context.retryCount || 0})`
    );

    // 如果错误频率过高，记录警告
    if (currentCount > 10) {
      console.warn(
        `[ErrorHandler] 操作 ${context.operation} 错误频率过高 (${currentCount} 次)`
      );
    }
  }

  /**
   * 获取重试次数
   */
  private getRetryCount(key: string): number {
    return this.errorCounts.get(key) || 0;
  }

  /**
   * 增加重试次数
   */
  private incrementRetryCount(key: string): void {
    const current = this.getRetryCount(key);
    this.errorCounts.set(key, current + 1);
  }

  /**
   * 重置重试计数器
   */
  resetRetryCount(key: string): void {
    this.errorCounts.delete(key);
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取错误统计
   */
  getErrorStats(): {
    totalErrors: number;
    errorsByOperation: Record<string, number>;
    recentErrors: number;
  } {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    let totalErrors = 0;
    let recentErrors = 0;
    const errorsByOperation: Record<string, number> = {};

    for (const [key, count] of this.errorCounts.entries()) {
      totalErrors += count;
      
      const operation = key.split('_')[0];
      errorsByOperation[operation] = (errorsByOperation[operation] || 0) + count;

      const lastError = this.lastErrors.get(key);
      if (lastError && lastError > oneHourAgo) {
        recentErrors += count;
      }
    }

    return {
      totalErrors,
      errorsByOperation,
      recentErrors,
    };
  }

  /**
   * 清理过期的错误记录
   */
  cleanupOldErrors(): void {
    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

    for (const [key, timestamp] of this.lastErrors.entries()) {
      if (timestamp < oneWeekAgo) {
        this.errorCounts.delete(key);
        this.lastErrors.delete(key);
      }
    }
  }
}