import { EventEmitter } from "node:events";
import type { MediaContent } from "@nichijou/shared";

export interface DownloadTask {
  id: string;
  messageId: string;
  memberId: string;
  mediaType: string;
  fileName: string;
  totalSize: number;
  downloadedSize: number;
  progress: number; // 0-100
  status: 'pending' | 'downloading' | 'completed' | 'cancelled' | 'error';
  startTime: number;
  endTime?: number;
  error?: string;
  abortController: AbortController;
  savePath?: string;
}

export interface DownloadProgress {
  taskId: string;
  downloadedSize: number;
  totalSize: number;
  progress: number;
  speed: number; // bytes per second
  estimatedTimeRemaining: number; // seconds
}

export interface DownloadTaskManagerEvents {
  taskStarted: (task: DownloadTask) => void;
  taskProgress: (progress: DownloadProgress) => void;
  taskCompleted: (task: DownloadTask, result: MediaContent) => void;
  taskCancelled: (task: DownloadTask) => void;
  taskError: (task: DownloadTask, error: Error) => void;
}

export class DownloadTaskManager extends EventEmitter {
  private tasks = new Map<string, DownloadTask>();
  private speedTracker = new Map<string, Array<{ time: number; downloaded: number }>>(); // 用于计算下载速度
  private progressUpdateInterval = 1000; // 1秒更新一次进度

  constructor() {
    super();
    
    // 定期清理已完成的任务
    setInterval(() => {
      this.cleanupCompletedTasks();
    }, 60000); // 每分钟清理一次
  }

