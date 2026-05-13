import { Chat } from "@/components/chat";

export default function HomePage() {
  return (
    <main className="page">
      <section className="hero">
        <div className="badge">AI Assistant</div>
        <h1>Jarvis</h1>
        <p>
          Your Vercel-ready AI chatbot starter. Ask anything and start building.
        </p>
      </section>

      <section className="chat-shell">
        <Chat />
      </section>
    </main>
  );
}
