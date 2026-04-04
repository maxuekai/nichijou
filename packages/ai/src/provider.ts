import { OpenAICompatibleProvider } from "./openai.js";
import type { LLMProvider, ProviderConfig } from "./types.js";

export function createProvider(config: ProviderConfig): LLMProvider {
  return new OpenAICompatibleProvider(config);
}
