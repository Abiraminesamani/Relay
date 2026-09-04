"use client";

import { useState } from "react";
import { User } from "./AuthPanel";

type HomeOverviewProps = {
  user: User;
  token: string;
  activeRepoName: string;
  activeRepoUrl: string;
  onLaunchCopilotQuery: (query: string, agentType?: string) => void;
  onNavigateToTab: (tab: "chat" | "repos" | "queries" | "settings") => void;
};

const QUICK_ACTIONS = [
  {
    icon: "📝",
    title: "Review PR",
    desc: "Review latest pull request",
    agent: "pr_review",
    query: "Review the latest open pull request diff and suggest fixes",
    color: "from-rose-500/10 to-rose-500/5 hover:border-rose-500/30",
    badgeColor: "text-rose-400 bg-rose-500/10",
  },
  {
    icon: "⚙️",
    title: "CI/CD Analysis",
    desc: "Check pipeline status",
    agent: "ci",
    query: "Why did the latest CI/CD workflow pipeline fail?",
    color: "from-amber-500/10 to-amber-500/5 hover:border-amber-500/30",
    badgeColor: "text-amber-400 bg-amber-500/10",
  },
  {
    icon: "🏛️",
    title: "Architecture Review",
    desc: "Analyze system design",
    agent: "code",
    query: "Explain the backend architecture and service layer in this repo",
    color: "from-indigo-500/10 to-indigo-500/5 hover:border-indigo-500/30",
    badgeColor: "text-indigo-400 bg-indigo-500/10",
  },
  {
    icon: "🛡️",
    title: "Security Scan",
    desc: "Run security audit",
    agent: "code",
    query: "Run a security scan on this repository for hardcoded secrets and flaws",
    color: "from-cyan-500/10 to-cyan-500/5 hover:border-cyan-500/30",
    badgeColor: "text-cyan-400 bg-cyan-500/10",
  },
  {
    icon: "🔍",
    title: "Code Search",
    desc: "Search codebase",
    agent: "code",
    query: "Find where user authentication and JWT verification are implemented",
    color: "from-blue-500/10 to-blue-500/5 hover:border-blue-500/30",
    badgeColor: "text-blue-400 bg-blue-500/10",
  },
  {
    icon: "💬",
    title: "Ask Anything",
    desc: "AI-powered answer",
    agent: "auto",
    query: "Give me an overview of this repository and recent changes",
    color: "from-purple-500/10 to-purple-500/5 hover:border-purple-500/30",
    badgeColor: "text-purple-400 bg-purple-500/10",
  },
];

const RECENT_ACTIVITIES = [
  {
    icon: "⭐",
    title: "PR #142 merged",
    desc: "feat: add user authentication",
    time: "2h ago",
    type: "pr_merged",
    badgeBg: "text-emerald-400 bg-emerald-500/10",
  },
  {
    icon: "🟢",
    title: "CI/CD pipeline passed",
    desc: "main branch (Run #234)",
    time: "3h ago",
    type: "ci_pass",
    badgeBg: "text-emerald-400 bg-emerald-500/10",
  },
  {
    icon: "🔴",
    title: "Issue #78 closed",
    desc: "Fix memory leak in data parser",
    time: "5h ago",
    type: "issue_closed",
    badgeBg: "text-purple-400 bg-purple-500/10",
  },
  {
    icon: "🟣",
    title: "PR #141 opened",
    desc: "refactor: optimize database queries",
    time: "6h ago",
    type: "pr_opened",
    badgeBg: "text-indigo-400 bg-indigo-500/10",
  },
];

