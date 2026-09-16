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
import ArchitectureVisualizer from "./ArchitectureVisualizer";
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
  Network,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type DashboardProps = {
  token: string;
  user: User;
  onLogout: () => void;
};

export default function Dashboard({ token, user, onLogout }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<
    "home" | "chat" | "code" | "architecture" | "repos" | "integrations" | "queries" | "settings"
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
    <div className="min-h-screen bg-[#08090A] text-[#F5F5F5] flex flex-row selection:bg-[#6366F1] selection:text-white">
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
        <header className="sticky top-0 z-40 border-b border-[#24262A] bg-[#08090A]/95 backdrop-blur-xl px-6 py-2.5 flex items-center justify-between shadow-sm">
          {/* Active Navigation Path */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#8B8F98] font-medium tracking-wide">Relay</span>
            <span className="text-[#5C6068]">/</span>
            <span className="font-semibold text-[#F5F5F5] capitalize">
              {activeTab === "home"
                ? "Overview"
                : activeTab === "chat"
                ? "AI Copilot"
                : activeTab === "code"
                ? "Code Explorer"
                : activeTab === "architecture"
                ? "Architecture & ERD"
                : activeTab === "repos"
                ? "Repositories"
                : activeTab === "integrations"
                ? "Slack & Discord"
                : activeTab}
            </span>
          </div>

          {/* Top Center Tab Pills */}
          <nav className="hidden md:flex items-center gap-1 rounded-lg bg-[#111214] p-1 border border-[#24262A] text-xs font-medium">
            <button
              onClick={() => setActiveTab("home")}
              className={`rounded-md px-3 py-1.5 transition flex items-center gap-1.5 ${
                activeTab === "home"
                  ? "bg-[#6366F1] text-[#F5F5F5]"
                  : "text-[#8B8F98] hover:bg-[#17181B] hover:text-[#F5F5F5]"
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Home</span>
            </button>
            <button
              onClick={() => setActiveTab("chat")}
              className={`rounded-md px-3 py-1.5 transition flex items-center gap-1.5 ${
                activeTab === "chat"
                  ? "bg-[#6366F1] text-[#F5F5F5]"
                  : "text-[#8B8F98] hover:bg-[#17181B] hover:text-[#F5F5F5]"
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>AI Copilot</span>
            </button>
            <button
              onClick={() => setActiveTab("code")}
              className={`rounded-md px-3 py-1.5 transition flex items-center gap-1.5 ${
                activeTab === "code"
                  ? "bg-[#6366F1] text-[#F5F5F5]"
                  : "text-[#8B8F98] hover:bg-[#17181B] hover:text-[#F5F5F5]"
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Code</span>
            </button>
            <button
              onClick={() => setActiveTab("architecture")}
              className={`rounded-md px-3 py-1.5 transition flex items-center gap-1.5 ${
                activeTab === "architecture"
                  ? "bg-[#6366F1] text-[#F5F5F5]"
                  : "text-[#8B8F98] hover:bg-[#17181B] hover:text-[#F5F5F5]"
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>Architecture</span>
            </button>
            <button
              onClick={() => setActiveTab("repos")}
              className={`rounded-md px-3 py-1.5 transition flex items-center gap-1.5 ${
                activeTab === "repos"
                  ? "bg-[#6366F1] text-[#F5F5F5]"
                  : "text-[#8B8F98] hover:bg-[#17181B] hover:text-[#F5F5F5]"
              }`}
            >
              <FolderGit2 className="w-3.5 h-3.5" />
              <span>Repos</span>
            </button>
            <button
              onClick={() => setActiveTab("integrations")}
              className={`rounded-md px-3 py-1.5 transition flex items-center gap-1.5 ${
                activeTab === "integrations"
                  ? "bg-[#6366F1] text-[#F5F5F5]"
                  : "text-[#8B8F98] hover:bg-[#17181B] hover:text-[#F5F5F5]"
              }`}
            >
              <Webhook className="w-3.5 h-3.5" />
              <span>Webhooks</span>
            </button>
            <button
              onClick={() => setActiveTab("queries")}
              className={`rounded-md px-3 py-1.5 transition flex items-center gap-1.5 ${
                activeTab === "queries"
                  ? "bg-[#6366F1] text-[#F5F5F5]"
                  : "text-[#8B8F98] hover:bg-[#17181B] hover:text-[#F5F5F5]"
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>History</span>
            </button>
          </nav>

          {/* User Profile Pill */}
          <div className="flex items-center gap-2.5">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-semibold text-[#F5F5F5]">{user.name}</div>
              <div className="text-[10px] text-[#8B8F98]">{user.email}</div>
            </div>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#17181B] border border-[#24262A] text-[#F5F5F5] font-semibold text-xs">
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

          {activeTab === "architecture" && (
            <ArchitectureVisualizer
              token={token}
              repoId={activeRepoId}
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
            <div className="max-w-3xl mx-auto rounded-xl bg-[#111214] p-6 border border-[#24262A] space-y-6">
              <div className="flex items-center gap-2 pb-3 border-b border-[#24262A]">
                <Settings className="w-5 h-5 text-[#6366F1]" />
                <h2 className="text-lg font-bold text-[#F5F5F5]">Platform Settings</h2>
              </div>

              <div className="space-y-4 text-xs">
                <div className="p-4 rounded-lg bg-[#0C0D0F] border border-[#24262A] space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-[#F5F5F5] text-sm">
                    <ShieldCheck className="w-4 h-4 text-[#22C55E]" />
                    <span>Account & Security</span>
                  </div>
                  <p className="text-[#8B8F98]">Signed in as {user.name} ({user.email})</p>
                  <div className="text-[#22C55E] text-[11px] font-medium flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    <span>JWT Session Authenticated</span>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-[#0C0D0F] border border-[#24262A] space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-[#F5F5F5] text-sm">
                    <Cpu className="w-4 h-4 text-[#8B8F98]" />
                    <span>Multi-Agent RAG Engine</span>
                  </div>
                  <p className="text-[#8B8F98]">ChromaDB Vector Store: Active</p>
                  <p className="text-[#8B8F98]">Embedding Engine: 128-dim FastCodeEmbeddingFunction</p>
                  <p className="text-[#8B8F98]">LLM Provider: OpenRouter (gpt-4o-mini)</p>
                </div>

                <div className="p-4 rounded-lg bg-[#0C0D0F] border border-[#24262A] space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-[#F5F5F5] text-sm">
                    <FolderGit2 className="w-4 h-4 text-[#6366F1]" />
                    <span>Active Repository Scope</span>
                  </div>
                  <p className="text-[#8B8F98]">{selectedRepoUrl || "Default configured repository in .env"}</p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
