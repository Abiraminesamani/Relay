"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type QueryItem = {
  id: number;
  query_text: string;
  asked_at: string;
  user_id: number;
  repository_id: number | null;
  agent_id: number | null;
  repository?: { name: string } | null;
};

type QueryHistoryProps = {
  token: string;
};

export default function QueryHistory({ token }: QueryHistoryProps) {
  const [queries, setQueries] = useState<QueryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchQueries() {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/queries`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load developer queries");
      const data = await res.json();
      setQueries(data);
    } catch (err: any) {
      setError(err.message || "Error fetching queries");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchQueries();
  }, [token]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Developer Query History</h2>
        <p className="text-sm text-gray-400">View past questions and AI responses</p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-950/60 border border-red-800/50 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5 space-y-4">
        {loading ? (
          <div className="py-8 text-center text-sm text-gray-500">Loading query history...</div>
        ) : queries.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
            No queries recorded yet. Ask a question in the AI Copilot Chat!
          </div>
        ) : (
          <div className="space-y-3">
            {queries.map((q) => (
              <div
                key={q.id}
                className="rounded-lg border border-gray-800/80 bg-gray-950/60 p-4 transition hover:border-gray-700"
              >
                <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                  <span className="font-mono text-blue-400">Query #{q.id}</span>
                  <span>{new Date(q.asked_at).toLocaleString()}</span>
                </div>
                <p className="text-sm text-white font-medium mb-2">{q.query_text}</p>
                {q.repository && (
                  <div className="inline-flex items-center gap-1 rounded bg-blue-950/60 border border-blue-800/40 px-2 py-0.5 text-[11px] text-blue-300">
                    Repo: {q.repository.name}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
