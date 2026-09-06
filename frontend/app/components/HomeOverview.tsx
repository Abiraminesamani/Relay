"use client";

import { useEffect, useState } from "react";
import { User } from "./AuthPanel";
import {
  GitPullRequest,
  Workflow,
  Layers,
  ShieldAlert,
  Search,
  Sparkles,
  FolderGit2,
  Star,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  GitMerge,
  ArrowRight,
  Send,
  ExternalLink,
  ChevronRight,
  Activity,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type LanguageStat = {
  name: string;
  bytes: number;
  percentage: number;
  color: string;
};

type ActivityEvent = {
  title: string;
  desc: string;
  time: string;
  type: string;
};

type CIStatusSummary = {
  status: string;
  passing_count: number;
  total_count: number;
  latest_run_name?: string;
  latest_conclusion?: string;
};

type RepositoryAnalytics = {
  repo_id: number;
  name: string;
  full_name: string;
  owner: string;
  repo_url: string;
  description?: string;
  default_branch: string;
  created_at?: string;
  stars: number;
  forks: number;
  open_issues: number;
  open_prs_count: number;
  total_prs_count: number;
  ci_status: CIStatusSummary;
  languages: LanguageStat[];
  recent_activities: ActivityEvent[];
  chunks_indexed: number;
};

type HomeOverviewProps = {
  user: User;
  token: string;
  activeRepoId?: number | null;
  activeRepoName: string;
  activeRepoUrl: string;
  onLaunchCopilotQuery: (query: string, agentType?: string) => void;
  onNavigateToTab: (tab: "home" | "chat" | "repos" | "queries" | "settings") => void;
};

const QUICK_ACTIONS = [
  {
    icon: GitPullRequest,
    title: "Review PR",
    desc: "Review latest pull request diff",
    agent: "pr_review",
    query: "Review the latest open pull request diff and suggest fixes",
    color: "from-rose-500/10 to-rose-500/5 hover:border-rose-500/30",
    badgeColor: "text-rose-400 bg-rose-500/10",
  },
  {
    icon: Workflow,
    title: "CI/CD Analysis",
    desc: "Diagnose pipeline build runs",
    agent: "ci",
    query: "Why did the latest CI/CD workflow pipeline fail?",
    color: "from-amber-500/10 to-amber-500/5 hover:border-amber-500/30",
    badgeColor: "text-amber-400 bg-amber-500/10",
  },
  {
    icon: Layers,
    title: "Architecture Review",
    desc: "Analyze system design & layers",
    agent: "code",
    query: "Explain the backend architecture and service layer in this repo",
    color: "from-indigo-500/10 to-indigo-500/5 hover:border-indigo-500/30",
    badgeColor: "text-indigo-400 bg-indigo-500/10",
  },
  {
    icon: ShieldAlert,
    title: "Security Audit",
    desc: "Scan repository vulnerabilities",
    agent: "code",
    query: "Run a security scan on this repository for hardcoded secrets and flaws",
    color: "from-cyan-500/10 to-cyan-500/5 hover:border-cyan-500/30",
    badgeColor: "text-cyan-400 bg-cyan-500/10",
  },
  {
    icon: Search,
    title: "Code Search",
    desc: "Semantic AST vector search",
    agent: "code",
    query: "Find where user authentication and API controllers are implemented",
    color: "from-blue-500/10 to-blue-500/5 hover:border-blue-500/30",
    badgeColor: "text-blue-400 bg-blue-500/10",
  },
  {
    icon: Sparkles,
    title: "Ask Anything",
    desc: "Multi-agent autonomous triage",
    agent: "auto",
    query: "Give me an overview of this repository and recent changes",
    color: "from-purple-500/10 to-purple-500/5 hover:border-purple-500/30",
    badgeColor: "text-purple-400 bg-purple-500/10",
  },
];

export default function HomeOverview({
  user,
  token,
  activeRepoId,
  activeRepoName,
  activeRepoUrl,
  onLaunchCopilotQuery,
  onNavigateToTab,
}: HomeOverviewProps) {
  const [promptInput, setPromptInput] = useState("");
  const [isStarred, setIsStarred] = useState(true);
  const [analytics, setAnalytics] = useState<RepositoryAnalytics | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  useEffect(() => {
    if (!token || !activeRepoId) return;
    setLoadingAnalytics(true);
    fetch(`${API_BASE}/repositories/${activeRepoId}/analytics`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: RepositoryAnalytics | null) => {
        if (data) setAnalytics(data);
      })
      .catch(() => {})
      .finally(() => setLoadingAnalytics(false));
  }, [token, activeRepoId]);

  const cleanRepoLabel = analytics?.name || activeRepoName || "smartems";
  const cleanRepoCoordinates = analytics?.full_name || (activeRepoUrl
    ? activeRepoUrl.replace(/https?:\/\/github\.com\//, "").replace(/\.git$/, "")
    : "jaisreen/smartems");

  const openPRs = analytics ? analytics.open_prs_count : 12;
  const issuesCount = analytics ? analytics.open_issues : 7;
  const ciStatus = analytics ? analytics.ci_status.status : "All Green";
  const ciSubtext = analytics
    ? `${analytics.ci_status.passing_count} workflows passing`
    : "3 workflows passing";

  const activities = analytics?.recent_activities?.length
    ? analytics.recent_activities
    : [
        { title: "PR #142 merged", desc: "feat: add user authentication", time: "2h ago", type: "pr" },
        { title: "CI/CD pipeline passed", desc: "main branch (Run #234)", time: "3h ago", type: "ci" },
        { title: "Issue #78 closed", desc: "Fix memory leak in data parser", time: "5h ago", type: "issue" },
        { title: "PR #141 opened", desc: "refactor: optimize database queries", time: "6h ago", type: "pr" },
      ];

  function handlePromptSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!promptInput.trim()) return;
    onLaunchCopilotQuery(promptInput.trim());
    setPromptInput("");
  }

  function getActivityIcon(type: string) {
    switch (type) {
      case "pr":
        return <GitPullRequest className="w-3.5 h-3.5 text-purple-400 mt-0.5 flex-shrink-0" />;
      case "ci":
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />;
      case "issue":
        return <AlertCircle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />;
      default:
        return <Activity className="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />;
    }
  }

  return (
    <div className="space-y-6 max-w-6xl w-full mx-auto pb-10">
      {/* Greeting Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Welcome, {user.name.split(" ")[0] || "Developer"}
          </h2>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            Engineering intelligence active & ready for codebase reasoning
          </p>
        </div>

        <button
          onClick={() => onNavigateToTab("repos")}
          className="self-start sm:self-auto rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-gray-300 hover:bg-white/[0.08] hover:text-white transition flex items-center gap-2"
        >
          <FolderGit2 className="w-4 h-4 text-indigo-400" />
          <span>Manage Repositories</span>
          <ArrowRight className="w-3.5 h-3.5 text-gray-500" />
        </button>
      </div>

      {/* Top 4 Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Active Repo Card */}
        <div className="rounded-2xl glass-card p-4 relative overflow-hidden border border-white/10">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
            <span className="font-medium">Active Repository</span>
            <button
              onClick={() => setIsStarred(!isStarred)}
              className="text-amber-400 hover:scale-110 transition"
              title="Bookmark repository"
            >
              <Star className={`w-3.5 h-3.5 ${isStarred ? "fill-amber-400 text-amber-400" : "text-gray-500"}`} />
            </button>
          </div>
          <div className="flex items-center gap-2.5 mt-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 font-bold border border-indigo-500/20 text-xs">
              <FolderGit2 className="w-4 h-4 text-indigo-400" />
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
            <span className="font-medium">Open Pull Requests</span>
            <GitPullRequest className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-white">{openPRs}</span>
            <span className="text-[11px] font-semibold text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-md px-1.5 py-0.5">
              {openPRs > 0 ? `+${openPRs} active` : "up to date"}
            </span>
          </div>
        </div>

        {/* CI/CD Status Card */}
        <div className="rounded-2xl glass-card p-4 relative overflow-hidden border border-white/10">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
            <span className="font-medium">CI/CD Pipeline</span>
            {ciStatus === "All Green" ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            )}
          </div>
          <div className="mt-1">
            <div className={`text-lg font-bold ${ciStatus === "All Green" ? "text-emerald-400" : "text-rose-400"}`}>
              {ciStatus}
            </div>
            <div className="text-[11px] text-gray-400">{ciSubtext}</div>
          </div>
        </div>

        {/* Issues Card */}
        <div className="rounded-2xl glass-card p-4 relative overflow-hidden border border-white/10">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
            <span className="font-medium">Open Issues</span>
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-white">{issuesCount}</span>
            <span className="text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-1.5 py-0.5">
              {issuesCount > 0 ? `${issuesCount} open` : "zero open"}
            </span>
          </div>
        </div>
      </div>

      {/* Main 2-Column Grid: Quick Actions & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Quick Actions (Left 7 Columns) */}
        <div className="lg:col-span-7 space-y-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Quick Actions</h3>
            <span className="text-[11px] text-gray-500">Autonomous Agents</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {QUICK_ACTIONS.map((action, idx) => {
              const IconComp = action.icon;
              return (
                <button
                  key={idx}
                  onClick={() => onLaunchCopilotQuery(action.query, action.agent)}
                  className={`rounded-2xl glass-card p-3.5 text-left transition group border border-white/10 flex flex-col justify-between h-32 hover:scale-[1.02] ${action.color}`}
                >
                  <div className="flex items-center justify-between">
                    <div className={`p-2 rounded-xl ${action.badgeColor}`}>
                      <IconComp className="w-4 h-4" />
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-500 group-hover:text-white transition group-hover:translate-x-0.5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white group-hover:text-indigo-300 transition">
                      {action.title}
                    </div>
                    <div className="text-[10px] text-gray-400 line-clamp-1 mt-0.5">{action.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Recent Activity Feed (Right 5 Columns) */}
        <div className="lg:col-span-5 rounded-2xl glass-panel p-5 border border-white/10 flex flex-col justify-between shadow-xl">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Recent Activity</h3>
              <button
                onClick={() => onNavigateToTab("repos")}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium transition flex items-center gap-1"
              >
                <span>View all</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-3">
              {activities.map((item, idx) => (
                <div key={idx} className="flex items-start justify-between gap-3 text-xs">
                  <div className="flex items-start gap-2.5 min-w-0">
                    {getActivityIcon(item.type)}
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
              onClick={() => onLaunchCopilotQuery(`Summarize the latest commits, open pull requests, and CI status for ${cleanRepoLabel}`)}
              className="w-full rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 py-2.5 text-xs font-semibold text-gray-300 hover:text-white transition flex items-center justify-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Generate AI Activity Summary</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Universal Floating Prompt Bar */}
      <div className="rounded-2xl glass-panel-deep p-3.5 border border-white/10 shadow-2xl">
        <form onSubmit={handlePromptSubmit} className="flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-indigo-400 pl-1 flex-shrink-0" />
          <input
            type="text"
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            placeholder={`Ask Relay anything about ${cleanRepoLabel}...`}
            className="flex-1 bg-transparent text-xs sm:text-sm text-white placeholder-gray-500 outline-none"
          />
          <button
            type="submit"
            disabled={!promptInput.trim()}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-4 py-2 text-xs font-bold transition shadow-md glow-indigo flex items-center gap-1.5"
          >
            <span>Send</span>
            <Send className="w-3 h-3" />
          </button>
        </form>
      </div>
    </div>
  );
}
