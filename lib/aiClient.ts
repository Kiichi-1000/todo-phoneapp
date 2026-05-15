// SSE client for the ai-chat Edge Function.
//
// React Native's fetch() does not expose a streaming `response.body` reader,
// so we use XMLHttpRequest with the `onprogress` handler to consume the SSE
// payload incrementally as bytes arrive. This works in Expo Go and dev builds.

import { supabase, supabaseUrl } from '@/lib/supabase';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string | AnthropicContentBlock[];
  tool_use_id?: string; // for role='tool'
}

export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

export type AIStreamEvent =
  | { type: 'session.start'; data: { balance_yen: number; access_reason: string; access_expires_at: string | null; conversation_id: string | null } }
  | { type: 'assistant.text.start'; data: Record<string, never> }
  | { type: 'assistant.text.delta'; data: { text: string } }
  | { type: 'assistant.tool_use.start'; data: { id: string; name: string } }
  | { type: 'tool.exec.start'; data: { id: string; name: string; input: unknown } }
  | { type: 'tool.exec.result'; data: { id: string; result: { ok: boolean; data?: unknown; error?: string } } }
  | { type: 'tool.exec.error'; data: { id: string; error: string } }
  | { type: 'session.end'; data: { usage: any; cost_yen: number; balance_after_yen: number | null; access_reason: string; conversation_id: string | null } }
  | { type: 'error'; data: { code: string; message: string } };

export interface SendChatOptions {
  messages: ChatMessage[];
  conversationId?: string;
  onEvent: (event: AIStreamEvent) => void;
  onAbort?: () => void;
  abortRef?: { current: () => void };
}

export class AIChatError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function parseAndDispatch(
  rawBuffer: string,
  onEvent: SendChatOptions['onEvent'],
): string {
  // Returns the unparsed remainder.
  let buffer = rawBuffer;
  let sepIndex = buffer.indexOf('\n\n');
  while (sepIndex !== -1) {
    const rawEvent = buffer.slice(0, sepIndex);
    buffer = buffer.slice(sepIndex + 2);
    sepIndex = buffer.indexOf('\n\n');

    const lines = rawEvent.split('\n');
    let eventType = 'message';
    let dataPayload = '';
    for (const line of lines) {
      if (line.startsWith('event:')) eventType = line.slice(6).trim();
      else if (line.startsWith('data:')) dataPayload += line.slice(5).trim();
    }
    if (!dataPayload) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(dataPayload); } catch { continue; }
    onEvent({ type: eventType as AIStreamEvent['type'], data: parsed as any });
  }
  return buffer;
}

export async function sendChat(opts: SendChatOptions): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new AIChatError('Not authenticated', 401);
  }

  const url = `${supabaseUrl}/functions/v1/ai-chat`;

  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let buffer = '';
    let lastSeen = 0;
    let aborted = false;

    if (opts.abortRef) {
      opts.abortRef.current = () => {
        aborted = true;
        try { xhr.abort(); } catch { /* ignore */ }
      };
    }

    xhr.open('POST', url, true);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'text/event-stream');

    xhr.onreadystatechange = () => {
      if (aborted) return;

      // Headers received — check for non-2xx early so we can fail fast.
      if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
        if (xhr.status >= 400) {
          // Body might still be loading; wait for it for the error message.
        }
      }

      // Stream chunks via responseText (XHR concatenates, we slice).
      if (xhr.readyState === XMLHttpRequest.LOADING || xhr.readyState === XMLHttpRequest.DONE) {
        if (xhr.status >= 200 && xhr.status < 300) {
          const newChunk = xhr.responseText.substring(lastSeen);
          lastSeen = xhr.responseText.length;
          if (newChunk) {
            buffer += newChunk;
            buffer = parseAndDispatch(buffer, opts.onEvent);
          }
        }
      }

      if (xhr.readyState === XMLHttpRequest.DONE) {
        if (aborted) {
          opts.onAbort?.();
          resolve();
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          // flush any remainder (defensive — server should end with \n\n)
          if (buffer) parseAndDispatch(buffer + '\n\n', opts.onEvent);
          resolve();
        } else {
          let body: any = null;
          try { body = JSON.parse(xhr.responseText); } catch { /* ignore */ }
          reject(
            new AIChatError(
              body?.error || `HTTP ${xhr.status}`,
              xhr.status,
              body?.error,
            ),
          );
        }
      }
    };

    xhr.onerror = () => {
      if (aborted) return;
      reject(new AIChatError('Network error', 0));
    };

    xhr.ontimeout = () => {
      reject(new AIChatError('Request timed out', 0));
    };

    xhr.send(JSON.stringify({
      messages: opts.messages,
      conversationId: opts.conversationId,
    }));
  });
}
