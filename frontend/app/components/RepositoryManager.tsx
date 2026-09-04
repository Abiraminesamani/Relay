"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export type Repository = {
  id: number;
  name: string;
  repo_url: string;
  added_at: string;
  user_id: number;
};

type LanguageStat = {
  name: string;
  bytes: number;
  percentage: number;
  color: string;
};

type MonthlyActivity = {
  month: string;
  commits: number;
};

type ActivityEvent = {
  icon: string;
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

type PullRequestItem = {
  number: number;
  title: string;
  state: string;
  html_url: string;
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
  activity_timeline: MonthlyActivity[];
  recent_activities: ActivityEvent[];
  pull_requests: PullRequestItem[];
  chunks_indexed: number;
};

type RepositoryManagerProps = {
  token: string;
  onSelectRepoForChat?: (repoName: string, repoUrl: string) => void;
};

function formatApiError(detail: any): string {
  if (!detail) return "Operation failed";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item: any) => {
        if (typeof item === "string") return item;
        if (item.msg) {
          const field = item.loc ? item.loc[item.loc.length - 1] : "";
          return field ? `${field}: ${item.msg}` : item.msg;
        }
        return JSON.stringify(item);
      })
      .join(", ");
  }
  if (typeof detail === "object") {
    return detail.msg || detail.message || detail.detail || JSON.stringify(detail);
  }
  return String(detail);
}

