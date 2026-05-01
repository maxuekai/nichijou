import type { ConfigManager } from "../storage/config.js";
import type { AgentCapability, AgentConfig, AgentManager as AgentManagerContract } from "../types/agent.js";

export class AgentManager implements AgentManagerContract {
  constructor(private config: ConfigManager) {}

  getAllAgents(): AgentConfig[] {
    return this.config.get().agents ?? [];
  }

  getAgent(id: string): AgentConfig | null {
    return this.getAllAgents().find((agent) => agent.id === id) ?? null;
  }

  createAgent(agentConfig: Omit<AgentConfig, "id">): string {
    const cfg = this.config.get();
    const id = this.generateAgentId();
    const agents = cfg.agents ?? [];
    const agent: AgentConfig = {
      ...agentConfig,
      id,
      description: agentConfig.description ?? "",
      capabilities: this.normalizeCapabilities(agentConfig.capabilities),
    };

    agents.push(agent);
    this.config.update({ agents });
    return id;
  }

  updateAgent(id: string, updates: Partial<AgentConfig>): void {
    const cfg = this.config.get();
    const agents = cfg.agents ?? [];
    const index = agents.findIndex((agent) => agent.id === id);
    if (index === -1) {
      throw new Error(`Agent with id ${id} not found`);
    }

    const next: AgentConfig = {
      ...agents[index]!,
      ...updates,
      id,
    };
    if (updates.capabilities) {
      next.capabilities = this.normalizeCapabilities(updates.capabilities);
    }
    agents[index] = next;
    this.config.update({ agents });
  }

  deleteAgent(id: string): void {
    const cfg = this.config.get();
    const agents = cfg.agents ?? [];
    const next = agents.filter((agent) => agent.id !== id);
    if (next.length === agents.length) {
      throw new Error(`Agent with id ${id} not found`);
    }
    this.config.update({ agents: next });
  }

  getAgentModelId(agentId: string): string | null {
    return this.getAgent(agentId)?.modelId ?? null;
  }

  getEnabledAgentByCapability(capability: AgentCapability): AgentConfig | null {
    return this.getAllAgents().find((agent) => (
      agent.enabled && agent.capabilities.includes(capability)
    )) ?? null;
  }

  private normalizeCapabilities(capabilities: AgentCapability[]): AgentCapability[] {
    return [...new Set(capabilities)];
  }

  private generateAgentId(): string {
    return `agent_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }
}