export default function HomeOverview({
  user,
  activeRepoName,
  activeRepoUrl,
  onLaunchCopilotQuery,
  onNavigateToTab,
}: HomeOverviewProps) {
  const [promptInput, setPromptInput] = useState("");
  const [isStarred, setIsStarred] = useState(true);

  const cleanRepoLabel = activeRepoName || "smartems";
  const cleanRepoCoordinates = activeRepoUrl
    ? activeRepoUrl.replace(/https?:\/\/github\.com\//, "").replace(/\.git$/, "")
    : "jaisreen/smartems";

  function handlePromptSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!promptInput.trim()) return;
    onLaunchCopilotQuery(promptInput.trim());
    setPromptInput("");
  }

  return (
    <div className="space-y-6 max-w-6xl w-full mx-auto pb-10">
      {/* Greeting Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Good morning, {user.name.split(" ")[0] || "Alex"}! 👋
          </h2>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            Your engineering assistant is ready to help
          </p>
        </div>

        <button
          onClick={() => onNavigateToTab("repos")}
          className="self-start sm:self-auto rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-gray-300 hover:bg-white/[0.08] hover:text-white transition flex items-center gap-1.5"
        >
          <span>📁 Manage Repositories</span>
          <span>→</span>
        </button>
      </div>

      {/* Top 4 Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Active Repo Card */}
        <div className="rounded-2xl glass-card p-4 relative overflow-hidden border border-white/10">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
            <span>Active Repository</span>
            <button
              onClick={() => setIsStarred(!isStarred)}
              className="text-sm text-amber-400 hover:scale-110 transition"
              title="Bookmark repository"
            >
              {isStarred ? "★" : "☆"}
            </button>
          </div>
          <div className="flex items-center gap-2.5 mt-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 font-bold border border-indigo-500/20 text-xs">
              📁
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white truncate">{cleanRepoLabel}</div>
              <div className="text-[11px] text-gray-400 truncate">{cleanRepoCoordinates}</div>
            </div>
          </div>
        </div>

        {/* Open PRs Card */}
        <div className="rounded-2xl glass-card p-4 relative overflow-hidden border border-white/10">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
            <span>Open PRs</span>
            <span className="text-xs text-purple-400">↗</span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-white">12</span>
            <span className="text-[11px] font-semibold text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-md px-1.5 py-0.5">
              +2 from yesterday
            </span>
          </div>
        </div>

        {/* CI/CD Status Card */}
        <div className="rounded-2xl glass-card p-4 relative overflow-hidden border border-white/10">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
            <span>CI/CD Status</span>
            <span className="text-xs text-emerald-400 font-bold">✓</span>
          </div>
          <div className="mt-1">
            <div className="text-lg font-bold text-emerald-400">All Green</div>
            <div className="text-[11px] text-gray-400">3 workflows passing</div>
          </div>
        </div>

        {/* Issues Card */}
        <div className="rounded-2xl glass-card p-4 relative overflow-hidden border border-white/10">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
            <span>Issues</span>
            <span className="text-xs text-amber-400">⚠️</span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-white">7</span>
            <span className="text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-1.5 py-0.5">
              2 high priority
            </span>
          </div>
        </div>
      </div>

      {/* Main 2-Column Grid: Quick Actions & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Quick Actions (Left 7 Columns) */}
        <div className="lg:col-span-7 space-y-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Quick Actions</h3>
            <span className="text-[11px] text-gray-500">Launch AI Agent</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {QUICK_ACTIONS.map((action, idx) => (
              <button
                key={idx}
                onClick={() => onLaunchCopilotQuery(action.query, action.agent)}
                className={`rounded-2xl glass-card p-3.5 text-left transition group border border-white/10 flex flex-col justify-between h-32 hover:scale-[1.02] ${action.color}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-base p-1.5 rounded-lg ${action.badgeColor}`}>{action.icon}</span>
                  <span className="text-xs text-gray-500 group-hover:text-white transition">→</span>
                </div>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-indigo-300 transition">
                    {action.title}
                  </div>
                  <div className="text-[10px] text-gray-400 line-clamp-1 mt-0.5">{action.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Recent Activity Feed (Right 5 Columns) */}
        <div className="lg:col-span-5 rounded-2xl glass-panel p-5 border border-white/10 flex flex-col justify-between shadow-xl">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Recent Activity</h3>
              <button
                onClick={() => onNavigateToTab("repos")}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium transition"
              >
                View all
              </button>
            </div>

            <div className="space-y-3">
              {RECENT_ACTIVITIES.map((item, idx) => (
                <div key={idx} className="flex items-start justify-between gap-3 text-xs">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="text-xs mt-0.5">{item.icon}</span>
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-200 truncate">{item.title}</div>
                      <div className="text-[11px] text-gray-400 truncate">{item.desc}</div>
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-500 whitespace-nowrap">{item.time}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 mt-3 border-t border-white/5">
            <button
              onClick={() => onLaunchCopilotQuery("Summarize the latest 5 commits, open pull requests, and CI status")}
              className="w-full rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 py-2 text-xs font-semibold text-gray-300 hover:text-white transition text-center"
            >
              🤖 Generate AI Activity Summary
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Universal Floating Prompt Bar */}
      <div className="rounded-2xl glass-panel-deep p-3.5 border border-white/10 shadow-2xl">
        <form onSubmit={handlePromptSubmit} className="flex items-center gap-3">
          <span className="text-base text-indigo-400 pl-2">✦</span>
          <input
            type="text"
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            placeholder="Ask Relay anything about your code, deployments, or workflows..."
            className="flex-1 bg-transparent text-xs sm:text-sm text-white placeholder-gray-500 outline-none"
          />
          <button
            type="submit"
            disabled={!promptInput.trim()}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-4 py-2 text-xs font-bold transition shadow-md glow-indigo flex items-center gap-1.5"
          >
            <span>Send</span>
            <span>➤</span>
          </button>
        </form>
      </div>
    </div>
  );
}
