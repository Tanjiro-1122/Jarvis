import { NextRequest, NextResponse } from "next/server";
import { getOrCreateConversation, getConversationMessages } from "@/lib/db";

const MAX_SESSION_ID_LENGTH = 128;

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (
    !sessionId ||
    typeof sessionId !== "string" ||
    sessionId.length > MAX_SESSION_ID_LENGTH
  ) {
    return NextResponse.json({ error: "Invalid sessionId." }, { status: 400 });
  }

  const conv = await getOrCreateConversation(sessionId);
  if (!conv) {
    // Persistence not configured or DB error — return empty history.
    return NextResponse.json({ conversationId: null, messages: [] });
  }

  const messages = await getConversationMessages(conv.conversationId);

  return NextResponse.json({
    conversationId: conv.conversationId,
    messages,
  });
}
