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
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Send,
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
  onNavigateToTab: (tab: "home" | "chat" | "code" | "architecture" | "repos" | "integrations" | "queries" | "settings") => void;
};

const QUICK_ACTIONS = [
  {
    icon: GitPullRequest,
    title: "Review PR",
    desc: "Review latest pull request diff",
    agent: "pr_review",
    query: "Review the latest open pull request diff and suggest fixes",
  },
  {
    icon: Workflow,
    title: "CI/CD Analysis",
    desc: "Diagnose pipeline build runs",
    agent: "ci",
    query: "Why did the latest CI/CD workflow pipeline fail?",
  },
  {
    icon: Layers,
    title: "Architecture Review",
    desc: "Analyze system design & layers",
    agent: "code",
    query: "Explain the backend architecture and service layer in this repo",
  },
  {
    icon: ShieldAlert,
    title: "Security Audit",
    desc: "Scan repository vulnerabilities",
    agent: "code",
    query: "Run a security scan on this repository for hardcoded secrets and flaws",
  },
  {
    icon: Search,
    title: "Code Search",
    desc: "Semantic AST vector search",
    agent: "code",
    query: "Find where user authentication and API controllers are implemented",
  },
  {
    icon: Sparkles,
    title: "Ask Anything",
    desc: "Multi-agent autonomous triage",
    agent: "auto",
    query: "Give me an overview of this repository and recent changes",
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
        return <GitPullRequest className="w-3.5 h-3.5 text-[#8B8F98] mt-0.5 flex-shrink-0" />;
      case "ci":
        return <CheckCircle2 className="w-3.5 h-3.5 text-[#22C55E] mt-0.5 flex-shrink-0" />;
      case "issue":
        return <AlertCircle className="w-3.5 h-3.5 text-[#F59E0B] mt-0.5 flex-shrink-0" />;
      default:
        return <Activity className="w-3.5 h-3.5 text-[#8B8F98] mt-0.5 flex-shrink-0" />;
    }
  }

  return (
    <div className="space-y-6 max-w-6xl w-full mx-auto pb-10">
      {/* Greeting Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#F5F5F5] tracking-tight">
            Welcome, {user.name.split(" ")[0] || "Developer"}
          </h2>
          <p className="text-xs text-[#8B8F98] mt-1">
            Engineering intelligence active & ready for codebase reasoning
          </p>
        </div>

        <button
          onClick={() => onNavigateToTab("repos")}
          className="self-start sm:self-auto rounded-lg border border-[#24262A] bg-[#111214] hover:bg-[#17181B] px-3.5 py-2 text-xs font-medium text-[#F5F5F5] transition flex items-center gap-2"
        >
          <FolderGit2 className="w-4 h-4 text-[#8B8F98]" />
          <span>Manage Repositories</span>
          <ArrowRight className="w-3.5 h-3.5 text-[#5C6068]" />
        </button>
      </div>

      {/* Main 2-Column Grid: Quick Actions & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Quick Actions (Left 7 Columns) */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[#8B8F98] uppercase tracking-wider">Quick Actions</h3>
            <span className="text-[11px] text-[#5C6068]">Autonomous Multi-Agent</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {QUICK_ACTIONS.map((action, idx) => {
              const IconComp = action.icon;
              return (
                <button
                  key={idx}
                  onClick={() => onLaunchCopilotQuery(action.query, action.agent)}
                  className="rounded-xl bg-[#111214] border border-[#24262A] p-3.5 text-left transition group flex flex-col justify-between h-28 hover:bg-[#17181B] hover:border-[#373A40]"
                >
                  <div className="flex items-center justify-between">
                    <div className="p-1.5 rounded-md bg-[#17181B] border border-[#24262A] text-[#8B8F98] group-hover:text-[#6366F1] transition">
                      <IconComp className="w-4 h-4" />
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-[#5C6068] group-hover:text-[#F5F5F5] transition group-hover:translate-x-0.5" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-[#F5F5F5] transition">
                      {action.title}
                    </div>
                    <div className="text-[10px] text-[#8B8F98] line-clamp-1 mt-0.5">{action.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Recent Activity Feed (Right 5 Columns) */}
        <div className="lg:col-span-5 rounded-xl bg-[#111214] p-4 border border-[#24262A] flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#24262A] mb-3">
              <h3 className="text-xs font-semibold text-[#8B8F98] uppercase tracking-wider">Recent Activity</h3>
              <button
                onClick={() => onNavigateToTab("repos")}
                className="text-[11px] text-[#8B8F98] hover:text-[#6366F1] font-medium transition flex items-center gap-1"
              >
                <span>View all</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-2.5">
              {activities.map((item, idx) => (
                <div key={idx} className="flex items-start justify-between gap-3 text-xs">
                  <div className="flex items-start gap-2.5 min-w-0">
                    {getActivityIcon(item.type)}
                    <div className="min-w-0">
                      <div className="font-medium text-[#F5F5F5] truncate">{item.title}</div>
                      <div className="text-[11px] text-[#8B8F98] truncate">{item.desc}</div>
                    </div>
                  </div>
                  <span className="text-[10px] text-[#5C6068] whitespace-nowrap">{item.time}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 mt-3 border-t border-[#24262A]">
            <button
              onClick={() => onLaunchCopilotQuery(`Summarize the latest commits, open pull requests, and CI status for ${cleanRepoLabel}`)}
              className="w-full rounded-lg bg-[#17181B] hover:bg-[#24262A] border border-[#24262A] py-2 text-xs font-medium text-[#F5F5F5] transition flex items-center justify-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#6366F1]" />
              <span>Generate AI Activity Summary</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Universal Floating Prompt Bar */}
      <div className="rounded-xl bg-[#111214] p-3 border border-[#24262A]">
        <form onSubmit={handlePromptSubmit} className="flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-[#8B8F98] pl-1 flex-shrink-0" />
          <input
            type="text"
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            placeholder={`Ask Relay anything about ${cleanRepoLabel}...`}
            className="flex-1 bg-transparent text-xs sm:text-sm text-[#F5F5F5] placeholder-[#5C6068] outline-none"
          />
          <button
            type="submit"
            disabled={!promptInput.trim()}
            className="rounded-md bg-[#6366F1] hover:bg-[#4F46E5] disabled:opacity-40 text-[#F5F5F5] px-4 py-2 text-xs font-semibold transition flex items-center gap-1.5"
          >
            <span>Send</span>
            <Send className="w-3 h-3" />
          </button>
        </form>
      </div>
    </div>
  );
}
