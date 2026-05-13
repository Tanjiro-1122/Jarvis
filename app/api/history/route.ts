import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId || typeof sessionId !== "string" || sessionId.length > 128) {
    return NextResponse.json({ error: "Invalid sessionId." }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    // Persistence not configured — return empty history.
    return NextResponse.json({ conversationId: null, messages: [] });
  }

  // Find the most recent conversation for this session.
  const { data: existingConv } = await supabase
    .from("conversations")
    .select("id")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let conversationId: string | null = existingConv?.id ?? null;

  if (!conversationId) {
    // Create a new conversation for this session.
    const { data: newConv, error } = await supabase
      .from("conversations")
      .insert({ session_id: sessionId })
      .select("id")
      .single();

    if (error || !newConv) {
      console.error("Failed to create conversation:", error);
      return NextResponse.json({ conversationId: null, messages: [] });
    }

    conversationId = newConv.id;
  }

  // Load all messages for this conversation in chronological order.
  const { data: messages, error: msgError } = await supabase
    .from("messages")
    .select("id, role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (msgError) {
    console.error("Failed to load messages:", msgError);
    return NextResponse.json({ conversationId, messages: [] });
  }

  return NextResponse.json({ conversationId, messages: messages ?? [] });
}
