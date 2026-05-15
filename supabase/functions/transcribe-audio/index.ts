// Audio transcription Edge Function (Google Cloud Speech-to-Text v2 + Claude post-processing).
//
// Pipeline:
//   1. Accept multipart audio file (WAV/AMR/WebM-Opus — Google STT v2 supported formats).
//   2. Run Google STT v2 inline `recognize` (auth via service-account JWT).
//   3. Optionally pass the raw transcript through Claude Haiku for cleanup
//      (filler removal, punctuation, summarization, or bullet conversion).
//
// IMPORTANT — known limit:
//   Google v2 inline `recognize` is hard-capped at 60 seconds of audio.
//   The client therefore caps recordings at ~55s. Long-form support requires
//   switching to OpenAI Whisper (which natively supports 25 min) — see the
//   commented Whisper integration in the git history. Plan: stay on Google
//   for now, migrate to Whisper when budget / API key are ready.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.30.1";
import { checkAccess, getEffectiveBalance, hasMinimumTurnBalance } from "../ai-chat/access.ts";
import { getGoogleAccessToken, getGoogleProjectId } from "./google-auth.ts";

// ----- LLM post-processing (Typeless-style polish) -----

type PostMode = "raw" | "clean" | "summary" | "bullet";

const POST_PROMPTS: Record<Exclude<PostMode, "raw">, string> = {
  clean:
    "次の文字起こしテキストを、口頭での『えーと』『あー』『あの』等のフィラー・言い直し・冗長表現を取り除いて、自然な日本語の文章に整えてください。\n" +
    "ルール:\n" +
    "- 内容や意図は絶対に変えない（要約や省略はしない）\n" +
    "- 句読点を適切に入れる\n" +
    "- 改行は意味の区切りで適度に\n" +
    "- 出力は整えた文章本体のみ。前置きや「以下整えました」などは書かない\n",
  summary:
    "次の文字起こしテキストを、要点だけを残して簡潔にまとめてください。\n" +
    "ルール:\n" +
    "- 重要な事実・数字・固有名詞は必ず保持\n" +
    "- 冗長な口語表現は削除\n" +
    "- 1〜3文で完結させる\n" +
    "- 出力は要約本体のみ\n",
  bullet:
    "次の文字起こしテキストを、複数の要素やアクションに分解して箇条書きにしてください。\n" +
    "ルール:\n" +
    "- 各箇条書きは『・』で始める\n" +
    "- 1項目あたり短く（30字程度を目安）\n" +
    "- 順序を保持\n" +
    "- 出力は箇条書きリストのみ\n",
};

async function applyPostProcessing(
  rawText: string,
  mode: PostMode,
  anthropicApiKey: string,
): Promise<{ text: string; tokensIn: number; tokensOut: number } | null> {
  if (mode === "raw" || !rawText.trim()) return null;

  const client = new Anthropic({ apiKey: anthropicApiKey });
  const systemPrompt = POST_PROMPTS[mode];

  try {
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: rawText }],
    });
    const text = resp.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();
    return {
      text: text || rawText,
      tokensIn: resp.usage?.input_tokens ?? 0,
      tokensOut: resp.usage?.output_tokens ?? 0,
    };
  } catch (e) {
    console.error("post-processing failed:", e);
    return null;
  }
}

// ----- Google STT decoding hints -----

function getDecodingConfig(filename: string, mimeType: string): Record<string, unknown> {
  const name = filename.toLowerCase();
  const type = mimeType.toLowerCase();

  if (name.endsWith(".wav") || type.includes("wav") || type.includes("x-wav")) {
    return {
      explicitDecodingConfig: {
        encoding: "LINEAR16",
        sampleRateHertz: 16000,
        audioChannelCount: 1,
      },
    };
  }
  if (name.endsWith(".webm") || type.includes("webm")) {
    return {
      explicitDecodingConfig: {
        encoding: "WEBM_OPUS",
        sampleRateHertz: 16000,
        audioChannelCount: 1,
      },
    };
  }
  if (name.endsWith(".ogg") || type.includes("ogg")) {
    return {
      explicitDecodingConfig: {
        encoding: "OGG_OPUS",
        sampleRateHertz: 16000,
        audioChannelCount: 1,
      },
    };
  }
  if (name.endsWith(".amr") || type.includes("amr")) {
    return {
      explicitDecodingConfig: {
        encoding: "AMR_WB",
        sampleRateHertz: 16000,
        audioChannelCount: 1,
      },
    };
  }
  return { autoDecodingConfig: {} };
}

