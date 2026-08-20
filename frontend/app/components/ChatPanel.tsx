"use client";

import { useState } from "react";

type Message = { role: "user" | "assistant"; content: string; agentName?: string };

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type ChatPanelProps = {
  token?: string;
};

export default function ChatPanel({ token }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userQuery = input.trim();
    const userMessage: Message = { role: "user", content: userQuery };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      // If user is authenticated, record query via POST /queries first if desired or direct /chat
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;

        // Also record to authenticated query store
        fetch(`${API_BASE}/queries`, {
          method: "POST",
          headers,
          body: JSON.stringify({ query_text: userQuery }),
        }).catch(() => {});
      }

      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({ message: userQuery }),
      });

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || "No reply produced.",
          agentName: data.agent_name,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Error reaching Relay backend. Is it running on port 8000?",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-140px)] flex-col rounded-xl border border-gray-800 bg-gray-900/40 p-4 shadow-xl">
      {/* Header */}
      <div className="mb-4 pb-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">AI Engineering Copilot</h2>
          <p className="text-xs text-gray-400">Ask code questions, GitHub metadata, or investigate CI build failures</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto pr-2">
        {messages.length === 0 && (
          <div className="py-12 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/10 text-blue-400 mb-3 border border-blue-500/20">
              💬
            </div>
            <p className="text-sm font-medium text-gray-300">How can Relay help you today?</p>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2 max-w-xl mx-auto">
              <button
                onClick={() => setInput("Explain the architecture of this repository")}
                className="rounded-lg border border-gray-800 bg-gray-950 p-2.5 text-xs text-gray-400 hover:border-gray-700 hover:text-white transition text-left"
              >
                "Explain the architecture of this repository"
              </button>
              <button
                onClick={() => setInput("Show recent commit history and branches")}
                className="rounded-lg border border-gray-800 bg-gray-950 p-2.5 text-xs text-gray-400 hover:border-gray-700 hover:text-white transition text-left"
              >
                "Show recent commit history and branches"
              </button>
              <button
                onClick={() => setInput("Why did the latest CI workflow pipeline fail?")}
                className="rounded-lg border border-gray-800 bg-gray-950 p-2.5 text-xs text-gray-400 hover:border-gray-700 hover:text-white transition text-left"
              >
                "Why did the latest CI pipeline fail?"
              </button>
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}
          >
            {message.agentName && (
              <span className="mb-1 text-[11px] font-medium text-blue-400 uppercase tracking-wider">
                {message.agentName}
              </span>
            )}
            <div
              className={`rounded-2xl px-4 py-3 text-sm leading-relaxed max-w-2xl whitespace-pre-wrap break-words ${
                message.role === "user"
                  ? "bg-blue-600 text-white rounded-br-none shadow-md shadow-blue-600/10"
                  : "bg-gray-950 border border-gray-800 text-gray-200 rounded-bl-none"
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-ping" />
            Relay agent is thinking...
          </div>
        )}
      </div>

      {/* Input */}
      <div className="mt-4 flex gap-2 pt-3 border-t border-gray-800">
        <input
          className="flex-1 rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
          placeholder="Ask Relay about your code, GitHub, or CI/CD runs..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 transition shadow-lg shadow-blue-600/20"
        >
          Send
        </button>
      </div>
    </div>
  );
}
