"use client";

import { useEffect, useRef, useState } from "react";
import {
  GitPullRequest,
  Workflow,
  Zap,
  Search,
  GitBranch,
  ShieldAlert,
  Layers,
  CheckCircle2,
  AlertTriangle,
  FolderGit2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Send,
  Paperclip,
  Trash2,
  Sparkles,
  Bot,
  Code2,
  MessageSquare,
  Kanban,
  Hash,
  Share2,
} from "lucide-react";

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
  jira_project_key?: string | null;
  has_slack_webhook?: boolean;
  slack_webhook_masked?: string | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type ChatPanelProps = {
  token?: string;
  prefillQuery?: string;
  selectedRepoUrl?: string;
  onSelectRepoUrl?: (url: string) => void;
};

type AgentType = "auto" | "github" | "ci" | "code" | "pr_review" | "slack" | "jira";

const AGENT_CONFIGS: Record<
  string,
  { label: string; icon: any; color: string; badgeBg: string; border: string; desc: string }
> = {
  "GitHub Agent": {
    label: "GitHub Agent",
    icon: GitBranch,
    color: "text-[#8B8F98]",
    badgeBg: "bg-[#17181B] text-[#F5F5F5] border-[#24262A]",
    border: "border-[#24262A]",
    desc: "Repository metadata, branches, PRs & commit history",
  },
  "CI/CD Agent": {
    label: "CI/CD Agent",
    icon: Workflow,
    color: "text-[#8B8F98]",
    badgeBg: "bg-[#17181B] text-[#F5F5F5] border-[#24262A]",
    border: "border-[#24262A]",
    desc: "Actions workflows, failure logs & root-cause correlation",
  },
  "Code Agent": {
    label: "Code / RAG Agent",
    icon: Zap,
    color: "text-[#8B8F98]",
    badgeBg: "bg-[#17181B] text-[#F5F5F5] border-[#24262A]",
    border: "border-[#24262A]",
    desc: "AST chunking, Chroma vector retrieval & security audits",
  },
  "PR Review Agent": {
    label: "PR Review Agent",
    icon: GitPullRequest,
    color: "text-[#8B8F98]",
    badgeBg: "bg-[#17181B] text-[#F5F5F5] border-[#24262A]",
    border: "border-[#24262A]",
    desc: "Inspects pull request diffs, code quality, and security risks",
  },
  "Slack Agent": {
    label: "Slack Agent",
    icon: MessageSquare,
    color: "text-[#8B8F98]",
    badgeBg: "bg-[#17181B] text-[#F5F5F5] border-[#24262A]",
    border: "border-[#24262A]",
    desc: "Dispatches alerts, channel notifications, Block Kit payloads, and incident summaries",
  },
  "Jira Agent": {
    label: "Jira Agent",
    icon: Kanban,
    color: "text-[#8B8F98]",
    badgeBg: "bg-[#17181B] text-[#F5F5F5] border-[#24262A]",
    border: "border-[#24262A]",
    desc: "Creates Bug & Task tickets, tracks sprint backlogs, and manages issue priorities",
  },
};