  /**
   * 创建新的下载任务
   */
  createTask(
    messageId: string,
    memberId: string,
    mediaType: string,
    fileName: string,
    totalSize: number = 0
  ): DownloadTask {
    const taskId = `download_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    const task: DownloadTask = {
      id: taskId,
      messageId,
      memberId,
      mediaType,
      fileName,
      totalSize,
      downloadedSize: 0,
      progress: 0,
      status: 'pending',
      startTime: Date.now(),
      abortController: new AbortController(),
    };

    this.tasks.set(taskId, task);
    this.speedTracker.set(taskId, []);
    
    this.emit('taskStarted', task);
    console.log(`[DownloadTaskManager] 创建下载任务: ${fileName} (${taskId})`);
    
    return task;
  }

  /**
   * 开始下载任务
   */
  startTask(taskId: string): DownloadTask | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    task.status = 'downloading';
    task.startTime = Date.now();
    this.tasks.set(taskId, task);
    
    console.log(`[DownloadTaskManager] 开始下载任务: ${task.fileName} (${taskId})`);
    return task;
  }

  /**
   * 更新下载进度
   */
  updateProgress(taskId: string, downloadedSize: number, totalSize?: number): void {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'downloading') return;

    const now = Date.now();
    
    // 更新任务信息
    task.downloadedSize = downloadedSize;
    if (totalSize !== undefined && totalSize > 0) {
      task.totalSize = totalSize;
    }
    
    if (task.totalSize > 0) {
      task.progress = Math.min(100, Math.round((downloadedSize / task.totalSize) * 100));
    }

    // 更新速度追踪
    const speedData = this.speedTracker.get(taskId) || [];
    speedData.push({ time: now, downloaded: downloadedSize });
    
    // 保留最近10秒的数据用于计算速度
    const tenSecondsAgo = now - 10000;
    const recentData = speedData.filter(data => data.time > tenSecondsAgo);
    this.speedTracker.set(taskId, recentData);

    // 计算下载速度和剩余时间
    const speed = this.calculateSpeed(taskId);
    const estimatedTimeRemaining = this.calculateEstimatedTime(task, speed);

    const progress: DownloadProgress = {
      taskId,
      downloadedSize,
      totalSize: task.totalSize,
      progress: task.progress,
      speed,
      estimatedTimeRemaining,
    };

    this.emit('taskProgress', progress);
  }

  /**
   * 完成下载任务
   */
  completeTask(taskId: string, result: MediaContent): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = 'completed';
    task.endTime = Date.now();
    task.progress = 100;
    task.downloadedSize = task.totalSize || result.size || 0;
    task.savePath = result.filePath;

    this.emit('taskCompleted', task, result);
    console.log(`[DownloadTaskManager] 下载完成: ${task.fileName} (${taskId})`);
  }

  /**
   * 取消下载任务
   */
  cancelTask(taskId: string, reason: string = '用户取消'): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.status === 'downloading' || task.status === 'pending') {
      task.abortController.abort();
      task.status = 'cancelled';
      task.endTime = Date.now();
      task.error = reason;

      this.emit('taskCancelled', task);
      console.log(`[DownloadTaskManager] 取消下载任务: ${task.fileName} (${taskId}) - ${reason}`);
      return true;
    }

    return false;
  }

  /**
   * 标记任务错误
   */
  errorTask(taskId: string, error: Error): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = 'error';
    task.endTime = Date.now();
    task.error = error.message;

    this.emit('taskError', task, error);
    console.log(`[DownloadTaskManager] 下载错误: ${task.fileName} (${taskId}) - ${error.message}`);
  }

  /**
   * 获取任务信息
   */
  getTask(taskId: string): DownloadTask | null {
    return this.tasks.get(taskId) || null;
  }

  /**
   * 获取成员的所有任务
   */
  getMemberTasks(memberId: string): DownloadTask[] {
    return Array.from(this.tasks.values()).filter(task => task.memberId === memberId);
  }

  /**
   * 获取所有活跃任务
   */
  getActiveTasks(): DownloadTask[] {
    return Array.from(this.tasks.values()).filter(
      task => task.status === 'downloading' || task.status === 'pending'
    );
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): DownloadTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 取消成员的所有活跃任务
   */
  cancelMemberTasks(memberId: string): number {
    let cancelledCount = 0;
    
    for (const task of this.tasks.values()) {
      if (task.memberId === memberId && 
          (task.status === 'downloading' || task.status === 'pending')) {
        if (this.cancelTask(task.id, '成员请求取消所有任务')) {
          cancelledCount++;
        }
      }
    }
    
    return cancelledCount;
  }

  /**
   * 计算下载速度 (bytes/second)
   */
  private calculateSpeed(taskId: string): number {
    const speedData = this.speedTracker.get(taskId);
    if (!speedData || speedData.length < 2) return 0;

    const latest = speedData[speedData.length - 1];
    const earliest = speedData[0];
    
    const timeDiff = (latest.time - earliest.time) / 1000; // 转换为秒
    const sizeDiff = latest.downloaded - earliest.downloaded;

    return timeDiff > 0 ? Math.round(sizeDiff / timeDiff) : 0;
  }

  /**
   * 计算预估剩余时间 (seconds)
   */
  private calculateEstimatedTime(task: DownloadTask, speed: number): number {
    if (speed <= 0 || task.totalSize <= 0) return -1;

    const remainingBytes = task.totalSize - task.downloadedSize;
    return Math.round(remainingBytes / speed);
  }

  /**
   * 清理已完成的旧任务
   */
  private cleanupCompletedTasks(): void {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000; // 1小时前

    for (const [taskId, task] of this.tasks.entries()) {
      if ((task.status === 'completed' || task.status === 'error' || task.status === 'cancelled') &&
          task.endTime && task.endTime < oneHourAgo) {
        
        this.tasks.delete(taskId);
        this.speedTracker.delete(taskId);
      }
    }
  }

  /**
   * 获取下载统计信息
   */
  getStats(): {
    total: number;
    active: number;
    completed: number;
    cancelled: number;
    error: number;
    totalDownloaded: number;
    averageSpeed: number;
  } {
    const tasks = Array.from(this.tasks.values());
    const activeTasks = this.getActiveTasks();
    
    let totalDownloaded = 0;
    let totalSpeed = 0;
    let speedCount = 0;

    for (const task of tasks) {
      totalDownloaded += task.downloadedSize;
      
      if (task.status === 'downloading') {
        const speed = this.calculateSpeed(task.id);
        if (speed > 0) {
          totalSpeed += speed;
          speedCount++;
        }
      }
    }

    return {
      total: tasks.length,
      active: activeTasks.length,
      completed: tasks.filter(t => t.status === 'completed').length,
      cancelled: tasks.filter(t => t.status === 'cancelled').length,
      error: tasks.filter(t => t.status === 'error').length,
      totalDownloaded,
      averageSpeed: speedCount > 0 ? Math.round(totalSpeed / speedCount) : 0,
    };
  }

  /**
   * 格式化文件大小
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 格式化时间
   */
  static formatTime(seconds: number): string {
    if (seconds < 0) return '未知';
    if (seconds < 60) return `${seconds}秒`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
    return `${Math.floor(seconds / 3600)}小时${Math.floor((seconds % 3600) / 60)}分`;
  }

  /**
   * 销毁任务管理器，取消所有活跃任务
   */
  destroy(): void {
    for (const task of this.getActiveTasks()) {
      this.cancelTask(task.id, '任务管理器关闭');
    }
    
    this.tasks.clear();
    this.speedTracker.clear();
    this.removeAllListeners();
  }
}