"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
  agentName?: string;
  timestamp?: string;
  steps?: string[];
  isStreaming?: boolean;
};

type Repository = {
  id: number;
  name: string;
  repo_url: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type ChatPanelProps = {
  token?: string;
  prefillQuery?: string;
  selectedRepoUrl?: string;
  onSelectRepoUrl?: (url: string) => void;
};

type AgentType = "auto" | "github" | "ci" | "code" | "pr_review";

const AGENT_CONFIGS: Record<
  string,
  { label: string; icon: string; color: string; badgeBg: string; border: string; desc: string }
> = {
  "GitHub Agent": {
    label: "GitHub Agent",
    icon: "🐙",
    color: "text-purple-400",
    badgeBg: "bg-purple-500/10 text-purple-300 border-purple-500/30",
    border: "border-purple-500/30",
    desc: "Repository metadata, branches, PRs & commit history",
  },
  "CI/CD Agent": {
    label: "CI/CD Agent",
    icon: "⚙️",
    color: "text-amber-400",
    badgeBg: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    border: "border-amber-500/30",
    desc: "Actions workflows, failure logs & root-cause correlation",
  },
  "Code Agent": {
    label: "Code / RAG Agent",
    icon: "⚡",
    color: "text-cyan-400",
    badgeBg: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
    border: "border-cyan-500/30",
    desc: "AST chunking, Chroma vector retrieval & security audits",
  },
  "PR Review Agent": {
    label: "PR Review Agent",
    icon: "🔍",
    color: "text-rose-400",
    badgeBg: "bg-rose-500/10 text-rose-300 border-rose-500/30",
    border: "border-rose-500/30",
    desc: "Inspects pull request diffs, code quality, and security risks",
  },
};

const SUGGESTED_PROMPTS = [
  { agent: "ci", icon: "⚙️", label: "CI Failure Analysis", query: "Why did the latest CI/CD workflow pipeline fail?" },
  { agent: "pr_review", icon: "🔍", label: "Automated PR Review", query: "Review the latest open pull request diff and suggest fixes" },
  { agent: "code", icon: "⚡", label: "Architecture Summary", query: "Explain the backend architecture and service layer in this repo" },
  { agent: "code", icon: "🛡️", label: "Security Audit", query: "Run a security scan on this repository for hardcoded secrets and flaws" },
  { agent: "github", icon: "🐙", label: "Branches & PRs", query: "Show repository branches, latest commits and pull requests" },
];

function formatTimestamp(): string {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatPanel({ token, prefillQuery, selectedRepoUrl, onSelectRepoUrl }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(prefillQuery || "");
  const [loading, setLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentType>("auto");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [openAccordions, setOpenAccordions] = useState<Record<number, boolean>>({});
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [currentRepoUrl, setCurrentRepoUrl] = useState<string>(selectedRepoUrl || "");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefillQuery) {
      setInput(prefillQuery);
    }
  }, [prefillQuery]);

  useEffect(() => {
    if (selectedRepoUrl) {
      setCurrentRepoUrl(selectedRepoUrl);
    }
  }, [selectedRepoUrl]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/repositories`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Repository[]) => {
        setRepositories(data);
        if (data.length > 0 && !currentRepoUrl && !selectedRepoUrl) {
          setCurrentRepoUrl(data[0].repo_url);
          if (onSelectRepoUrl) onSelectRepoUrl(data[0].repo_url);
        }
      })
      .catch(() => {});
  }, [token]);

  function toggleAccordion(index: number) {
    setOpenAccordions((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  }

  async function sendMessage(textToSend?: string) {
    const queryText = (textToSend || input).trim();
    if (!queryText || loading) return;

    const userMessage: Message = {
      role: "user",
      content: queryText,
      timestamp: formatTimestamp(),
    };

    const assistantPlaceholderIndex = messages.length + 1;
    const initialAssistantMessage: Message = {
      role: "assistant",
      content: "",
      agentName: selectedAgent === "auto" ? "Evaluating..." : selectedAgent.toUpperCase() + " Agent",
      timestamp: formatTimestamp(),
      steps: [],
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMessage, initialAssistantMessage]);
    setInput("");
    setLoading(true);
    setOpenAccordions((prev) => ({ ...prev, [assistantPlaceholderIndex]: true }));

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;

        fetch(`${API_BASE}/queries`, {
          method: "POST",
          headers,
          body: JSON.stringify({ query_text: queryText }),
        }).catch(() => {});
      }

      const payload: Record<string, any> = {
        message: queryText,
        repository_url: currentRepoUrl || undefined,
      };
      if (selectedAgent !== "auto") {
        payload["agent_type"] = selectedAgent;
      }

      const response = await fetch(`${API_BASE}/chat/stream`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok || !response.body) {
        throw new Error("Streaming endpoint unavailable");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let accumulatedContent = "";
      let accumulatedSteps: string[] = [];
      let finalAgentName = "Code Agent";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;

          try {
            const eventData = JSON.parse(trimmed.replace(/^data:\s*/, ""));

            if (eventData.type === "step") {
              accumulatedSteps = [...accumulatedSteps, eventData.step];
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === "assistant") {
                  next[next.length - 1] = {
                    ...last,
                    steps: accumulatedSteps,
                  };
                }
                return next;
              });
            } else if (eventData.type === "token") {
              accumulatedContent += eventData.content;
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === "assistant") {
                  next[next.length - 1] = {
                    ...last,
                    content: accumulatedContent,
                    isStreaming: true,
                  };
                }
                return next;
              });
            } else if (eventData.type === "done") {
              finalAgentName = eventData.agent_name;
              accumulatedContent = eventData.reply || accumulatedContent;
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === "assistant") {
                  next[next.length - 1] = {
                    ...last,
                    content: accumulatedContent,
                    agentName: finalAgentName,
                    isStreaming: false,
                  };
                }
                return next;
              });
            } else if (eventData.type === "error") {
              accumulatedContent += `\n\n⚠️ ${eventData.message}`;
            }
          } catch {
            // Ignore partial SSE parse
          }
        }
      }

      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") {
          next[next.length - 1] = {
            ...last,
            content: accumulatedContent || "No response produced.",
            agentName: finalAgentName,
            isStreaming: false,
          };
        }
        return next;
      });
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") {
          next[next.length - 1] = {
            ...last,
            content: "⚠️ Error connecting to Relay streaming backend. Please check server logs.",
            agentName: "System",
            isStreaming: false,
          };
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(text: string, index: number) {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  const cleanRepoLabel = currentRepoUrl
    ? currentRepoUrl.replace(/https?:\/\/github\.com\//, "").replace(/\.git$/, "")
    : "smartems";

  return (
    <div className="flex h-[calc(100vh-100px)] flex-col rounded-2xl glass-panel shadow-2xl overflow-hidden border border-white/10">
      {/* Header Bar */}
      <div className="border-b border-white/5 bg-[#0a0c13]/90 px-5 py-3 flex flex-wrap items-center justify-between gap-3 backdrop-blur-xl">
        {/* Active Repo Badge */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 font-bold border border-indigo-500/20 text-xs">
            📁
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-white tracking-wide truncate max-w-[200px] sm:max-w-xs">
                {cleanRepoLabel}
              </h2>
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 text-[9px] font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
                <span>Connected</span>
              </span>
            </div>
            <p className="text-[10px] text-gray-500">Live multi-agent intelligence</p>
          </div>
        </div>

        {/* Controls: Repo Selector & Agent Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Repository Selector */}
          <div className="flex items-center gap-1.5 rounded-xl bg-white/[0.04] px-2.5 py-1 border border-white/10 text-xs">
            <span className="text-indigo-400 text-xs">📁</span>
            <select
              value={currentRepoUrl}
              onChange={(e) => {
                setCurrentRepoUrl(e.target.value);
                if (onSelectRepoUrl) onSelectRepoUrl(e.target.value);
              }}
              className="bg-transparent text-gray-200 outline-none cursor-pointer text-xs font-medium max-w-[140px] sm:max-w-[180px] truncate"
            >
              <option value="" className="bg-gray-950 text-gray-400">
                Default (.env)
              </option>
              {repositories.map((repo) => (
                <option key={repo.id} value={repo.repo_url} className="bg-gray-950 text-white">
                  {repo.name} ({repo.repo_url.replace(/https?:\/\/github\.com\//, "")})
                </option>
              ))}
            </select>
          </div>

          {/* Agent Pills */}
          <div className="flex items-center gap-1 rounded-xl bg-white/[0.04] p-1 border border-white/5 text-xs">
            <button
              onClick={() => setSelectedAgent("auto")}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                selectedAgent === "auto"
                  ? "bg-indigo-600 text-white shadow-sm glow-indigo"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Auto-Route
            </button>
            <button
              onClick={() => setSelectedAgent("pr_review")}
              className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition flex items-center gap-1 ${
                selectedAgent === "pr_review"
                  ? "bg-rose-600 text-white shadow-sm glow-rose"
                  : "text-gray-400 hover:text-rose-300"
              }`}
            >
              🔍 PR Review
            </button>
            <button
              onClick={() => setSelectedAgent("github")}
              className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition flex items-center gap-1 ${
                selectedAgent === "github"
                  ? "bg-purple-600 text-white shadow-sm glow-purple"
                  : "text-gray-400 hover:text-purple-300"
              }`}
            >
              🐙 GitHub
            </button>
            <button
              onClick={() => setSelectedAgent("ci")}
              className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition flex items-center gap-1 ${
                selectedAgent === "ci"
                  ? "bg-amber-600 text-white shadow-sm glow-amber"
                  : "text-gray-400 hover:text-amber-300"
              }`}
            >
              ⚙️ CI/CD
            </button>
            <button
              onClick={() => setSelectedAgent("code")}
              className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition flex items-center gap-1 ${
                selectedAgent === "code"
                  ? "bg-cyan-600 text-white shadow-sm glow-blue"
                  : "text-gray-400 hover:text-cyan-300"
              }`}
            >
              ⚡ Code/RAG
            </button>
          </div>

          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="text-[11px] text-gray-500 hover:text-gray-300 px-2 py-1 transition"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Messages Stream Canvas */}
      <div className="flex-1 space-y-4 overflow-y-auto p-5 pr-3">
        {messages.length === 0 && (
          <div className="py-10 text-center max-w-2xl mx-auto">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600/20 text-indigo-400 mb-3 border border-indigo-500/30 shadow-lg glow-indigo text-xl">
              ⚡
            </div>
            <h3 className="text-base font-bold text-white">How can Relay assist your engineering workflow?</h3>
            <p className="mt-1 text-xs text-gray-400">
              Active Scope: <span className="text-indigo-400 font-semibold">{cleanRepoLabel}</span>. Select a prompt or ask any question.
            </p>

            {/* Quick Prompts */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
              {SUGGESTED_PROMPTS.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => sendMessage(p.query)}
                  className="rounded-xl glass-card p-3 text-xs text-gray-300 hover:text-white transition group border border-white/5 hover:border-indigo-500/30"
                >
                  <div className="flex items-center gap-1.5 font-semibold text-gray-200 mb-1">
                    <span>{p.icon}</span>
                    <span className="group-hover:text-indigo-300 transition">{p.label}</span>
                  </div>
                  <div className="text-[11px] text-gray-400 line-clamp-1">{p.query}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => {
          const config = message.agentName ? AGENT_CONFIGS[message.agentName] : null;
          const isAccordionOpen = openAccordions[index] ?? true;

          return (
            <div
              key={index}
              className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}
            >
              {message.role === "assistant" && message.agentName && (
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold border ${
                      config ? config.badgeBg : "bg-indigo-500/10 text-indigo-300 border-indigo-500/30"
                    }`}
                  >
                    <span>{config?.icon || "✦"}</span>
                    {message.agentName}
                  </span>
                  {message.timestamp && (
                    <span className="text-[10px] text-gray-500">{message.timestamp}</span>
                  )}
                </div>
              )}

              {/* Visual Reasoning Steps Accordion */}
              {message.role === "assistant" && message.steps && message.steps.length > 0 && (
                <div className="mb-2.5 w-full max-w-2xl rounded-xl border border-white/10 bg-[#0c0e15]/80 p-2.5 text-xs text-gray-300 shadow-sm backdrop-blur-md">
                  <button
                    onClick={() => toggleAccordion(index)}
                    className="flex items-center justify-between w-full text-[11px] font-medium text-gray-300 hover:text-white transition"
                  >
                    <div className="flex items-center gap-2">
                      {message.isStreaming ? (
                        <div className="h-2 w-2 rounded-full bg-indigo-500 animate-ping" />
                      ) : (
                        <span className="text-emerald-400 text-xs font-bold">✓</span>
                      )}
                      <span>
                        Reasoning & Execution ({message.steps.length} {message.steps.length === 1 ? "step" : "steps"})
                      </span>
                    </div>
                    <span className="text-gray-500 text-[10px]">{isAccordionOpen ? "Hide ▲" : "Show ▼"}</span>
                  </button>

                  {isAccordionOpen && (
                    <div className="mt-2 space-y-1 border-t border-white/5 pt-2 pl-2 text-[11px] font-mono text-gray-400">
                      {message.steps.map((step, sIdx) => (
                        <div key={sIdx} className="flex items-start gap-1.5">
                          <span className="text-indigo-400 select-none">›</span>
                          <span className="leading-tight">{step}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Message Content Container */}
              <div
                className={`relative group rounded-2xl px-4 py-3 text-xs md:text-sm leading-relaxed max-w-3xl whitespace-pre-wrap break-words ${
                  message.role === "user"
                    ? "bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 text-white rounded-br-none shadow-lg glow-indigo"
                    : "bg-[#0c0e16]/90 border border-white/10 text-gray-200 rounded-bl-none shadow-md"
                }`}
              >
                {message.content || (message.isStreaming && (
                  <span className="text-gray-500 italic">Thinking and synthesizing response...</span>
                ))}

                {message.role === "assistant" && message.content && (
                  <button
                    onClick={() => handleCopy(message.content, index)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition rounded px-1.5 py-0.5 bg-gray-800/80 text-[10px] text-gray-300 hover:text-white border border-gray-700"
                  >
                    {copiedIndex === index ? "Copied ✓" : "Copy"}
                  </button>
                )}
              </div>

              {message.role === "user" && message.timestamp && (
                <span className="mt-1 text-[10px] text-gray-500 mr-1">{message.timestamp}</span>
              )}
            </div>
          );
        })}

        {loading && (
          <div className="flex items-center gap-2.5 text-xs text-indigo-400 py-2 px-1">
            <div className="flex space-x-1">
              <div className="h-2 w-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="h-2 w-2 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="h-2 w-2 bg-cyan-500 rounded-full animate-bounce"></div>
            </div>
            <span className="text-gray-400 text-xs font-medium">Relay multi-agent reasoning active...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Bottom Input Bar */}
      <div className="border-t border-white/5 bg-[#0a0c13]/95 p-3 backdrop-blur-xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex items-center gap-2 rounded-2xl border border-white/10 bg-gray-900/90 px-3 py-2 focus-within:border-indigo-500/60 focus-within:ring-1 focus-within:ring-indigo-500/40 transition"
        >
          <button
            type="button"
            onClick={() => sendMessage("Run a full repository security scan and check open PRs")}
            className="text-gray-400 hover:text-white p-1 text-xs"
            title="Quick Action"
          >
            📎
          </button>
          <input
            className="flex-1 bg-transparent text-xs md:text-sm text-white placeholder-gray-500 outline-none"
            placeholder={
              selectedAgent === "auto"
                ? `Ask anything about ${cleanRepoLabel}...`
                : `Querying ${selectedAgent.toUpperCase()} Agent directly for ${cleanRepoLabel}...`
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-xs font-bold text-white hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 transition shadow-md glow-indigo flex items-center gap-1"
          >
            <span>Send</span>
            <span>➤</span>
          </button>
        </form>
      </div>
    </div>
  );
}
