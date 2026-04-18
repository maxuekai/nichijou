import yaml from "js-yaml";
import type { StorageManager } from "./storage.js";

export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface LLMModelConfig {
  id: string;              // 模型唯一标识
  name: string;            // 显示名称
  provider: string;        // 厂商标识（openai/kimi/minimax等）
  baseUrl: string;         // API端点
  apiKey: string;          // API密钥
  model: string;           // 模型名称
  timeout?: number;        // 超时设置
  enabled: boolean;        // 是否启用
  isDefault: boolean;      // 是否为默认模型
  createdAt: string;       // 创建时间
  lastUsedAt?: string;     // 最后使用时间
}

export interface ModelsConfig {
  models: LLMModelConfig[];
  activeModelId: string;   // 当前活跃模型ID
}

export interface WeChatConfig {
  typingIndicator?: {
    enabled: boolean;
    timeoutSeconds: number;
  };
}

export interface NichijouConfig {
  // 保留原有 llm 字段用于向后兼容
  llm: LLMConfig;
  // 新增多模型配置
  models?: ModelsConfig;
  port: number;
  timezone: string;
  setupCompleted: boolean;
  butlerName?: string;
  plugins?: string[];
  wechat?: WeChatConfig;
}

const DEFAULT_CONFIG: NichijouConfig = {
  llm: {
    baseUrl: "http://localhost:11434/v1",
    apiKey: "",
    model: "qwen2.5",
  },
  port: 3000,
  timezone: "Asia/Shanghai",
  setupCompleted: false,
  butlerName: "Nichijou",
  wechat: {
    typingIndicator: {
      enabled: true,
      timeoutSeconds: 30,
    },
  },
};

export class ConfigManager {
  private config: NichijouConfig;
  private storage: StorageManager;

  constructor(storage: StorageManager) {
    this.storage = storage;
    this.config = this.load();
  }

  private load(): NichijouConfig {
    const content = this.storage.readText("config.yaml");
    if (!content) {
      this.save(DEFAULT_CONFIG);
      return { ...DEFAULT_CONFIG };
    }
    const parsed = yaml.load(content) as Partial<NichijouConfig>;
    const config = { ...DEFAULT_CONFIG, ...parsed };
    
    // 执行配置迁移
    this.migrate(config);
    
    return config;
  }

  /**
   * 配置迁移逻辑
   */
  private migrate(config: NichijouConfig): void {
    let needSave = false;

    // 如果存在旧的 llm 配置但没有新的 models 配置，进行迁移
    if (config.llm && !config.models) {
      const legacyModel: LLMModelConfig = {
        id: 'legacy-default',
        name: '默认模型',
        provider: 'legacy',
        baseUrl: config.llm.baseUrl,
        apiKey: config.llm.apiKey,
        model: config.llm.model,
        enabled: true,
        isDefault: true,
        createdAt: new Date().toISOString()
      };

      config.models = {
        models: [legacyModel],
        activeModelId: legacyModel.id
      };

      needSave = true;
    }

    if (needSave) {
      this.save(config);
    }
  }

  get(): NichijouConfig {
    return { ...this.config };
  }

  update(patch: Partial<NichijouConfig>): void {
    this.config = { ...this.config, ...patch };
    this.save(this.config);
  }

  private save(config: NichijouConfig): void {
    this.storage.writeText("config.yaml", yaml.dump(config, { lineWidth: 120 }));
  }
}
