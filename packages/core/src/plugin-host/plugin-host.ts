import type { ToolDefinition } from "@nichijou/shared";
import type { StorageManager } from "../storage/storage.js";

export interface PluginManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  tools: ToolDefinition[];
}

export class PluginHost {
  private plugins = new Map<string, PluginManifest>();
  private storage: StorageManager;

  constructor(storage: StorageManager) {
    this.storage = storage;
  }

  register(plugin: PluginManifest): void {
    this.plugins.set(plugin.id, plugin);
  }

  getPlugin(id: string): PluginManifest | undefined {
    return this.plugins.get(id);
  }

  getAllPlugins(): PluginManifest[] {
    return [...this.plugins.values()];
  }

  getAllTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    for (const plugin of this.plugins.values()) {
      tools.push(...plugin.tools);
    }
    return tools;
  }

  isEnabled(pluginId: string): boolean {
    const configContent = this.storage.readText(`plugins/${pluginId}/config.yaml`);
    if (!configContent) return true;
    return !configContent.includes("enabled: false");
  }
}
