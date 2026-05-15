// Shared types for the ai-chat Edge Function.

export interface ChatRequest {
  messages: ChatMessage[];
  conversationId?: string;
}

export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: AnthropicAssistantContentBlock[] }
  | { role: "tool"; tool_use_id: string; content: string };

export interface AnthropicTextContentBlock {
  type: "text";
  text: string;
}

export interface AnthropicToolUseContentBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type AnthropicAssistantContentBlock =
  | AnthropicTextContentBlock
  | AnthropicToolUseContentBlock;

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolExecutor {
  (input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

export interface ToolContext {
  userId: string;
  adminClient: any;
  now: Date;
  language: "ja" | "en";
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface AIUsageMeta {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface AccessGrant {
  allowed: boolean;
  // "basic_plan_no_ai": Basic プランは AI 機能を含まないため AI 機能を拒否。
  //                    クライアントには「Standard 以上にアップグレードして」を促す。
  reason:
    | "active_subscription"
    | "promo"
    | "release_promo"
    | "none"
    | "basic_plan_no_ai";
  expiresAt?: string;
}
