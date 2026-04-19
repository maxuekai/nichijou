import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { MultimediaConfig } from "@nichijou/shared";
import { MediaManager, type MediaStorageConfig } from "./media-manager.js";

const DEFAULT_DATA_DIR = join(homedir(), ".nichijou");

export class StorageManager {
  readonly dataDir: string;
  private _mediaManager?: MediaManager;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? DEFAULT_DATA_DIR;
    this.ensureDirectories();
  }

  /** 获取媒体管理器实例 */
  getMediaManager(database: any, config?: MultimediaConfig): MediaManager {
    if (!this._mediaManager && database) {
      const storageConfig: MediaStorageConfig = {
        basePath: config?.storage?.base_path || join(this.dataDir, 'media'),
        maxFileSizeMB: config?.storage?.max_file_size_mb || 50,
        cleanupDays: config?.storage?.cleanup_days || 30,
        enableDeduplication: true,
      };
      
      this._mediaManager = new MediaManager(this, database, storageConfig);
    }
    return this._mediaManager!;
  }

  private ensureDirectories(): void {
    const dirs = [
      this.dataDir,
      join(this.dataDir, "family", "members"),
      join(this.dataDir, "skills"),
      join(this.dataDir, "plugins"),
      join(this.dataDir, "wechat", "accounts"),
      join(this.dataDir, "media"),
      join(this.dataDir, "media", "avatars"),
      join(this.dataDir, "db"),
    ];
    for (const dir of dirs) {
      mkdirSync(dir, { recursive: true });
    }
  }

  resolve(...segments: string[]): string {
    return join(this.dataDir, ...segments);
  }

  exists(relativePath: string): boolean {
    return existsSync(this.resolve(relativePath));
  }

  readText(relativePath: string): string | null {
    const fullPath = this.resolve(relativePath);
    if (!existsSync(fullPath)) return null;
    return readFileSync(fullPath, "utf-8");
  }

  writeText(relativePath: string, content: string): void {
    const fullPath = this.resolve(relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
  }

  deleteFile(relativePath: string): void {
    const fullPath = this.resolve(relativePath);
    if (existsSync(fullPath)) {
      rmSync(fullPath, { recursive: true, force: true });
    }
  }

  listDir(relativePath: string): string[] {
    const fullPath = this.resolve(relativePath);
    if (!existsSync(fullPath)) return [];
    return readdirSync(fullPath);
  }

  readSoul(): string {
    const content = this.readText("SOUL.md");
    if (content) return content;

    const defaultSoul = `# 管家人格

你是"小日子"，一个温暖细心的家庭管家。

## 语气
- 亲切但不啰嗦，像一个贴心的家人
- 提醒时温和但坚定

## 偏好
- 优先考虑家庭成员的健康
- 推荐活动时注重性价比
- 做饭建议偏向营养均衡
`;
    this.writeText("SOUL.md", defaultSoul);
    return defaultSoul;
  }

  readMemberProfile(memberId: string): string | null {
    return this.readText(`family/members/${memberId}.md`);
  }

  writeMemberProfile(memberId: string, content: string): void {
    this.writeText(`family/members/${memberId}.md`, content);
  }

  readBinary(relativePath: string): Buffer | null {
    const fullPath = this.resolve(relativePath);
    if (!existsSync(fullPath)) return null;
    return readFileSync(fullPath);
  }

  writeBinary(relativePath: string, data: Buffer): void {
    const fullPath = this.resolve(relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, data);
  }
}
