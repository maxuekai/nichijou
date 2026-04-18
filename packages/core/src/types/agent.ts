// Agent配置接口，为未来多Agent模式预留
export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  modelId: string;         // 绑定的模型ID
  enabled: boolean;
  specialization?: string; // 专业领域（conversation/analysis/creative等）
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
}