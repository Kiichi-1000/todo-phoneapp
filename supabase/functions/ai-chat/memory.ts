// User memory: small, durable facts injected into the system prompt.
//
// Cost design:
//   - Capped at MEMORY_LIMIT entries per user (~30).
//   - Each value capped at 300 chars (DB constraint).
//   - Loaded once per request; rendered as <user_memory> block.
//   - Lives in its OWN system-prompt cache breakpoint so updates only
//     invalidate that block — the static system prompt stays cached.

export const MEMORY_LIMIT = 30;

export interface MemoryEntry {
  key: string;
  value: string;
  updated_at: string;
}

export async function loadUserMemory(
  client: any,
  userId: string,
): Promise<MemoryEntry[]> {
  const { data } = await client
    .from("user_memory")
    .select("key, value, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(MEMORY_LIMIT);
  return (data ?? []) as MemoryEntry[];
}

// Format memory for the system prompt. Keep it compact — every token costs.
// Only emit the block when there's actually something to say so cold users
// don't pay for an empty section.
export function formatMemoryForPrompt(entries: MemoryEntry[], lang: "ja" | "en"): string {
  if (entries.length === 0) {
    return lang === "ja"
      ? "<user_memory>\n(まだ何も記憶していません。重要な情報は remember ツールで保存してください。)\n</user_memory>"
      : "<user_memory>\n(No memory yet. Use the remember tool to save important facts.)\n</user_memory>";
  }
  const lines = entries.map((e) => `- ${e.key}: ${e.value}`).join("\n");
  return `<user_memory>\n${lines}\n</user_memory>`;
}

export async function upsertMemoryEntry(
  client: any,
  userId: string,
  key: string,
  value: string,
): Promise<{ ok: boolean; error?: string; pruned?: string }> {
  const trimmedKey = key.trim().slice(0, 60);
  const trimmedValue = value.trim().slice(0, 300);
  if (!trimmedKey) return { ok: false, error: "key is required" };
  if (!trimmedValue) return { ok: false, error: "value is required" };

  // Check current count; if at cap and this is a NEW key, evict the oldest.
  const { data: existing } = await client
    .from("user_memory")
    .select("key")
    .eq("user_id", userId)
    .eq("key", trimmedKey)
    .maybeSingle();

  let prunedKey: string | undefined;
  if (!existing) {
    const { count } = await client
      .from("user_memory")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    if ((count ?? 0) >= MEMORY_LIMIT) {
      // Evict oldest entry by updated_at to make room
      const { data: oldest } = await client
        .from("user_memory")
        .select("key")
        .eq("user_id", userId)
        .order("updated_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (oldest?.key) {
        await client
          .from("user_memory")
          .delete()
          .eq("user_id", userId)
          .eq("key", oldest.key);
        prunedKey = oldest.key;
      }
    }
  }

  const { error } = await client
    .from("user_memory")
    .upsert(
      {
        user_id: userId,
        key: trimmedKey,
        value: trimmedValue,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,key" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true, pruned: prunedKey };
}

export async function deleteMemoryEntry(
  client: any,
  userId: string,
  key: string,
): Promise<{ ok: boolean; deleted: boolean }> {
  const { data } = await client
    .from("user_memory")
    .delete()
    .eq("user_id", userId)
    .eq("key", key.trim())
    .select("key")
    .maybeSingle();
  return { ok: true, deleted: !!data };
}
