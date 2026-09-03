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
  const [loading, setLoading] = useState(true);
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
      const data = await res.json();
      setRepositories(data);
    } catch (err: any) {
      setError(err.message || "Failed to fetch repositories");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRepositories();
  }, [token]);

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
      fetchRepositories();
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
    } catch (err: any) {
      setError(err.message || "Error deleting repository");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl glass-panel p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 relative z-10">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Connected Repositories</h2>
            <p className="text-xs text-gray-400 mt-1">
              Manage repository sources, trigger tree-sitter AST chunking, and sync ChromaDB vector embeddings.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3">
            <div className="rounded-xl glass-card px-4 py-2.5 text-center border border-white/5">
              <div className="text-xs text-gray-400">Total Repos</div>
              <div className="text-lg font-bold text-white">{repositories.length}</div>
            </div>
            <div className="rounded-xl glass-card px-4 py-2.5 text-center border border-white/5">
              <div className="text-xs text-gray-400">RAG Engine</div>
              <div className="text-xs font-semibold text-emerald-400 mt-1">Active (ChromaDB)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-950/40 px-4 py-3 text-xs text-red-300 flex items-center justify-between">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">✕</button>
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/40 px-4 py-3 text-xs text-emerald-300 flex items-center justify-between">
          <span>✓ {success}</span>
          <button onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-emerald-200">✕</button>
        </div>
      )}

      {/* Add Repository Form & Repositories Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Card */}
        <div className="rounded-2xl glass-panel p-5 border border-white/5 h-fit">
          <h3 className="text-sm font-semibold text-white mb-1">Add Repository</h3>
          <p className="text-[11px] text-gray-400 mb-4">Connect a GitHub repo for multi-agent inspection</p>

          <form onSubmit={handleAddRepository} className="space-y-3.5">
            <div>
              <label className="block text-[11px] font-medium text-gray-300 mb-1">Repository Name</label>
              <input
                required
                className="w-full rounded-xl border border-white/10 bg-gray-950 px-3.5 py-2 text-xs text-white placeholder-gray-500 outline-none focus:border-blue-500 transition"
                placeholder="e.g. SpendWise App"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-300 mb-1">GitHub URL or Owner/Repo</label>
              <input
                required
                className="w-full rounded-xl border border-white/10 bg-gray-950 px-3.5 py-2 text-xs text-white placeholder-gray-500 outline-none focus:border-blue-500 transition"
                placeholder="e.g. https://github.com/owner/repo"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !name.trim() || !repoUrl.trim()}
              className="w-full rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition shadow-lg shadow-blue-600/20"
            >
              {submitting ? "Registering..." : "+ Connect Repository"}
            </button>
          </form>
        </div>

        {/* Repository List */}
        <div className="lg:col-span-2 space-y-3.5">
          <h3 className="text-sm font-semibold text-white">Registered Repositories</h3>

          {loading ? (
            <div className="rounded-2xl glass-panel p-8 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
              <div className="h-4 w-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
              Loading repositories...
            </div>
          ) : repositories.length === 0 ? (
            <div className="rounded-2xl glass-panel p-8 text-center text-xs text-gray-400">
              No repositories added yet. Add a repository using the form to start indexing code and analyzing CI runs.
            </div>
          ) : (
            repositories.map((repo) => {
              const isIndexing = indexingId === repo.id;
              const stats = indexedStats[repo.id];

              return (
                <div
                  key={repo.id}
                  className="rounded-2xl glass-panel p-5 border border-white/5 hover:border-white/10 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{repo.name}</span>
                      {stats ? (
                        <span className="rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium">
                          Indexed ({stats.chunks} chunks)
                        </span>
                      ) : (
                        <span className="rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 text-[10px] font-medium">
                          Connected
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 flex items-center gap-2">
                      <span className="truncate max-w-sm">{repo.repo_url}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      onClick={() => handleIndexRepository(repo)}
                      disabled={isIndexing}
                      className="rounded-xl border border-cyan-500/30 bg-cyan-950/30 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-900/50 hover:text-white transition flex items-center gap-1.5 disabled:opacity-50"
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
                          <span>Index RAG</span>
                        </>
                      )}
                    </button>

                    {onSelectRepoForChat && (
                      <button
                        onClick={() => onSelectRepoForChat(repo.name, repo.repo_url)}
                        className="rounded-xl border border-white/10 bg-gray-900/60 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 hover:text-white transition"
                      >
                        💬 Chat
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteRepository(repo.id, repo.name)}
                      className="rounded-xl border border-red-500/20 bg-red-950/20 px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-950/60 hover:text-red-200 transition"
                      title="Delete Repository"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