export default function RepositoryManager({ token, onSelectRepoForChat }: RepositoryManagerProps) {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
  const [analytics, setAnalytics] = useState<RepositoryAnalytics | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSubTab, setActiveSubTab] = useState<"overview" | "analytics" | "prs" | "issues" | "settings">("overview");
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [indexingId, setIndexingId] = useState<number | null>(null);
  const [indexedStats, setIndexedStats] = useState<Record<number, { files: number; chunks: number }>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function fetchRepositories() {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/repositories`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load repositories");
      const data: Repository[] = await res.json();
      setRepositories(data);
      if (data.length > 0 && selectedRepoId === null) {
        setSelectedRepoId(data[0].id);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load repositories");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRepositories();
  }, []);

  // Fetch Live Analytics whenever selectedRepoId changes
  useEffect(() => {
    if (!token || !selectedRepoId) return;
    setLoadingAnalytics(true);
    fetch(`${API_BASE}/repositories/${selectedRepoId}/analytics`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: RepositoryAnalytics | null) => {
        if (data) setAnalytics(data);
      })
      .catch(() => {})
      .finally(() => setLoadingAnalytics(false));
  }, [token, selectedRepoId]);

  async function handleAddRepository(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/repositories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, repo_url: repoUrl }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(formatApiError(data.detail) || "Failed to add repository");

      setSuccess(`Repository '${data.name}' registered successfully!`);
      setName("");
      setRepoUrl("");
      setIsModalOpen(false);
      await fetchRepositories();
      setSelectedRepoId(data.id);
    } catch (err: any) {
      setError(err.message || "Error adding repository");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleIndexRepository(repo: Repository) {
    setIndexingId(repo.id);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/repositories/${repo.id}/index`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(formatApiError(data.detail) || "Indexing failed");

      setIndexedStats((prev) => ({
        ...prev,
        [repo.id]: { files: data.files_indexed || 0, chunks: data.chunks_indexed || 0 },
      }));
      setSuccess(`Successfully indexed ${data.files_indexed} files (${data.chunks_indexed} chunks) for '${repo.name}'!`);

      // Refresh analytics
      if (selectedRepoId === repo.id) {
        fetch(`${API_BASE}/repositories/${repo.id}/analytics`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((analyticsData) => {
            if (analyticsData) setAnalytics(analyticsData);
          });
      }
    } catch (err: any) {
      setError(err.message || "Failed to index repository");
    } finally {
      setIndexingId(null);
    }
  }

  async function handleDeleteRepository(id: number, repoName: string) {
    if (!confirm(`Are you sure you want to delete '${repoName}'?`)) return;

    try {
      const res = await fetch(`${API_BASE}/repositories/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(formatApiError(data.detail) || "Failed to delete repository");
      }

      setSuccess(`Repository '${repoName}' deleted.`);
      setRepositories((prev) => prev.filter((r) => r.id !== id));
      if (selectedRepoId === id) {
        const remaining = repositories.filter((r) => r.id !== id);
        setSelectedRepoId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err: any) {
      setError(err.message || "Error deleting repository");
    }
  }

  const filteredRepos = repositories.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.repo_url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedRepo = repositories.find((r) => r.id === selectedRepoId) || repositories[0];
  const isIndexing = selectedRepo ? indexingId === selectedRepo.id : false;

  // Language calculations for SVG Donut
  const languages = analytics?.languages || [
    { name: "Python", bytes: 4500, percentage: 45.0, color: "#3b82f6" },
    { name: "TypeScript", bytes: 2500, percentage: 25.0, color: "#8b5cf6" },
    { name: "JavaScript", bytes: 1500, percentage: 15.0, color: "#eab308" },
    { name: "HTML", bytes: 1000, percentage: 10.0, color: "#f43f5e" },
    { name: "Other", bytes: 500, percentage: 5.0, color: "#64748b" },
  ];

  return (
    <div className="space-y-6 max-w-6xl w-full mx-auto pb-10">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Repositories</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Manage and analyze your connected repositories
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 px-4 py-2.5 text-xs font-bold text-white hover:from-indigo-500 hover:to-purple-500 transition shadow-lg glow-indigo flex items-center gap-1.5 self-start sm:self-auto"
        >
          <span className="text-sm font-bold">+</span>
          <span>Add Repository</span>
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="rounded-xl bg-red-950/70 border border-red-800/60 p-3 text-xs text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl bg-emerald-950/70 border border-emerald-800/60 p-3 text-xs text-emerald-300">
          {success}
        </div>
      )}

      {/* Main 2-Column Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Repository Search & List (4 Columns) */}
        <div className="lg:col-span-4 rounded-2xl glass-panel p-4 border border-white/10 space-y-3 h-[calc(100vh-230px)] flex flex-col">
          {/* Search Input */}
          <div className="flex items-center gap-2 rounded-xl bg-gray-900/90 border border-white/10 px-3 py-2 text-xs">
            <span className="text-gray-500">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search repositories..."
              className="bg-transparent text-white placeholder-gray-500 outline-none w-full text-xs"
            />
          </div>

          {/* Repo List */}
          <div className="space-y-1.5 flex-1 overflow-y-auto pr-1">
            {loading ? (
              <div className="text-center py-8 text-xs text-gray-500">Loading repositories...</div>
            ) : filteredRepos.length === 0 ? (
              <div className="text-center py-8 text-xs text-gray-500">
                No repositories found. Click &quot;+ Add Repository&quot; to connect one.
              </div>
            ) : (
              filteredRepos.map((repo) => {
                const isSelected = repo.id === selectedRepoId;
                const cleanCoords = repo.repo_url.replace(/https?:\/\/github\.com\//, "").replace(/\.git$/, "");
                const stats = indexedStats[repo.id] || (isSelected && analytics ? { files: 0, chunks: analytics.chunks_indexed } : null);

                return (
                  <button
                    key={repo.id}
                    onClick={() => setSelectedRepoId(repo.id)}
                    className={`w-full text-left rounded-xl p-3 text-xs transition border flex items-center justify-between group ${
                      isSelected
                        ? "bg-indigo-600/15 border-indigo-500/40 shadow-sm"
                        : "bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${
                          isSelected
                            ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                            : "bg-gray-800/80 text-gray-400"
                        }`}
                      >
                        📁
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-white truncate">{repo.name}</div>
                        <div className="text-[10px] text-gray-400 truncate">{cleanCoords}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {stats && stats.chunks > 0 ? (
                        <span className="text-[9px] text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          {stats.chunks}c
                        </span>
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-dot" />
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Repository Insights & Analytics (8 Columns) */}
        {selectedRepo ? (
          <div className="lg:col-span-8 rounded-2xl glass-panel p-6 border border-white/10 space-y-6">
            {/* Repo Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 text-white font-bold shadow-md glow-indigo text-base">
                  📁
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white">{analytics?.name || selectedRepo.name}</h3>
                    <span className="text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                      {analytics?.default_branch || "main"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {analytics?.full_name || selectedRepo.repo_url.replace(/https?:\/\/github\.com\//, "").replace(/\.git$/, "")}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleIndexRepository(selectedRepo)}
                  disabled={isIndexing}
                  className="rounded-xl border border-cyan-500/30 bg-cyan-950/30 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-900/50 hover:text-white transition flex items-center gap-1.5 disabled:opacity-50"
                  title="Trigger tree-sitter chunking and vector indexing into ChromaDB"
                >
                  {isIndexing ? (
                    <>
                      <div className="h-3 w-3 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
                      <span>Indexing...</span>
                    </>
                  ) : (
                    <>
                      <span>⚡</span>
                      <span>Index RAG ({analytics?.chunks_indexed || 0}c)</span>
                    </>
                  )}
                </button>

                <a
                  href={selectedRepo.repo_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-gray-300 hover:bg-white/[0.08] hover:text-white transition flex items-center gap-1"
                >
                  <span>Open in GitHub</span>
                  <span>↗</span>
                </a>

                {onSelectRepoForChat && (
                  <button
                    onClick={() => onSelectRepoForChat(selectedRepo.name, selectedRepo.repo_url)}
                    className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition shadow-sm glow-indigo"
                  >
                    💬 Chat
                  </button>
                )}

                <button
                  onClick={() => handleDeleteRepository(selectedRepo.id, selectedRepo.name)}
                  className="rounded-xl border border-red-500/20 bg-red-950/20 px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-950/60 hover:text-red-200 transition"
                  title="Delete Repository"
                >
                  🗑
                </button>
              </div>
            </div>

            {/* Sub-Tabs */}
            <div className="flex items-center gap-1 border-b border-white/5 pb-2 text-xs font-semibold">
              {(["overview", "analytics", "prs", "issues", "settings"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveSubTab(tab)}
                  className={`rounded-lg px-3 py-1.5 capitalize transition ${
                    activeSubTab === tab
                      ? "bg-white/[0.08] text-white border border-white/10"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {tab === "prs" ? `PRs (${analytics?.total_prs_count || 0})` : tab}
                </button>
              ))}
            </div>

            {/* Sub-Tab 1: Overview */}
            {activeSubTab === "overview" && (
              <>
                {/* 4 Stat Metric Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl glass-card p-3.5 border border-white/10">
                    <div className="flex items-center justify-between text-[11px] text-gray-400">
                      <span>Stars</span>
                      <span className="text-amber-400">★</span>
                    </div>
                    <div className="text-xl font-bold text-white mt-1">{analytics?.stars ?? 0}</div>
                    <div className="text-[10px] text-emerald-400 mt-0.5">GitHub repository</div>
                  </div>

                  <div className="rounded-xl glass-card p-3.5 border border-white/10">
                    <div className="flex items-center justify-between text-[11px] text-gray-400">
                      <span>Forks</span>
                      <span className="text-indigo-400">⑂</span>
                    </div>
                    <div className="text-xl font-bold text-white mt-1">{analytics?.forks ?? 0}</div>
                    <div className="text-[10px] text-emerald-400 mt-0.5">Community forks</div>
                  </div>

                  <div className="rounded-xl glass-card p-3.5 border border-white/10">
                    <div className="flex items-center justify-between text-[11px] text-gray-400">
                      <span>Issues</span>
                      <span className="text-amber-400">⚠️</span>
                    </div>
                    <div className="text-xl font-bold text-white mt-1">{analytics?.open_issues ?? 0}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">open issues</div>
                  </div>

                  <div className="rounded-xl glass-card p-3.5 border border-white/10">
                    <div className="flex items-center justify-between text-[11px] text-gray-400">
                      <span>Pull Requests</span>
                      <span className="text-purple-400">↗</span>
                    </div>
                    <div className="text-xl font-bold text-white mt-1">{analytics?.total_prs_count ?? 0}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{analytics?.open_prs_count ?? 0} open</div>
                  </div>
                </div>

                {/* Visual Analytics Grid: Activity Chart & Languages Donut */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  {/* Activity Overview Spline Chart (7 Columns) */}
                  <div className="md:col-span-7 rounded-2xl glass-card p-4 border border-white/10 flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-white">Activity Overview</span>
                      <span className="text-[10px] text-gray-400 bg-white/[0.04] px-2 py-0.5 rounded border border-white/5">
                        Last 6 months ▼
                      </span>
                    </div>

                    {/* SVG Area Spline Curve */}
                    <div className="h-40 w-full relative pt-2">
                      <svg className="w-full h-full" viewBox="0 0 400 120" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="splineGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.45" />
                            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        <line x1="0" y1="20" x2="400" y2="20" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                        <line x1="0" y1="60" x2="400" y2="60" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                        <line x1="0" y1="100" x2="400" y2="100" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />

                        <path
                          d="M 0,90 Q 50,40 100,75 T 200,30 T 300,65 T 400,20 L 400,120 L 0,120 Z"
                          fill="url(#splineGradient)"
                        />
                        <path
                          d="M 0,90 Q 50,40 100,75 T 200,30 T 300,65 T 400,20"
                          fill="none"
                          stroke="#818cf8"
                          strokeWidth="2.5"
                        />
                        <circle cx="200" cy="30" r="4" fill="#a855f7" stroke="#ffffff" strokeWidth="1.5" />
                      </svg>
                      {/* Month Markers */}
                      <div className="flex items-center justify-between text-[9px] text-gray-500 pt-1">
                        <span>Jan</span>
                        <span>Feb</span>
                        <span>Mar</span>
                        <span>Apr</span>
                        <span>May</span>
                        <span>Jun</span>
                        <span>Jul</span>
                        <span>Aug</span>
                      </div>
                    </div>
                  </div>

                  {/* Languages Donut Chart (5 Columns) */}
                  <div className="md:col-span-5 rounded-2xl glass-card p-4 border border-white/10 flex flex-col justify-between">
                    <span className="text-xs font-bold text-white mb-2">Languages</span>

                    <div className="flex items-center justify-around gap-2 my-auto">
                      {/* SVG Donut Circle */}
                      <div className="relative h-28 w-28 flex items-center justify-center flex-shrink-0">
                        <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                          <circle cx="18" cy="18" r="14" fill="none" stroke="#1f2433" strokeWidth="4" />
                          {languages.slice(0, 4).map((lang, idx) => {
                            const offset = languages.slice(0, idx).reduce((acc, curr) => acc + curr.percentage, 0);
                            return (
                              <circle
                                key={idx}
                                cx="18"
                                cy="18"
                                r="14"
                                fill="none"
                                stroke={lang.color}
                                strokeWidth="4"
                                strokeDasharray={`${lang.percentage} 100`}
                                strokeDashoffset={-offset}
                              />
                            );
                          })}
                        </svg>
                        <div className="absolute text-center">
                          <div className="text-[11px] font-bold text-white">
                            {languages[0]?.percentage || 100}%
                          </div>
                          <div className="text-[8px] text-gray-400 truncate max-w-[50px]">
                            {languages[0]?.name || "Code"}
                          </div>
                        </div>
                      </div>

                      {/* Legend List */}
                      <div className="space-y-1.5 text-[10px]">
                        {languages.slice(0, 5).map((lang, idx) => (
                          <div key={idx} className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: lang.color }} />
                            <span className="text-gray-300 truncate max-w-[65px]">{lang.name}</span>
                            <span className="text-gray-500 ml-auto">{lang.percentage}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Sub-Tab 2: Analytics & Languages */}
            {activeSubTab === "analytics" && (
              <div className="space-y-4 text-xs">
                <div className="rounded-xl glass-card p-4 border border-white/10 space-y-3">
                  <h4 className="font-bold text-white">Language Breakdown (Live GitHub Bytes)</h4>
                  <div className="space-y-2">
                    {languages.map((l, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-gray-200 font-semibold">{l.name}</span>
                          <span className="text-gray-400">{l.percentage}% ({l.bytes.toLocaleString()} bytes)</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${l.percentage}%`, backgroundColor: l.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Sub-Tab 3: Pull Requests */}
            {activeSubTab === "prs" && (
              <div className="space-y-2">
                {analytics?.pull_requests?.length ? (
                  analytics.pull_requests.map((pr) => (
                    <div key={pr.number} className="rounded-xl glass-card p-3 border border-white/10 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-white">#{pr.number} {pr.title}</div>
                        <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          pr.state === "open" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                        }`}>
                          {pr.state.toUpperCase()}
                        </span>
                      </div>
                      {pr.html_url && (
                        <a href={pr.html_url} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline text-xs">
                          View on GitHub ↗
                        </a>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-gray-500 text-xs">No pull requests found for this repository.</div>
                )}
              </div>
            )}

            {/* Sub-Tab 4: Issues */}
            {activeSubTab === "issues" && (
              <div className="text-center py-8 text-xs text-gray-400">
                {analytics?.open_issues ? `There are ${analytics.open_issues} active open issues in this repository.` : "No open issues currently in this repository."}
              </div>
            )}

            {/* Sub-Tab 5: Settings */}
            {activeSubTab === "settings" && (
              <div className="space-y-3 text-xs">
                <div className="p-4 rounded-xl glass-card border border-white/10">
                  <h4 className="font-bold text-white mb-1">RAG Vector Storage</h4>
                  <p className="text-gray-400">ChromaDB collection: <code className="text-indigo-300">relay_{selectedRepo.name.toLowerCase()}</code> ({analytics?.chunks_indexed || 0} chunks)</p>
                </div>
                <div className="p-4 rounded-xl border border-red-500/20 bg-red-950/20">
                  <h4 className="font-bold text-red-300 mb-1">Danger Zone</h4>
                  <p className="text-gray-400 mb-3">Deleting this repository will remove its connected index and query mappings.</p>
                  <button onClick={() => handleDeleteRepository(selectedRepo.id, selectedRepo.name)} className="rounded-lg bg-red-600 text-white px-3 py-1.5 font-bold hover:bg-red-500 transition">
                    Delete Repository
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="lg:col-span-8 rounded-2xl glass-panel p-12 text-center text-gray-500 border border-white/10">
            Select a repository from the left panel to inspect its analytics.
          </div>
        )}
      </div>

      {/* Add Repository Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl glass-panel-deep p-6 border border-white/10 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Add New Repository</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white text-sm">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddRepository} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1">
                  Repository Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. SmartEMS"
                  className="w-full rounded-xl border border-white/10 bg-gray-900 px-3.5 py-2.5 text-xs text-white placeholder-gray-500 outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1">
                  GitHub URL or Owner/Repo
                </label>
                <input
                  type="text"
                  required
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="e.g. https://github.com/owner/repo"
                  className="w-full rounded-xl border border-white/10 bg-gray-900 px-3.5 py-2.5 text-xs text-white placeholder-gray-500 outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-white/[0.08] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50 transition shadow-md glow-indigo"
                >
                  {submitting ? "Connecting..." : "+ Connect Repository"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