// Chunked base64 encoding to handle audio without stack overflow.
function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function parseDurationSeconds(d: unknown): number | null {
  if (typeof d === "string") {
    const m = d.match(/^([\d.]+)s$/);
    if (m) return parseFloat(m[1]);
    const n = parseFloat(d);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof d === "number") return d;
  if (d && typeof d === "object" && "seconds" in (d as any)) {
    return Number((d as any).seconds) || 0;
  }
  return null;
}

// ----- HTTP wrapper -----

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Google STT v2 latest_long pricing: $0.024/min
const GOOGLE_USD_PER_MINUTE = 0.024;
const INTERNAL_USD_TO_YEN = 150;
const SAFETY_MULTIPLIER = 1.2;
const MIN_BILL_YEN = 0.5;

function billYenForSttDuration(durationSec: number): number {
  const minutes = Math.max(durationSec, 1) / 60;
  const usd = minutes * GOOGLE_USD_PER_MINUTE;
  return usd * INTERNAL_USD_TO_YEN * SAFETY_MULTIPLIER;
}

// Google v2 inline content: 10 MB / 60 s. We cap our app at 10 MB and let
// Google reject anything > 60 s.
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Health-check (no auth) — verifies env without exposing secrets.
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("healthcheck") === "1") {
    const sa = Deno.env.get("GOOGLE_CLOUD_SERVICE_ACCOUNT");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!sa) return jsonResponse({ ok: false, stage: "missing_secret" }, 500);
    try {
      const parsed = JSON.parse(sa);
      const required = ["type", "project_id", "private_key", "private_key_id", "client_email"];
      const missing = required.filter((k) => !parsed[k]);
      if (missing.length > 0) return jsonResponse({ ok: false, stage: "missing_fields", missing }, 500);
      const pk = String(parsed.private_key);
      if (!pk.includes("BEGIN PRIVATE KEY")) return jsonResponse({ ok: false, stage: "private_key_malformed" }, 500);
      if (!anthropicKey) return jsonResponse({ ok: false, stage: "missing_anthropic_key" }, 500);
      return jsonResponse({
        ok: true,
        stage: "ready",
        stt_provider: "google_stt_v2_latest_long",
        llm_provider: "anthropic_claude_haiku",
        max_audio_seconds: 60,
        project_id: parsed.project_id,
      });
    } catch (e: any) {
      return jsonResponse({ ok: false, stage: "invalid_json", error: e?.message }, 500);
    }
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!Deno.env.get("GOOGLE_CLOUD_SERVICE_ACCOUNT")) {
    return jsonResponse({ ok: false, error: "GOOGLE_CLOUD_SERVICE_ACCOUNT not configured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Authorization required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return jsonResponse({ ok: false, error: "Invalid token" }, 401);

  const adminClient = createClient(supabaseUrl, serviceKey);
  const userId = user.id;
  const now = new Date();

  const access = await checkAccess(adminClient, userId, now);
  if (!access.allowed) return jsonResponse({ ok: false, error: "subscription_required" }, 402);

  const balance = await getEffectiveBalance(adminClient, userId, now);
  if (access.reason === "active_subscription" && !hasMinimumTurnBalance(balance.totalYen)) {
    return jsonResponse({ ok: false, error: "insufficient_balance" }, 402);
  }

  // Parse multipart form
  let formData: FormData;
  try { formData = await req.formData(); }
  catch (e: any) {
    return jsonResponse({ ok: false, error: "Invalid form-data: " + e?.message }, 400);
  }

  const audioFile = formData.get("audio");
  if (!(audioFile instanceof File)) {
    return jsonResponse({ ok: false, error: "audio file required" }, 400);
  }
  if (audioFile.size === 0) {
    return jsonResponse({ ok: false, error: "Audio file is empty" }, 400);
  }
  if (audioFile.size > MAX_AUDIO_BYTES) {
    return jsonResponse({ ok: false, error: "Audio file too large (max 10MB)" }, 400);
  }

  const language = (formData.get("language") as string) || "ja";
  const langCode = language === "en" ? "en-US" : "ja-JP";

  const requestedMode = (formData.get("mode") as string) ?? "clean";
  const mode: PostMode = (
    ["raw", "clean", "summary", "bullet"].includes(requestedMode)
      ? requestedMode
      : "clean"
  ) as PostMode;

  // ----- 1. Google STT -----
  const audioBytes = new Uint8Array(await audioFile.arrayBuffer());
  const audioBase64 = bytesToBase64(audioBytes);

  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken();
  } catch (e: any) {
    return jsonResponse({ ok: false, error: "Google auth failed: " + e?.message }, 500);
  }

  const projectId = getGoogleProjectId();
  const decodingConfig = getDecodingConfig(audioFile.name ?? "", audioFile.type ?? "");

  const recognizeUrl =
    `https://speech.googleapis.com/v2/projects/${projectId}/locations/global/recognizers/_:recognize`;

  const body = {
    config: {
      ...decodingConfig,
      languageCodes: [langCode],
      model: "latest_long",
      features: { enableAutomaticPunctuation: true },
    },
    content: audioBase64,
  };

  const sttRes = await fetch(recognizeUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!sttRes.ok) {
    const errText = await sttRes.text();
    return jsonResponse({
      ok: false,
      error: `Google Speech-to-Text error (${sttRes.status}): ${errText}`,
    }, 502);
  }

  const sttJson = await sttRes.json() as {
    results?: Array<{
      alternatives?: Array<{ transcript?: string; confidence?: number }>;
      resultEndOffset?: string;
    }>;
    metadata?: { totalBilledDuration?: string };
  };

  const transcript = (sttJson.results ?? [])
    .map((r) => r.alternatives?.[0]?.transcript ?? "")
    .filter(Boolean)
    .join(" ")
    .trim();

  let durationSec: number | null = parseDurationSeconds(sttJson.metadata?.totalBilledDuration);
  if (durationSec === null) {
    const lastResult = sttJson.results?.[sttJson.results.length - 1];
    durationSec = parseDurationSeconds(lastResult?.resultEndOffset);
  }
  if (durationSec === null) {
    durationSec = Math.max(1, audioBytes.length / 32000);
  }

  // ----- 2. LLM post-processing -----
  let polishedText = transcript;
  let postUsage: { tokensIn: number; tokensOut: number } | null = null;
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (mode !== "raw" && transcript && anthropicApiKey) {
    const out = await applyPostProcessing(transcript, mode, anthropicApiKey);
    if (out) {
      polishedText = out.text;
      postUsage = { tokensIn: out.tokensIn, tokensOut: out.tokensOut };
    }
  }

  // ----- 3. Billing -----
  if (access.reason === "active_subscription") {
    const sttYen = billYenForSttDuration(durationSec);

    const HAIKU_IN_YEN_PER_TOK = 0.12 / 1000;
    const HAIKU_OUT_YEN_PER_TOK = 0.6 / 1000;
    const llmYen = postUsage
      ? (postUsage.tokensIn * HAIKU_IN_YEN_PER_TOK + postUsage.tokensOut * HAIKU_OUT_YEN_PER_TOK)
      : 0;

    const yen = Math.max(MIN_BILL_YEN, Math.ceil((sttYen + llmYen) * 10000) / 10000);

    const { data: bal } = await adminClient
      .from("ai_token_balances")
      .select("current_grant_yen, carryover_yen, total_consumed_yen")
      .eq("user_id", userId)
      .maybeSingle();

    let carryover = Number(bal?.carryover_yen ?? 0);
    let current = Number(bal?.current_grant_yen ?? 0);
    let remaining = yen;
    if (carryover > 0) {
      const fromCarry = Math.min(carryover, remaining);
      carryover -= fromCarry;
      remaining -= fromCarry;
    }
    if (remaining > 0) {
      const fromGrant = Math.min(current, remaining);
      current -= fromGrant;
    }
    carryover = Math.max(0, carryover);
    current = Math.max(0, current);

    await adminClient
      .from("ai_token_balances")
      .update({
        carryover_yen: carryover,
        current_grant_yen: current,
        total_consumed_yen: (Number(bal?.total_consumed_yen ?? 0)) + yen,
        last_consumed_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    await adminClient.from("ai_token_transactions").insert({
      user_id: userId,
      kind: "consume",
      amount_yen: -yen,
      balance_after_yen: carryover + current,
      api_provider: "google+anthropic",
      api_model: `speech-v2-latest_long+haiku-4.5(${mode})`,
      metadata: {
        duration_sec: durationSec,
        post_mode: mode,
        post_tokens_in: postUsage?.tokensIn ?? 0,
        post_tokens_out: postUsage?.tokensOut ?? 0,
        stt_yen: sttYen,
        llm_yen: llmYen,
      },
    });
  }

  return jsonResponse({
    ok: true,
    text: polishedText,
    raw_text: transcript,
    mode,
    duration_sec: durationSec,
    language: langCode,
  });
});
