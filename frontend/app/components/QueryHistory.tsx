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
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#17181B] text-[#6366F1] border border-[#24262A] shadow-sm">
          <History className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#F5F5F5] tracking-tight">Developer Query History</h2>
          <p className="text-xs text-[#8B8F98]">Complete audit log of past questions and AI multi-agent responses</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 p-3 text-xs text-[#EF4444]">
          <AlertCircle className="w-4 h-4 text-[#EF4444] flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-2xl bg-[#111214] p-5 border border-[#24262A] space-y-4 shadow-sm">
        {loading ? (
          <div className="py-12 text-center text-xs text-[#8B8F98] flex flex-col items-center gap-2">
            <div className="h-4 w-4 rounded-full border-2 border-[#6366F1] border-t-transparent animate-spin" />
            <span>Loading query history...</span>
          </div>
        ) : queries.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#8B8F98] space-y-1">
            <MessageSquare className="w-6 h-6 text-[#5C6068] mx-auto mb-2" />
            <p className="font-semibold text-[#F5F5F5]">No queries recorded yet</p>
            <p>Start a conversation in the AI Copilot Chat to populate your history.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {queries.map((q) => (
              <div
                key={q.id}
                className="rounded-xl border border-[#24262A] bg-[#0C0D0F] hover:bg-[#17181B] p-4 transition text-xs space-y-2"
              >
                <div className="flex items-center justify-between text-[#8B8F98] text-[11px]">
                  <span className="font-mono font-bold text-[#6366F1]">Query #{q.id}</span>
                  <div className="flex items-center gap-1 text-[10px] text-[#8B8F98]">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(q.asked_at).toLocaleString()}</span>
                  </div>
                </div>
                <p className="text-[#F5F5F5] font-medium text-xs leading-relaxed">{q.query_text}</p>
                {q.repository && (
                  <div className="inline-flex items-center gap-1.5 rounded-lg bg-[#17181B] border border-[#24262A] px-2 py-0.5 text-[10px] text-[#8B8F98] font-semibold">
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
