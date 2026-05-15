// SSE client for the goal-coach Edge Function.
//
// Distinct from aiClient because the request shape is different:
//   - goal-coach takes only { user_text } (server reconstructs history)
//   - aiClient takes { messages, conversationId } (client supplies history)
//
// Reuses the same XHR-based SSE parsing pattern.

import { supabase, supabaseUrl } from '@/lib/supabase';
import { AIChatError, type AIStreamEvent } from '@/lib/aiClient';

export interface SendCoachOptions {
  userText: string;
  onEvent: (event: AIStreamEvent) => void;
  onAbort?: () => void;
  abortRef?: { current: () => void };
}

function parseAndDispatch(
  rawBuffer: string,
  onEvent: (e: AIStreamEvent) => void,
): string {
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

export async function sendCoach(opts: SendCoachOptions): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) throw new AIChatError('Not authenticated', 401);

  const url = `${supabaseUrl}/functions/v1/goal-coach`;

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
        if (aborted) { opts.onAbort?.(); resolve(); return; }
        if (xhr.status >= 200 && xhr.status < 300) {
          if (buffer) parseAndDispatch(buffer + '\n\n', opts.onEvent);
          resolve();
        } else {
          let body: any = null;
          try { body = JSON.parse(xhr.responseText); } catch { /* ignore */ }
          reject(new AIChatError(body?.error || `HTTP ${xhr.status}`, xhr.status, body?.error));
        }
      }
    };

    xhr.onerror = () => {
      if (aborted) return;
      reject(new AIChatError('Network error', 0));
    };
    xhr.ontimeout = () => reject(new AIChatError('Request timed out', 0));

    xhr.send(JSON.stringify({ user_text: opts.userText }));
  });
}
