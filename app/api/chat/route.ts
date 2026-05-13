import { streamText, UIMessage, convertToCoreMessages } from "ai";
import { openai } from "@ai-sdk/openai";
import { getSupabaseClient } from "@/lib/supabase";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const {
      messages,
      conversationId,
    }: { messages: UIMessage[]; conversationId?: string } = await req.json();

    const result = streamText({
      model: openai("gpt-4o-mini"),
      system:
        "You are Jarvis, a helpful, fast, concise AI assistant. Be clear and practical.",
      messages: convertToCoreMessages(messages),
      onFinish: async ({ text }) => {
        if (!conversationId) return;
        const supabase = getSupabaseClient();
        if (!supabase) return;

        // Save the latest user message and the assistant response.
        const lastUserMessage = [...messages]
          .reverse()
          .find((m) => m.role === "user");
        if (!lastUserMessage) return;

        const userContent = lastUserMessage.parts
          .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
          .map((p) => p.text)
          .join("");

        if (!userContent && !text) return;

        await supabase.from("messages").insert([
          {
            conversation_id: conversationId,
            role: "user",
            content: userContent,
          },
          {
            conversation_id: conversationId,
            role: "assistant",
            content: text,
          },
        ]);
      },
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({ error: "Something went wrong processing your request." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
