"use client";

import { useState } from "react";
import { useChat } from "ai/react";

export function Chat() {
  const [input, setInput] = useState("");

  const { messages, sendMessage, status } = useChat();

  const isLoading = status === "submitted" || status === "streaming";

  return (
    <div className="chat">
      <div className="messages">
        {messages.length === 0 ? (
          <div className="empty-state">
            <h2>Hello, I&apos;m Jarvis.</h2>
            <p>How can I help you today?</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`message ${message.role === "user" ? "user" : "assistant"}`}
            >
              <div className="message-role">
                {message.role === "user" ? "You" : "Jarvis"}
              </div>
              <div className="message-content">
                {message.parts.map((part, index) => {
                  if (part.type === "text") {
                    return <p key={`${message.id}-${index}`}>{part.text}</p>;
                  }

                  return null;
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <form
        className="input-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim() || isLoading) return;

          sendMessage({ text: input });
          setInput("");
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Jarvis anything..."
          className="chat-input"
        />
        <button type="submit" className="send-button" disabled={isLoading}>
          {isLoading ? "Thinking..." : "Send"}
        </button>
      </form>
    </div>
  );
}
