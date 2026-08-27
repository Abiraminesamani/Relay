"use client";

import { useState } from "react";
import { User } from "./AuthPanel";
import ChatPanel from "./ChatPanel";
import RepositoryManager from "./RepositoryManager";
import QueryHistory from "./QueryHistory";

type DashboardProps = {
  token: string;
  user: User;
  onLogout: () => void;
};

export default function Dashboard({ token, user, onLogout }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<"chat" | "repos" | "queries">("chat");
  const [prefillQuery, setPrefillQuery] = useState<string>("");
  const [selectedRepoUrl, setSelectedRepoUrl] = useState<string>("");

  function handleSelectRepoForChat(repoName: string, repoUrl: string) {
    setSelectedRepoUrl(repoUrl);
    setPrefillQuery(`Explain the structure and main components of repository '${repoName}'`);
    setActiveTab("chat");
  }

  return (
    <div className="min-h-screen bg-[#090a0d] text-gray-100 flex flex-col selection:bg-blue-600 selection:text-white">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-gray-950/80 backdrop-blur-2xl px-6 py-3 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-purple-600 text-white font-black text-base shadow-lg glow-blue border border-white/20">
            R
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-black text-white tracking-widest uppercase">RELAY</h1>
              <span className="rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.2 text-[9px] font-semibold">
                Multi-Agent Active
              </span>
            </div>
            <p className="text-[10px] text-gray-400">Engineering Intelligence Platform</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 rounded-2xl bg-gray-900/80 p-1 border border-white/5 shadow-inner">
          <button
            onClick={() => setActiveTab("chat")}
            className={`rounded-xl px-4 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === "chat"
                ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md glow-blue"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <span>💬</span>
            <span>AI Copilot</span>
          </button>
          <button
            onClick={() => setActiveTab("repos")}
            className={`rounded-xl px-4 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === "repos"
                ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md glow-blue"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <span>📁</span>
            <span>Repositories</span>
          </button>
          <button
            onClick={() => setActiveTab("queries")}
            className={`rounded-xl px-4 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === "queries"
                ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md glow-blue"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <span>📜</span>
            <span>History</span>
          </button>
        </nav>

        {/* User Info & Logout */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-white">{user.name}</div>
            <div className="text-[10px] text-gray-400">{user.email}</div>
          </div>
          <button
            onClick={onLogout}
            className="rounded-xl border border-white/10 bg-gray-900/80 px-3 py-1.5 text-xs text-gray-400 hover:bg-red-950/40 hover:text-red-300 hover:border-red-800/50 transition"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content View */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6">
        {activeTab === "chat" && (
          <ChatPanel
            token={token}
            prefillQuery={prefillQuery}
            selectedRepoUrl={selectedRepoUrl}
            onSelectRepoUrl={setSelectedRepoUrl}
          />
        )}
        {activeTab === "repos" && (
          <RepositoryManager token={token} onSelectRepoForChat={handleSelectRepoForChat} />
        )}
        {activeTab === "queries" && <QueryHistory token={token} />}
      </main>
    </div>
  );
}
