export { createProvider } from "./provider.js";
export { OpenAICompatibleProvider } from "./openai.js";
export { 
  MultimodalProviderSelector,
  type MultimodalProviderConfig,
  type TranscriptionService 
} from "./multimodal-provider.js";
export { 
  WhisperTranscriptionService,
  createWhisperService,
  type WhisperConfig 
} from "./whisper-service.js";
export type {
  LLMProvider,
  ProviderConfig,
  ChatRequest,
  ChatResponse,
  StreamEvent,
  Usage,
} from "./types.js";
