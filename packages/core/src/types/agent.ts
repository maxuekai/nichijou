export type AgentCapability = "vision" | "image_generation";

// Agent配置接口，为多Agent模式提供能力型路由
export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  modelId: string;         // 绑定的模型ID
  enabled: boolean;
  capabilities: AgentCapability[];
}

// Agent上下文，用于在运行时指定agent或模型
export interface AgentContext {
  agentId?: string;        // 可选的agent上下文
  preferredModelId?: string; // 上下文级模型覆盖
}

// Agent管理器接口预留
export interface AgentManager {
  getAllAgents(): AgentConfig[];
  getAgent(id: string): AgentConfig | null;
  createAgent(config: Omit<AgentConfig, 'id'>): string;
  updateAgent(id: string, updates: Partial<AgentConfig>): void;
  deleteAgent(id: string): void;
  getAgentModelId(agentId: string): string | null;
  getEnabledAgentByCapability(capability: AgentCapability): AgentConfig | null;
  getEnabledAgentsByCapability(capability: AgentCapability): AgentConfig[];
}
