export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export type ProviderName =
  | "local"
  | "ollama"
  | "groq"
  | "gemini"
  | "huggingface"
  | "openai"
  | "stub";

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface GenerateRequest {
  messages: ChatMessage[];
  maxOutputTokens: number;
  temperature?: number;
  /** Ask the provider for JSON output when it supports a JSON mode. */
  json?: boolean;
  signal?: AbortSignal;
}

export interface GenerateResult {
  text: string;
  usage: TokenUsage;
}

export type StreamChunk =
  | { type: "text"; text: string }
  | { type: "usage"; usage: TokenUsage };

export interface ChatProvider {
  readonly name: ProviderName;
  readonly model: string;
  generate(req: GenerateRequest): Promise<GenerateResult>;
  stream(req: GenerateRequest): AsyncIterable<StreamChunk>;
}

export interface EmbeddingProvider {
  readonly name: ProviderName;
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[], signal?: AbortSignal): Promise<number[][]>;
}

export interface UsageEvent {
  feature: string;
  kind: "chat" | "embedding";
  provider: ProviderName | "none";
  model: string;
  userId?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  ok: boolean;
  errorCode?: string;
}

export interface ProviderStatus {
  available: boolean;
  provider: ProviderName | null;
  model: string | null;
}

export interface AIStatus {
  chat: ProviderStatus;
  embeddings: ProviderStatus;
}
