"use client";

import { useChat } from "ai/react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/csv",
  "text/markdown",
];

export function Chat() {
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const { messages, input, handleInputChange, handleSubmit, status, setMessages } =
    useChat({ body: { conversationId } });

  const [files, setFiles] = useState<FileList | undefined>();
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [fileError, setFileError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load or create a session ID and fetch conversation history on mount.
  useEffect(() => {
    let sessionId = localStorage.getItem("jarvis_session_id");
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem("jarvis_session_id", sessionId);
    }

    fetch(`/api/history?sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then(
        ({
          conversationId: convId,
          messages: history,
        }: {
          conversationId: string | null;
          messages: { id: string; role: string; content: string }[];
        }) => {
          setConversationId(convId);
          if (history.length > 0) {
            setMessages(
              history.map((m) => ({
                id: m.id,
                role: m.role as "user" | "assistant",
                content: m.content,
                parts: [{ type: "text" as const, text: m.content }],
              }))
            );
          }
        }
      )
      .catch(() => {
        // History unavailable — continue without persistence.
      })
      .finally(() => {
        setHistoryLoaded(true);
      });
  }, [setMessages]);

  // Scroll to the latest message whenever messages change.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const isLoading = status === "submitted" || status === "streaming";

  // Revoke object URLs when they change or component unmounts
  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  function validateFiles(fileList: FileList): string {
    for (const file of Array.from(fileList)) {
      if (file.size > MAX_FILE_SIZE) {
        return `"${file.name}" exceeds the ${MAX_FILE_SIZE_MB} MB limit.`;
      }
      if (!ACCEPTED_TYPES.includes(file.type)) {
        return `"${file.name}" type not supported. Accepted: images (JPEG, PNG, GIF, WEBP) and text files.`;
      }
    }
    return "";
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    previewUrls.forEach((url) => URL.revokeObjectURL(url));

    const selected = e.target.files;
    if (!selected || selected.length === 0) {
      setFiles(undefined);
      setPreviewUrls([]);
      setFileError("");
      return;
    }

    const error = validateFiles(selected);
    if (error) {
      setFileError(error);
      setFiles(undefined);
      setPreviewUrls([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else {
      setFileError("");
      setFiles(selected);
      setPreviewUrls(Array.from(selected).map((f) => URL.createObjectURL(f)));
    }
  }

  function clearAttachments() {
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    setFiles(undefined);
    setPreviewUrls([]);
    setFileError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (isLoading) {
      e.preventDefault();
      return;
    }
    const hasFiles = files != null && files.length > 0;
    if (!input.trim() && !hasFiles) {
      e.preventDefault();
      return;
    }
    handleSubmit(e, {
      experimental_attachments: files,
      allowEmptySubmit: hasFiles && !input.trim(),
    });
    clearAttachments();
  }

  return (
    <div className="chat">
      <div className="chat-header">
        <span className="chat-header-title">Jarvis</span>
        <button className="logout-button" onClick={handleLogout}>
          Sign out
        </button>
      </div>
      <div className="messages">
        {!historyLoaded ? (
          <div className="empty-state">
            <p>Loading…</p>
          </div>
        ) : messages.length === 0 ? (
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
              {message.role === "user" &&
                message.experimental_attachments &&
                message.experimental_attachments.length > 0 && (
                  <div className="message-attachments">
                    {message.experimental_attachments.map((att, idx) =>
                      att.contentType?.startsWith("image/") ? (
                        <img
                          key={idx}
                          src={att.url}
                          alt={att.name ?? "Attached image"}
                          className="attachment-image"
                        />
                      ) : (
                        <div key={idx} className="attachment-file">
                          📎 {att.name ?? "File"}
                        </div>
                      )
                    )}
                  </div>
                )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {files != null && files.length > 0 && (
        <div className="attachment-preview">
          {Array.from(files).map((file, idx) => (
            <div key={idx} className="attachment-preview-item">
              {file.type.startsWith("image/") ? (
                <img
                  src={
                    previewUrls[idx]?.startsWith("blob:")
                      ? previewUrls[idx]
                      : ""
                  }
                  alt={file.name}
                  className="attachment-preview-img"
                />
              ) : (
                <span className="attachment-preview-file">📎 {file.name}</span>
              )}
            </div>
          ))}
          <button
            type="button"
            className="attachment-clear"
            onClick={clearAttachments}
            aria-label="Clear attachments"
          >
            ✕
          </button>
        </div>
      )}

      {fileError && <div className="file-error">{fileError}</div>}

      <form className="input-form" onSubmit={handleFormSubmit}>
        <label className="attach-button" title="Attach image or text file">
          📎
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_TYPES.join(",")}
            onChange={handleFileChange}
            className="file-input-hidden"
          />
        </label>
        <input
          name="message"
          value={input}
          onChange={handleInputChange}
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
