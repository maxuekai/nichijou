import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { join, extname, basename } from "node:path";
import type { MediaContent, MediaProcessingResult } from "@nichijou/shared";
import type { StorageManager } from "./storage.js";
import type { Database } from "../db/database.js";

export interface MediaFileRecord {
  id: string;
  messageId?: string;
  filePath: string;
  hash: string;
  originalName: string;
  mimeType: string;
  size: number;
  duration?: number;
  createdAt: string;
  accessedAt: string;
  refCount: number; // 引用计数，用于垃圾回收
}

export interface MediaStorageConfig {
  basePath: string;
  maxFileSizeMB: number;
  cleanupDays: number;
  enableDeduplication: boolean;
}

export class MediaManager {
  private storage: StorageManager;
  private database: Database;
  private config: MediaStorageConfig;
  private hashIndex = new Map<string, string>(); // hash -> filePath
  
  constructor(storage: StorageManager, database: Database, config: MediaStorageConfig) {
    this.storage = storage;
    this.database = database;
    this.config = config;
    this.initializeHashIndex();
  }

  /** 初始化哈希索引 */
  private async initializeHashIndex(): Promise<void> {
    // 从数据库加载现有文件的哈希索引
    try {
      const stats = this.database.getMediaStats();
      console.log(`[MediaManager] 加载了 ${stats.totalFiles} 个媒体文件索引`);
    } catch (error) {
      console.error('[MediaManager] 初始化哈希索引失败:', error);
    }
  }

  /** 计算文件哈希值 */
  private async calculateFileHash(buffer: Buffer): Promise<string> {
    return createHash('sha256').update(buffer).digest('hex').substring(0, 16);
  }

  /** 生成按日期分组的存储路径 */
  private generateStoragePath(messageId: string, timestamp: number, hash: string, extension: string): string {
    const date = new Date(timestamp);
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    return join('media', dateStr, `${messageId}_${hash}${extension}`);
  }

  /** 获取文件 MIME 类型 */
  private getMimeType(filename: string, buffer: Buffer): string {
    const ext = extname(filename).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.json': 'application/json',
    };

    // 首先尝试从扩展名推断
    if (mimeMap[ext]) {
      return mimeMap[ext];
    }

    // 尝试从文件头推断
    if (buffer.length >= 4) {
      const header = buffer.subarray(0, 4);
      
      // JPEG
      if (header[0] === 0xFF && header[1] === 0xD8) {
        return 'image/jpeg';
      }
      
      // PNG
      if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) {
        return 'image/png';
      }
      
      // GIF
      if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) {
        return 'image/gif';
      }
    }

    return 'application/octet-stream';
  }

  /** 保存媒体文件 */
  async saveMediaFile(
    buffer: Buffer,
    originalName: string,
    messageId: string,
    timestamp: number = Date.now()
  ): Promise<MediaContent> {
    // 检查文件大小
    const sizeMB = buffer.length / (1024 * 1024);
    if (sizeMB > this.config.maxFileSizeMB) {
      throw new Error(`文件大小 ${sizeMB.toFixed(2)}MB 超过限制 ${this.config.maxFileSizeMB}MB`);
    }

    const hash = await this.calculateFileHash(buffer);
    const mimeType = this.getMimeType(originalName, buffer);
    const extension = extname(originalName) || '.bin';

    // 检查是否已存在相同文件（去重）
    if (this.config.enableDeduplication) {
      const existingFile = this.database.getMediaFileByHash(hash);
      if (existingFile) {
        const existingFullPath = this.storage.resolve(existingFile.filePath);
        
        // 验证文件是否真的存在
        try {
          await fs.access(existingFullPath);
          // 文件存在，增加引用计数
          this.database.incrementMediaRefCount(hash);
          
          return {
            type: this.getMediaType(mimeType),
            filePath: existingFullPath,
            originalName,
            mimeType,
            size: buffer.length,
            hash,
            downloadedAt: existingFile.accessedAt,
          };
        } catch {
          // 文件不存在，删除数据库记录
          this.database.deleteMediaFile(hash);
        }
      }
    }

    // 生成存储路径
    const storagePath = this.generateStoragePath(messageId, timestamp, hash, extension);
    const fullPath = this.storage.resolve(storagePath);
    
    // 保存文件
    this.storage.writeBinary(storagePath, buffer);
    
    // 记录到数据库
    this.database.saveMediaFile({
      id: `${messageId}_${hash}`,
      messageId,
      filePath: storagePath,
      hash,
      originalName,
      mimeType,
      size: buffer.length,
      fileType: this.getMediaType(mimeType),
    });

    return {
      type: this.getMediaType(mimeType),
      filePath: fullPath,
      originalName,
      mimeType,
      size: buffer.length,
      hash,
      downloadedAt: new Date().toISOString(),
    };
  }

  /** 根据 MIME 类型确定媒体类型 */
  private getMediaType(mimeType: string): MediaContent['type'] {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'voice';
    if (mimeType.startsWith('video/')) return 'video';
    return 'file';
  }

  /** 获取媒体文件记录 */
  async getMediaRecord(hash: string): Promise<MediaFileRecord | null> {
    const record = this.database.getMediaFileByHash(hash);
    if (!record) return null;
    
    return {
      id: record.id,
      messageId: record.messageId || undefined,
      filePath: record.filePath,
      hash: record.hash,
      originalName: record.originalName,
      mimeType: record.mimeType,
      size: record.size,
      duration: record.duration || undefined,
      createdAt: record.createdAt,
      accessedAt: record.accessedAt,
      refCount: record.refCount,
    };
  }

  /** 清理过期文件 */
  async cleanupExpiredFiles(): Promise<{ cleaned: number; errors: string[] }> {
    let cleaned = 0;
    const errors: string[] = [];

    try {
      // 从数据库查询过期文件
      const expiredFiles = this.database.getExpiredMediaFiles(this.config.cleanupDays);

      for (const file of expiredFiles) {
        try {
          // 删除文件
          const fullPath = this.storage.resolve(file.filePath);
          await fs.unlink(fullPath);
          
          // 从数据库删除记录
          this.database.deleteMediaFile(file.hash);
          
          cleaned++;
          console.log(`清理过期文件: ${file.originalName}`);
        } catch (error) {
          errors.push(`清理文件失败 ${file.originalName}: ${error}`);
        }
      }
      
    } catch (error) {
      errors.push(`清理过程出错: ${error}`);
    }

    return { cleaned, errors };
  }

  /** 获取存储统计信息 */
  async getStorageStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    totalSizeMB: number;
    imageCount: number;
    voiceCount: number;
    videoCount: number;
    fileCount: number;
  }> {
    const stats = this.database.getMediaStats();
    
    return {
      totalFiles: stats.totalFiles,
      totalSize: stats.totalSize,
      totalSizeMB: stats.totalSize / (1024 * 1024),
      imageCount: stats.imageCount,
      voiceCount: stats.voiceCount,
      videoCount: stats.videoCount,
      fileCount: stats.fileCount,
    };
  }

  /** 设置定时清理任务 */
  startPeriodicCleanup(intervalHours: number = 24): NodeJS.Timeout {
    return setInterval(async () => {
      try {
        const result = await this.cleanupExpiredFiles();
        if (result.cleaned > 0) {
          console.log(`媒体文件清理完成: 清理了 ${result.cleaned} 个文件`);
        }
        if (result.errors.length > 0) {
          console.error('媒体文件清理错误:', result.errors);
        }
      } catch (error) {
        console.error('媒体文件清理失败:', error);
      }
    }, intervalHours * 60 * 60 * 1000);
  }
}