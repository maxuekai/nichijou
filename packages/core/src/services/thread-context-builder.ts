import type { 
  ReferenceContent, 
  ThreadContext,
  MediaContent,
  MultimediaConfig
} from "@nichijou/shared";
import type { Database } from "../db/database.js";

export interface ThreadMessage {
  messageId: string;
  content: string;
  mediaContent?: MediaContent[];
  timestamp: number;
  authorId: string;
  authorName?: string;
  isReference?: boolean;
}

export interface ThreadContextBuilderConfig {
  database: Database;
  multimediaConfig: MultimediaConfig;
}

export class ThreadContextBuilder {
  private config: ThreadContextBuilderConfig;

  constructor(config: ThreadContextBuilderConfig) {
    this.config = config;
  }

  /**
   * 构建完整的对话线程上下文
   */
  async buildThreadContext(references: ReferenceContent[]): Promise<ThreadContext[]> {
    const threads: ThreadContext[] = [];
    const processedMessages = new Set<string>();

    for (const reference of references) {
      if (processedMessages.has(reference.messageId)) {
        continue;
      }

      const thread = await this.buildSingleThread(
        reference.messageId,
        processedMessages,
        0
      );

      if (thread) {
        threads.push(thread);
      }
    }

    return threads;
  }

  /**
   * 构建单个线程的上下文
   */
  private async buildSingleThread(
    messageId: string,
    processedMessages: Set<string>,
    currentDepth: number
  ): Promise<ThreadContext | null> {
    // 检查深度限制
    if (currentDepth >= this.config.multimediaConfig.references.max_thread_depth) {
      return null;
    }

    // 检查是否已处理
    if (processedMessages.has(messageId)) {
      return null;
    }

    processedMessages.add(messageId);

    try {
      // 从数据库获取消息引用关系
      const messageRefs = this.config.database.getMessageReferences(messageId);
      const referencesToThisMessage = this.config.database.getReferencesToMessage(messageId);

      const threadMessages: ThreadMessage[] = [];
      const threadId = `thread_${messageId}`;

      // 添加当前消息（如果是引用的起点）
      if (currentDepth === 0) {
        const currentMessage = await this.getMessageById(messageId);
        if (currentMessage) {
          threadMessages.push(currentMessage);
        }
      }

      // 递归构建引用链
      for (const ref of messageRefs) {
        const referencedMessage = await this.getMessageById(ref.referencedMessageId);
        if (referencedMessage) {
          const referencedThreadMessage: ThreadMessage = {
            messageId: referencedMessage.messageId,
            content: referencedMessage.content,
            mediaContent: referencedMessage.mediaContent,
            timestamp: referencedMessage.timestamp,
            authorId: referencedMessage.authorId,
            authorName: referencedMessage.authorName,
            isReference: true,
          };
          threadMessages.push(referencedThreadMessage);

          // 递归获取被引用消息的上下文
          const subThread = await this.buildSingleThread(
            ref.referencedMessageId,
            processedMessages,
            currentDepth + 1
          );

          if (subThread && subThread.messages.length > 0) {
            // 合并子线程的消息
            threadMessages.push(...subThread.messages);
          }
        }
      }

      // 添加引用当前消息的消息
      for (const ref of referencesToThisMessage) {
        const referencingMessage = await this.getMessageById(ref.messageId);
        if (referencingMessage && !processedMessages.has(ref.messageId)) {
          threadMessages.push(referencingMessage);
          processedMessages.add(ref.messageId);
        }
      }

      // 按时间戳排序
      threadMessages.sort((a, b) => a.timestamp - b.timestamp);

      // 去重（基于 messageId）
      const uniqueMessages = threadMessages.filter(
        (msg, index, arr) => arr.findIndex(m => m.messageId === msg.messageId) === index
      );

      if (uniqueMessages.length === 0) {
        return null;
      }

      return {
        threadId,
        messages: uniqueMessages,
        depth: currentDepth,
      };

    } catch (error) {
      console.error('[ThreadContextBuilder] 构建线程上下文失败:', error);
      return null;
    }
  }

  /**
   * 从数据库获取消息详情（模拟实现，实际需要根据数据库结构调整）
   */
  private async getMessageById(messageId: string): Promise<ThreadMessage | null> {
    try {
      // TODO: 这里需要根据实际的数据库结构实现
      // 由于当前数据库结构中没有直接存储完整消息信息，
      // 这里提供一个基础实现框架
      
      // 从聊天历史中查找相关消息
      // 这是一个简化的实现，实际应该有专门的消息表
      
      return {
        messageId,
        content: `[消息 ${messageId}]`, // 占位符，实际需要从数据库获取
        timestamp: Date.now(),
        authorId: 'unknown',
        authorName: '未知用户',
        isReference: false,
      };

    } catch (error) {
      console.error('[ThreadContextBuilder] 获取消息失败:', messageId, error);
      return null;
    }
  }

  /**
   * 格式化线程上下文为可读字符串
   */
  formatThreadContext(threads: ThreadContext[]): string {
    if (threads.length === 0) {
      return '';
    }

    let formatted = '[对话线程上下文]\n\n';

    for (let i = 0; i < threads.length; i++) {
      const thread = threads[i];
      formatted += `线程 ${i + 1} (深度: ${thread.depth}, ${thread.messages.length} 条消息):\n`;

      for (let j = 0; j < thread.messages.length; j++) {
        const msg = thread.messages[j];
        const prefix = msg.isReference ? '  ↳ 引用: ' : '  - ';
        
        formatted += `${prefix}${msg.authorName || msg.authorId}: ${msg.content}`;
        
        if (msg.mediaContent && msg.mediaContent.length > 0) {
          const mediaTypes = msg.mediaContent.map(m => m.type).join(', ');
          formatted += ` [包含: ${mediaTypes}]`;
        }
        
        formatted += '\n';
      }
      
      formatted += '\n';
    }

    return formatted;
  }

  /**
   * 获取线程统计信息
   */
  getThreadStats(threads: ThreadContext[]): {
    totalThreads: number;
    totalMessages: number;
    maxDepth: number;
    mediaCount: number;
  } {
    let totalMessages = 0;
    let maxDepth = 0;
    let mediaCount = 0;

    for (const thread of threads) {
      totalMessages += thread.messages.length;
      maxDepth = Math.max(maxDepth, thread.depth);
      
      for (const message of thread.messages) {
        if (message.mediaContent) {
          mediaCount += message.mediaContent.length;
        }
      }
    }

    return {
      totalThreads: threads.length,
      totalMessages,
      maxDepth,
      mediaCount,
    };
  }

  /**
   * 简化线程上下文（用于节省 token）
   */
  simplifyThreadContext(threads: ThreadContext[], maxMessages: number = 10): ThreadContext[] {
    if (threads.length === 0) {
      return threads;
    }

    const simplified: ThreadContext[] = [];

    for (const thread of threads) {
      // 保留最重要的消息（被引用的消息和最新的消息）
      const importantMessages = thread.messages
        .filter(msg => msg.isReference)
        .slice(0, Math.floor(maxMessages / 2));

      const recentMessages = thread.messages
        .filter(msg => !msg.isReference)
        .slice(-Math.floor(maxMessages / 2));

      const combinedMessages = [...importantMessages, ...recentMessages]
        .sort((a, b) => a.timestamp - b.timestamp);

      // 去重
      const uniqueMessages = combinedMessages.filter(
        (msg, index, arr) => arr.findIndex(m => m.messageId === msg.messageId) === index
      );

      simplified.push({
        ...thread,
        messages: uniqueMessages,
      });
    }

    return simplified;
  }
}