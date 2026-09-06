"use client";

import { useEffect, useState } from "react";
import { User } from "./AuthPanel";
import Sidebar from "./Sidebar";
import HomeOverview from "./HomeOverview";
import ChatPanel from "./ChatPanel";
import CodeExplorer from "./CodeExplorer";
import RepositoryManager, { Repository } from "./RepositoryManager";
import IntegrationsPanel from "./IntegrationsPanel";
import QueryHistory from "./QueryHistory";
import {
  LayoutDashboard,
  Bot,
  FolderGit2,
  History,
  Settings,
  ShieldCheck,
  Cpu,
  Layers,
  Zap,
  Lock,
  Code2,
  Webhook,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type DashboardProps = {
  token: string;
  user: User;
  onLogout: () => void;
};

export default function Dashboard({ token, user, onLogout }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<
    "home" | "chat" | "code" | "repos" | "integrations" | "queries" | "settings"
  >("home");
  const [prefillQuery, setPrefillQuery] = useState<string>("");
  const [selectedRepoUrl, setSelectedRepoUrl] = useState<string>("");
  const [activeRepoName, setActiveRepoName] = useState<string>("");
  const [activeRepoId, setActiveRepoId] = useState<number | null>(null);
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
          setActiveRepoId(data[0].id);
        }
      })
      .catch(() => {});
  }, [token]);

  function handleSelectRepoForChat(repoName: string, repoUrl: string) {
    setSelectedRepoUrl(repoUrl);
    setActiveRepoName(repoName);
    const match = repositories.find((r) => r.repo_url === repoUrl);
    if (match) setActiveRepoId(match.id);
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
      {/* Left Collapsible Navigation Sidebar */}
      <Sidebar
        user={user}
        token={token}
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
              {activeTab === "home"
                ? "Overview"
                : activeTab === "chat"
                ? "AI Copilot"
                : activeTab === "code"
                ? "Code Explorer"
                : activeTab === "repos"
                ? "Repositories"
                : activeTab === "integrations"
                ? "Slack & Discord"
                : activeTab}
            </span>
          </div>

          {/* Top Center Tab Pills */}
          <nav className="hidden md:flex items-center gap-1 rounded-xl bg-white/[0.04] p-1 border border-white/5 text-xs font-semibold">
            <button
              onClick={() => setActiveTab("home")}
              className={`rounded-lg px-3 py-1.5 transition flex items-center gap-1.5 ${
                activeTab === "home"
                  ? "bg-indigo-600 text-white shadow-sm glow-indigo"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Home</span>
            </button>
            <button
              onClick={() => setActiveTab("chat")}
              className={`rounded-lg px-3 py-1.5 transition flex items-center gap-1.5 ${
                activeTab === "chat"
                  ? "bg-indigo-600 text-white shadow-sm glow-indigo"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>AI Copilot</span>
            </button>
            <button
              onClick={() => setActiveTab("code")}
              className={`rounded-lg px-3 py-1.5 transition flex items-center gap-1.5 ${
                activeTab === "code"
                  ? "bg-indigo-600 text-white shadow-sm glow-indigo"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <Code2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Code</span>
            </button>
            <button
              onClick={() => setActiveTab("repos")}
              className={`rounded-lg px-3 py-1.5 transition flex items-center gap-1.5 ${
                activeTab === "repos"
                  ? "bg-indigo-600 text-white shadow-sm glow-indigo"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <FolderGit2 className="w-3.5 h-3.5" />
              <span>Repos</span>
            </button>
            <button
              onClick={() => setActiveTab("integrations")}
              className={`rounded-lg px-3 py-1.5 transition flex items-center gap-1.5 ${
                activeTab === "integrations"
                  ? "bg-indigo-600 text-white shadow-sm glow-indigo"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <Webhook className="w-3.5 h-3.5 text-rose-400" />
              <span>Webhooks</span>
            </button>
            <button
              onClick={() => setActiveTab("queries")}
              className={`rounded-lg px-3 py-1.5 transition flex items-center gap-1.5 ${
                activeTab === "queries"
                  ? "bg-indigo-600 text-white shadow-sm glow-indigo"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <History className="w-3.5 h-3.5" />
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
              activeRepoId={activeRepoId}
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
                if (match) {
                  setActiveRepoName(match.name);
                  setActiveRepoId(match.id);
                }
              }}
            />
          )}

          {activeTab === "code" && (
            <CodeExplorer
              token={token}
              initialRepoId={activeRepoId}
              onSendToChat={(query) => {
                setPrefillQuery(query);
                setActiveTab("chat");
              }}
            />
          )}

          {activeTab === "repos" && (
            <RepositoryManager token={token} onSelectRepoForChat={handleSelectRepoForChat} />
          )}

          {activeTab === "integrations" && <IntegrationsPanel token={token} />}

          {activeTab === "queries" && <QueryHistory token={token} />}

          {activeTab === "settings" && (
            <div className="max-w-3xl mx-auto rounded-2xl glass-panel p-6 border border-white/10 space-y-6">
              <div className="flex items-center gap-2 pb-2 border-b border-white/5">
                <Settings className="w-5 h-5 text-indigo-400" />
                <h2 className="text-xl font-bold text-white">Platform Settings</h2>
              </div>

              <div className="space-y-4 text-xs">
                <div className="p-4 rounded-xl glass-card border border-white/10 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-white text-sm">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Account & Security</span>
                  </div>
                  <p className="text-gray-400">Signed in as {user.name} ({user.email})</p>
                  <div className="text-emerald-400 text-[11px] font-semibold flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    <span>JWT Session Authenticated</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl glass-card border border-white/10 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-white text-sm">
                    <Cpu className="w-4 h-4 text-purple-400" />
                    <span>Multi-Agent RAG Engine</span>
                  </div>
                  <p className="text-gray-400">ChromaDB Vector Store: Active</p>
                  <p className="text-gray-400">Embedding Engine: 128-dim FastCodeEmbeddingFunction</p>
                  <p className="text-gray-400">LLM Provider: OpenRouter (gpt-4o-mini)</p>
                </div>

                <div className="p-4 rounded-xl glass-card border border-white/10 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-white text-sm">
                    <FolderGit2 className="w-4 h-4 text-indigo-400" />
                    <span>Active Repository Scope</span>
                  </div>
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
