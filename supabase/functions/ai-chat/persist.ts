// Lean message persistence — text only, no tool internals, to keep DB footprint
// minimal (~1KB per turn) and the storage cost effectively free.

export async function ensureConversation(
  client: any,
  userId: string,
  conversationId: string | undefined,
  firstUserText: string,
): Promise<string> {
  if (conversationId) {
    // Verify it exists, belongs to this user, AND is a general-mode chat
    // (we never want ai-chat to write into a goal_coach conversation)
    const { data } = await client
      .from("ai_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .eq("mode", "general")
      .maybeSingle();
    if (data) return conversationId;
    // If the supplied id doesn't exist or isn't general-mode, fall through
  }

  // Title: trimmed first user message, max 60 chars
  const title = firstUserText.replace(/\s+/g, " ").trim().slice(0, 60) || "(無題)";
  const { data: created, error } = await client
    .from("ai_conversations")
    .insert({
      ...(conversationId ? { id: conversationId } : {}),
      user_id: userId,
      title,
      mode: "general",
    })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

export async function persistUserMessage(
  client: any,
  conversationId: string,
  userId: string,
  text: string,
): Promise<void> {
  await client.from("ai_messages").insert({
    conversation_id: conversationId,
    user_id: userId,
    role: "user",
    text,
  });
}

export async function persistAssistantMessage(
  client: any,
  conversationId: string,
  userId: string,
  text: string,
  costYen: number,
): Promise<void> {
  // Skip empty assistant messages (rare — happens when model only emitted
  // tool calls and no final text). Don't pollute history.
  if (!text.trim()) return;

  await client.from("ai_messages").insert({
    conversation_id: conversationId,
    user_id: userId,
    role: "assistant",
    text,
  });

  // Bump conversation counters in one shot (RPC would be cheaper than two
  // queries but this is a one-time write per turn, not worth a stored proc)
  const { data: conv } = await client
    .from("ai_conversations")
    .select("message_count, total_cost_yen")
    .eq("id", conversationId)
    .maybeSingle();

  await client
    .from("ai_conversations")
    .update({
      message_count: (conv?.message_count ?? 0) + 2, // user + assistant
      total_cost_yen: Number(conv?.total_cost_yen ?? 0) + costYen,
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conversationId);
}
