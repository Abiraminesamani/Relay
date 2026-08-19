"use client";

import { useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.content }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error reaching backend. Is it running on :8000?" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen max-w-2xl flex-col mx-auto p-4">
      <h1 className="mb-4 text-xl font-medium">DevCopilot</h1>

      <div className="mb-4 flex-1 space-y-3 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400">
            Ask about the codebase, or ask why a recent build failed.
          </p>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            className={`rounded-lg p-3 text-sm whitespace-pre-wrap break-words overflow-x-hidden ${
              message.role === "user" ? "ml-8 bg-blue-900/40" : "mr-8 bg-gray-800"
            }`}
          >
            {message.content}
          </div>
        ))}
        {loading && <div className="text-sm text-gray-500">Thinking...</div>}
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm outline-none"
          placeholder="Why did the last build fail?"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <button
          onClick={sendMessage}
          className="rounded-lg bg-blue-700 px-4 py-2 text-sm hover:bg-blue-600 disabled:opacity-50"
          disabled={loading}
        >
          Send
        </button>
      </div>
    </div>
  );
}
