"use client";

import { useEffect, useState } from "react";
import { User } from "./AuthPanel";
import Sidebar from "./Sidebar";
import HomeOverview from "./HomeOverview";
import ChatPanel from "./ChatPanel";
import RepositoryManager, { Repository } from "./RepositoryManager";
import QueryHistory from "./QueryHistory";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type DashboardProps = {
  token: string;
  user: User;
  onLogout: () => void;
};

export default function Dashboard({ token, user, onLogout }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<"home" | "chat" | "repos" | "queries" | "settings">("home");
  const [prefillQuery, setPrefillQuery] = useState<string>("");
  const [selectedRepoUrl, setSelectedRepoUrl] = useState<string>("");
  const [activeRepoName, setActiveRepoName] = useState<string>("");
  const [repositories, setRepositories] = useState<Repository[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/repositories`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Repository[]) => {
        setRepositories(data);
        if (data.length > 0 && !selectedRepoUrl) {
          setSelectedRepoUrl(data[0].repo_url);
          setActiveRepoName(data[0].name);
        }
      })
      .catch(() => {});
  }, [token]);

  function handleSelectRepoForChat(repoName: string, repoUrl: string) {
    setSelectedRepoUrl(repoUrl);
    setActiveRepoName(repoName);
    setPrefillQuery(`Explain the structure, key components, and service layer of '${repoName}'`);
    setActiveTab("chat");
  }

  function handleLaunchCopilotQuery(query: string) {
    setPrefillQuery(query);
    setActiveTab("chat");
  }

  function handleNewChat() {
    setPrefillQuery("");
    setActiveTab("chat");
  }

  return (
    <div className="min-h-screen bg-[#07080c] text-gray-100 flex flex-row selection:bg-indigo-600 selection:text-white">
      {/* Left Collapsible Navigation Sidebar (Screen 3 style) */}
      <Sidebar
        user={user}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onNewChat={handleNewChat}
        onSelectRecentQuery={handleLaunchCopilotQuery}
        onLogout={onLogout}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Top Header Navbar */}
        <header className="sticky top-0 z-40 border-b border-white/5 bg-[#08090e]/80 backdrop-blur-xl px-6 py-3 flex items-center justify-between shadow-md">
          {/* Active Navigation Path */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500 font-semibold uppercase tracking-wider">Relay</span>
            <span className="text-gray-600">/</span>
            <span className="font-bold text-white capitalize">
              {activeTab === "home" ? "Overview" : activeTab === "chat" ? "AI Copilot" : activeTab}
            </span>
          </div>

          {/* Top Center Tab Pills */}
          <nav className="hidden md:flex items-center gap-1 rounded-xl bg-white/[0.04] p-1 border border-white/5 text-xs font-semibold">
            <button
              onClick={() => setActiveTab("home")}
              className={`rounded-lg px-3.5 py-1.5 transition flex items-center gap-1.5 ${
                activeTab === "home"
                  ? "bg-indigo-600 text-white shadow-sm glow-indigo"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <span>🏠</span>
              <span>Home</span>
            </button>
            <button
              onClick={() => setActiveTab("chat")}
              className={`rounded-lg px-3.5 py-1.5 transition flex items-center gap-1.5 ${
                activeTab === "chat"
                  ? "bg-indigo-600 text-white shadow-sm glow-indigo"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <span>💬</span>
              <span>AI Copilot</span>
            </button>
            <button
              onClick={() => setActiveTab("repos")}
              className={`rounded-lg px-3.5 py-1.5 transition flex items-center gap-1.5 ${
                activeTab === "repos"
                  ? "bg-indigo-600 text-white shadow-sm glow-indigo"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <span>📁</span>
              <span>Repositories</span>
            </button>
            <button
              onClick={() => setActiveTab("queries")}
              className={`rounded-lg px-3.5 py-1.5 transition flex items-center gap-1.5 ${
                activeTab === "queries"
                  ? "bg-indigo-600 text-white shadow-sm glow-indigo"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <span>📜</span>
              <span>History</span>
            </button>
          </nav>

          {/* User Profile Pill */}
          <div className="flex items-center gap-2.5">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-white">{user.name}</div>
              <div className="text-[10px] text-gray-500">{user.email}</div>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-bold text-xs ring-2 ring-indigo-500/40">
              {user.name.charAt(0).toUpperCase() || "A"}
            </div>
          </div>
        </header>

        {/* Dynamic Main View */}
        <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto">
          {activeTab === "home" && (
            <HomeOverview
              user={user}
              token={token}
              activeRepoName={activeRepoName}
              activeRepoUrl={selectedRepoUrl}
              onLaunchCopilotQuery={handleLaunchCopilotQuery}
              onNavigateToTab={setActiveTab}
            />
          )}

          {activeTab === "chat" && (
            <ChatPanel
              token={token}
              prefillQuery={prefillQuery}
              selectedRepoUrl={selectedRepoUrl}
              onSelectRepoUrl={(url) => {
                setSelectedRepoUrl(url);
                const match = repositories.find((r) => r.repo_url === url);
                if (match) setActiveRepoName(match.name);
              }}
            />
          )}

          {activeTab === "repos" && (
            <RepositoryManager token={token} onSelectRepoForChat={handleSelectRepoForChat} />
          )}

          {activeTab === "queries" && <QueryHistory token={token} />}

          {activeTab === "settings" && (
            <div className="max-w-3xl mx-auto rounded-2xl glass-panel p-6 border border-white/10 space-y-6">
              <h2 className="text-xl font-bold text-white">Platform Settings</h2>

              <div className="space-y-4 text-xs">
                <div className="p-4 rounded-xl glass-card border border-white/10 space-y-2">
                  <h3 className="font-bold text-white text-sm">Account & Security</h3>
                  <p className="text-gray-400">Signed in as {user.name} ({user.email})</p>
                  <div className="text-emerald-400 text-[11px] font-semibold">✓ JWT Token Authenticated</div>
                </div>

                <div className="p-4 rounded-xl glass-card border border-white/10 space-y-2">
                  <h3 className="font-bold text-white text-sm">Multi-Agent RAG Engine</h3>
                  <p className="text-gray-400">ChromaDB Vector Store: Active</p>
                  <p className="text-gray-400">Embedding Engine: 128-dim FastCodeEmbeddingFunction</p>
                  <p className="text-gray-400">LLM Provider: OpenRouter (gpt-4o-mini)</p>
                </div>

                <div className="p-4 rounded-xl glass-card border border-white/10 space-y-2">
                  <h3 className="font-bold text-white text-sm">Active Repository</h3>
                  <p className="text-gray-400">{selectedRepoUrl || "Default configured repository in .env"}</p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
