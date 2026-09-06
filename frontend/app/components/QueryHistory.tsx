"use client";

import { useEffect, useState } from "react";
import { History, Clock, FolderGit2, AlertCircle, MessageSquare } from "lucide-react";

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
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-md">
          <History className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Developer Query History</h2>
          <p className="text-xs text-gray-400">Complete audit log of past questions and AI multi-agent responses</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-950/70 border border-red-800/60 p-3 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-2xl glass-panel p-5 border border-white/10 space-y-4 shadow-xl">
        {loading ? (
          <div className="py-12 text-center text-xs text-gray-500 flex flex-col items-center gap-2">
            <div className="h-4 w-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            <span>Loading query history...</span>
          </div>
        ) : queries.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-500 space-y-1">
            <MessageSquare className="w-6 h-6 text-gray-600 mx-auto mb-2" />
            <p className="font-semibold text-gray-400">No queries recorded yet</p>
            <p>Start a conversation in the AI Copilot Chat to populate your history.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {queries.map((q) => (
              <div
                key={q.id}
                className="rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10 p-4 transition text-xs space-y-2"
              >
                <div className="flex items-center justify-between text-gray-400 text-[11px]">
                  <span className="font-mono font-bold text-indigo-400">Query #{q.id}</span>
                  <div className="flex items-center gap-1 text-[10px] text-gray-500">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(q.asked_at).toLocaleString()}</span>
                  </div>
                </div>
                <p className="text-white font-medium text-xs leading-relaxed">{q.query_text}</p>
                {q.repository && (
                  <div className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[10px] text-indigo-300 font-semibold">
                    <FolderGit2 className="w-3 h-3" />
                    <span>{q.repository.name}</span>
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
