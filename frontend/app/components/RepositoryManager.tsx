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
};

export default function RepositoryManager({ token }: RepositoryManagerProps) {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
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

      if (!res.ok) {
        throw new Error(data.detail || "Failed to add repository");
      }

      setSuccess(`Repository '${data.name}' added successfully!`);
      setName("");
      setRepoUrl("");
      fetchRepositories();
    } catch (err: any) {
      setError(err.message || "Error adding repository");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteRepository(id: number, repoName: string) {
    if (!confirm(`Are you sure you want to delete '${repoName}'?`)) return;

    try {
      const res = await fetch(`${API_BASE}/repositories/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Failed to delete repository");

      setSuccess(`Repository '${repoName}' deleted.`);
      setRepositories((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      setError(err.message || "Error deleting repository");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Repository Management</h2>
          <p className="text-sm text-gray-400">Connect GitHub repositories for AI analysis and indexing</p>
        </div>
      </div>

      {/* Alert Messages */}
      {error && (
        <div className="rounded-lg bg-red-950/60 border border-red-800/50 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-emerald-950/60 border border-emerald-800/50 p-3 text-sm text-emerald-300">
          {success}
        </div>
      )}

      {/* Add Repository Form */}
      <form onSubmit={handleAddRepository} className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wider">Connect New Repository</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Repository Name</label>
            <input
              type="text"
              required
              placeholder="spendwise"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3.5 py-2 text-sm text-white outline-none focus:border-blue-500 transition"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Repository URL (https://...)</label>
            <input
              type="url"
              required
              placeholder="https://github.com/Abiraminesamani/spendwise"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3.5 py-2 text-sm text-white outline-none focus:border-blue-500 transition"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition shadow-md shadow-blue-600/20"
        >
          {submitting ? "Connecting..." : "+ Add Repository"}
        </button>
      </form>

      {/* Repositories List */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wider">Connected Repositories</h3>

        {loading ? (
          <div className="py-8 text-center text-sm text-gray-500">Loading repositories...</div>
        ) : repositories.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
            No repositories connected yet. Add one above to get started!
          </div>
        ) : (
          <div className="divide-y divide-gray-800/60">
            {repositories.map((repo) => (
              <div key={repo.id} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                <div>
                  <div className="font-medium text-white text-sm">{repo.name}</div>
                  <a
                    href={repo.repo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-400 hover:underline"
                  >
                    {repo.repo_url}
                  </a>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    Added on {new Date(repo.added_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteRepository(repo.id, repo.name)}
                  className="rounded-md border border-red-900/50 bg-red-950/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/60 transition"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