const SUGGESTED_PROMPTS = [
  { agent: "slack", icon: MessageSquare, label: "Slack Incident Alert", query: "Send a Slack incident broadcast to #dev-alerts about high blast radius in smartems-frontend/src/index.js" },
  { agent: "jira", icon: Kanban, label: "Create Jira Bug Ticket", query: "Create a High Priority Jira Bug ticket for critical regression in login authentication flow" },
  { agent: "ci", icon: Workflow, label: "CI Failure Analysis", query: "Why did the latest CI/CD workflow pipeline fail?" },
  { agent: "pr_review", icon: GitPullRequest, label: "Automated PR Review", query: "Review the latest open pull request diff and suggest fixes" },
  { agent: "code", icon: Layers, label: "Architecture Summary", query: "Explain the backend architecture and service layer in this repo" },
  { agent: "code", icon: ShieldAlert, label: "Security Audit", query: "Run a security scan on this repository for hardcoded secrets and flaws" },
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
              accumulatedContent += `\n\n[Error] ${eventData.message}`;
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
            content: "Error connecting to Relay streaming backend. Please check server logs.",
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
    <div className="flex h-[calc(100vh-90px)] flex-col rounded-xl bg-[#0C0D0F] shadow-xl overflow-hidden border border-[#24262A]">
      {/* Header Bar */}
      <div className="border-b border-[#24262A] bg-[#0C0D0F] px-5 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Active Repo Badge */}
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#111214] text-[#6366F1] font-semibold border border-[#24262A] text-xs">
            <FolderGit2 className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold text-[#F5F5F5] tracking-wide truncate max-w-[200px] sm:max-w-xs">
                {cleanRepoLabel}
              </h2>
              <span className="flex items-center gap-1 rounded-full bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20 px-2 py-0.5 text-[9px] font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E] animate-pulse-dot" />
                <span>Connected</span>
              </span>
            </div>
            <p className="text-[10px] text-[#8B8F98]">Live multi-agent intelligence</p>
          </div>
        </div>

        {/* Controls: Repo Selector & Agent Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Repository Selector */}
          <div className="flex items-center gap-1.5 rounded-lg bg-[#111214] px-2.5 py-1.5 border border-[#24262A] text-xs">
            <FolderGit2 className="w-3.5 h-3.5 text-[#8B8F98]" />
            <select
              value={currentRepoUrl}
              onChange={(e) => {
                setCurrentRepoUrl(e.target.value);
                if (onSelectRepoUrl) onSelectRepoUrl(e.target.value);
              }}
              className="bg-transparent text-[#F5F5F5] outline-none cursor-pointer text-xs font-medium max-w-[140px] sm:max-w-[180px] truncate"
            >
              <option value="" className="bg-[#111214] text-[#8B8F98]">
                Default (.env)
              </option>
              {repositories.map((repo) => (
                <option key={repo.id} value={repo.repo_url} className="bg-[#111214] text-[#F5F5F5]">
                  {repo.name} ({repo.repo_url.replace(/https?:\/\/github\.com\//, "")}){repo.jira_project_key ? ` • [Jira: ${repo.jira_project_key}]` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Agent Pills */}
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#111214] p-1 border border-[#24262A] text-xs">
            <button
              onClick={() => setSelectedAgent("auto")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                selectedAgent === "auto"
                  ? "bg-[#6366F1] text-[#F5F5F5]"
                  : "text-[#8B8F98] hover:bg-[#17181B] hover:text-[#F5F5F5]"
              }`}
            >
              Auto-Route
            </button>
            <button
              onClick={() => setSelectedAgent("slack")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition flex items-center gap-1.5 ${
                selectedAgent === "slack"
                  ? "bg-[#6366F1] text-[#F5F5F5]"
                  : "text-[#8B8F98] hover:bg-[#17181B] hover:text-[#F5F5F5]"
              }`}
            >
              <MessageSquare className="w-3 h-3" />
              <span>Slack</span>
            </button>
            <button
              onClick={() => setSelectedAgent("jira")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition flex items-center gap-1.5 ${
                selectedAgent === "jira"
                  ? "bg-[#6366F1] text-[#F5F5F5]"
                  : "text-[#8B8F98] hover:bg-[#17181B] hover:text-[#F5F5F5]"
              }`}
            >
              <Kanban className="w-3 h-3" />
              <span>Jira</span>
            </button>
            <button
              onClick={() => setSelectedAgent("pr_review")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition flex items-center gap-1.5 ${
                selectedAgent === "pr_review"
                  ? "bg-[#6366F1] text-[#F5F5F5]"
                  : "text-[#8B8F98] hover:bg-[#17181B] hover:text-[#F5F5F5]"
              }`}
            >
              <GitPullRequest className="w-3 h-3" />
              <span>PR Review</span>
            </button>
            <button
              onClick={() => setSelectedAgent("github")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition flex items-center gap-1.5 ${
                selectedAgent === "github"
                  ? "bg-[#6366F1] text-[#F5F5F5]"
                  : "text-[#8B8F98] hover:bg-[#17181B] hover:text-[#F5F5F5]"
              }`}
            >
              <GitBranch className="w-3 h-3" />
              <span>GitHub</span>
            </button>
            <button
              onClick={() => setSelectedAgent("ci")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition flex items-center gap-1.5 ${
                selectedAgent === "ci"
                  ? "bg-[#6366F1] text-[#F5F5F5]"
                  : "text-[#8B8F98] hover:bg-[#17181B] hover:text-[#F5F5F5]"
              }`}
            >
              <Workflow className="w-3 h-3" />
              <span>CI/CD</span>
            </button>
            <button
              onClick={() => setSelectedAgent("code")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition flex items-center gap-1.5 ${
                selectedAgent === "code"
                  ? "bg-[#6366F1] text-[#F5F5F5]"
                  : "text-[#8B8F98] hover:bg-[#17181B] hover:text-[#F5F5F5]"
              }`}
            >
              <Zap className="w-3 h-3" />
              <span>Code/RAG</span>
            </button>
          </div>

          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="text-[11px] text-[#8B8F98] hover:text-[#F5F5F5] px-2 py-1 transition flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages Stream Canvas */}
      <div className="flex-1 space-y-4 overflow-y-auto p-5 pr-3 bg-[#08090A]">
        {messages.length === 0 && (
          <div className="py-12 text-center max-w-2xl mx-auto">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#111214] text-[#6366F1] mb-3 border border-[#24262A]">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-[#F5F5F5]">How can Relay assist your engineering workflow?</h3>
            <p className="mt-1 text-xs text-[#8B8F98]">
              Active Scope: <span className="text-[#F5F5F5] font-medium">{cleanRepoLabel}</span>. Select a prompt or ask any question.
            </p>

            {/* Quick Prompts */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
              {SUGGESTED_PROMPTS.map((p, idx) => {
                const IconComponent = p.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => sendMessage(p.query)}
                    className="rounded-lg bg-[#111214] p-3 text-xs text-[#8B8F98] hover:text-[#F5F5F5] transition group border border-[#24262A] hover:bg-[#17181B] hover:border-[#373A40]"
                  >
                    <div className="flex items-center gap-2 font-medium text-[#F5F5F5] mb-1">
                      <IconComponent className="w-3.5 h-3.5 text-[#8B8F98] group-hover:text-[#6366F1] transition" />
                      <span>{p.label}</span>
                    </div>
                    <div className="text-[11px] text-[#8B8F98] line-clamp-1">{p.query}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {messages.map((message, index) => {
          const config = message.agentName ? AGENT_CONFIGS[message.agentName] : null;
          const isAccordionOpen = openAccordions[index] ?? true;
          const IconComp = config?.icon || Sparkles;

          return (
            <div
              key={index}
              className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}
            >
              {message.role === "assistant" && message.agentName && (
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-medium border ${
                      config ? config.badgeBg : "bg-[#17181B] text-[#F5F5F5] border-[#24262A]"
                    }`}
                  >
                    <IconComp className="w-3 h-3 text-[#8B8F98]" />
                    <span>{message.agentName}</span>
                  </span>
                  {message.timestamp && (
                    <span className="text-[10px] text-[#5C6068]">{message.timestamp}</span>
                  )}
                </div>
              )}

              {/* Visual Reasoning Steps Accordion */}
              {message.role === "assistant" && message.steps && message.steps.length > 0 && (
                <div className="mb-2.5 w-full max-w-2xl rounded-lg border border-[#24262A] bg-[#0C0D0F] p-2.5 text-xs text-[#8B8F98]">
                  <button
                    onClick={() => toggleAccordion(index)}
                    className="flex items-center justify-between w-full text-[11px] font-medium text-[#8B8F98] hover:text-[#F5F5F5] transition"
                  >
                    <div className="flex items-center gap-2">
                      {message.isStreaming ? (
                        <div className="h-2 w-2 rounded-full bg-[#6366F1] animate-ping" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#22C55E]" />
                      )}
                      <span className="text-[#F5F5F5]">
                        Reasoning & Execution ({message.steps.length} {message.steps.length === 1 ? "step" : "steps"})
                      </span>
                    </div>
                    <span className="text-[#5C6068] text-[10px] flex items-center gap-1">
                      <span>{isAccordionOpen ? "Hide" : "Show"}</span>
                      {isAccordionOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </span>
                  </button>

                  {isAccordionOpen && (
                    <div className="mt-2 space-y-1 border-t border-[#24262A] pt-2 pl-2 text-[11px] font-mono text-[#8B8F98]">
                      {message.steps.map((step, sIdx) => (
                        <div key={sIdx} className="flex items-start gap-1.5">
                          <span className="text-[#6366F1] select-none">›</span>
                          <span className="leading-tight">{step}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Message Content Container */}
              <div
                className={`relative group rounded-xl px-4 py-3 text-xs md:text-sm leading-relaxed max-w-3xl whitespace-pre-wrap break-words ${
                  message.role === "user"
                    ? "bg-[#6366F1] text-[#F5F5F5] rounded-br-none shadow-sm"
                    : "bg-[#111214] border border-[#24262A] text-[#F5F5F5] rounded-bl-none"
                }`}
              >
                {message.content || (message.isStreaming && (
                  <span className="text-[#8B8F98] italic">Synthesizing response with neural reasoning...</span>
                ))}

                {message.role === "assistant" && message.content && (
                  <button
                    onClick={() => handleCopy(message.content, index)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition rounded px-2 py-1 bg-[#17181B] text-[10px] text-[#8B8F98] hover:text-[#F5F5F5] border border-[#24262A] flex items-center gap-1"
                  >
                    {copiedIndex === index ? (
                      <>
                        <Check className="w-3 h-3 text-[#22C55E]" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {message.role === "user" && message.timestamp && (
                <span className="mt-1 text-[10px] text-[#5C6068] mr-1">{message.timestamp}</span>
              )}
            </div>
          );
        })}

        {loading && (
          <div className="flex items-center gap-2.5 text-xs text-[#6366F1] py-2 px-1">
            <div className="flex space-x-1">
              <div className="h-1.5 w-1.5 bg-[#6366F1] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="h-1.5 w-1.5 bg-[#6366F1] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="h-1.5 w-1.5 bg-[#6366F1] rounded-full animate-bounce"></div>
            </div>
            <span className="text-[#8B8F98] text-xs font-medium">Relay multi-agent reasoning active...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Bottom Input Bar */}
      <div className="border-t border-[#24262A] bg-[#0C0D0F] p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex items-center gap-2 rounded-lg border border-[#24262A] bg-[#111214] px-3 py-2 focus-within:border-[#6366F1] focus-within:ring-1 focus-within:ring-[#6366F1]/30 transition"
        >
          <button
            type="button"
            onClick={() => sendMessage("Run a full repository security scan and check open PRs")}
            className="text-[#8B8F98] hover:text-[#F5F5F5] p-1 text-xs transition"
            title="Quick Action"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            className="flex-1 bg-transparent text-xs md:text-sm text-[#F5F5F5] placeholder-[#5C6068] outline-none"
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
            className="rounded-md bg-[#6366F1] hover:bg-[#4F46E5] px-4 py-2 text-xs font-semibold text-[#F5F5F5] disabled:opacity-40 transition flex items-center gap-1.5"
          >
            <span>Send</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
