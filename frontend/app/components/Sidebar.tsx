"use client";

import { useEffect, useState } from "react";
import { User } from "./AuthPanel";
import {
  LayoutDashboard,
  Bot,
  FolderGit2,
  History,
  Settings,
  Plus,
  LogOut,
  MessageSquare,
  Zap,
  ChevronRight,
  Code2,
  Webhook,
  Network,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type QueryItem = {
  id: number;
  query_text: string;
  asked_at?: string;
  created_at?: string;
};

type SidebarProps = {
  user: User;
  token?: string;
  activeTab: "home" | "chat" | "code" | "architecture" | "repos" | "integrations" | "queries" | "settings";
  onSelectTab: (tab: "home" | "chat" | "code" | "architecture" | "repos" | "integrations" | "queries" | "settings") => void;
  onNewChat: () => void;
  onSelectRecentQuery: (query: string) => void;
  onLogout: () => void;
};

function formatTimeAgo(isoString?: string | null): string {
  if (!isoString) return "recent";
  try {
    const formatted =
      typeof isoString === "string" && !isoString.includes("T") && isoString.includes(" ")
        ? isoString.replace(" ", "T") + "Z"
        : isoString;
    const d = new Date(formatted);
    if (isNaN(d.getTime())) return "recent";
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (isNaN(diffSec) || diffSec < 0) return "just now";
    if (diffSec < 60) return "just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  } catch {
    return "recent";
  }
}

export default function Sidebar({
  user,
  token,
  activeTab,
  onSelectTab,
  onNewChat,
  onSelectRecentQuery,
  onLogout,
}: SidebarProps) {
  const [recentQueries, setRecentQueries] = useState<QueryItem[]>([]);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/queries`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: QueryItem[]) => {
        if (Array.isArray(data)) {
          setRecentQueries(data.slice(0, 5));
        }
      })
      .catch(() => {});
  }, [token, activeTab]);

  const defaultRecent: QueryItem[] = [
    { id: 1, query_text: "Why did the latest CI/CD workflow pipeline fail?", asked_at: new Date(Date.now() - 120000).toISOString() },
    { id: 2, query_text: "Explain the backend architecture and service layer in this repo", asked_at: new Date(Date.now() - 3600000).toISOString() },
    { id: 3, query_text: "Review the latest open pull request diff and suggest fixes", asked_at: new Date(Date.now() - 10800000).toISOString() },
    { id: 4, query_text: "Run a security scan on this repository for hardcoded secrets and flaws", asked_at: new Date(Date.now() - 86400000).toISOString() },
  ];

  const displayQueries = recentQueries.length > 0 ? recentQueries : defaultRecent;

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col justify-between border-r border-[#24262A] bg-[#0C0D0F] p-4 shadow-xl h-screen sticky top-0">
      <div className="space-y-5">
        {/* Brand Logo */}
        <div className="flex items-center justify-between px-2 pt-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#111214] border border-[#24262A] text-[#6366F1]">
              <Zap className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold tracking-wider text-[#F5F5F5] uppercase">RELAY</span>
          </div>
        </div>

        {/* New Chat Action Button */}
        <button
          onClick={onNewChat}
          className="w-full rounded-lg bg-[#6366F1] hover:bg-[#4F46E5] px-3.5 py-2.5 text-xs font-semibold text-[#F5F5F5] transition flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          <span>New Chat</span>
        </button>

        {/* Main Navigation Links */}
        <nav className="space-y-1">
          <button
            onClick={() => onSelectTab("home")}
            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition ${
              activeTab === "home"
                ? "bg-[#17181B] text-[#F5F5F5] border border-[#24262A]"
                : "text-[#8B8F98] hover:bg-[#17181B] hover:text-[#F5F5F5]"
            }`}
          >
            <LayoutDashboard className={`w-4 h-4 ${activeTab === "home" ? "text-[#6366F1]" : "text-[#8B8F98]"}`} />
            <span>Home</span>
          </button>

          <button
            onClick={() => onSelectTab("chat")}
            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition ${
              activeTab === "chat"
                ? "bg-[#17181B] text-[#F5F5F5] border border-[#24262A]"
                : "text-[#8B8F98] hover:bg-[#17181B] hover:text-[#F5F5F5]"
            }`}
          >
            <Bot className={`w-4 h-4 ${activeTab === "chat" ? "text-[#6366F1]" : "text-[#8B8F98]"}`} />
            <span>AI Copilot</span>
          </button>

          <button
            onClick={() => onSelectTab("code")}
            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition ${
              activeTab === "code"
                ? "bg-[#17181B] text-[#F5F5F5] border border-[#24262A]"
                : "text-[#8B8F98] hover:bg-[#17181B] hover:text-[#F5F5F5]"
            }`}
          >
            <Code2 className={`w-4 h-4 ${activeTab === "code" ? "text-[#6366F1]" : "text-[#8B8F98]"}`} />
            <span>Code Explorer</span>
          </button>

          <button
            onClick={() => onSelectTab("architecture")}
            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition ${
              activeTab === "architecture"
                ? "bg-[#17181B] text-[#F5F5F5] border border-[#24262A]"
                : "text-[#8B8F98] hover:bg-[#17181B] hover:text-[#F5F5F5]"
            }`}
          >
            <Network className={`w-4 h-4 ${activeTab === "architecture" ? "text-[#6366F1]" : "text-[#8B8F98]"}`} />
            <span>Architecture</span>
          </button>

          <button
            onClick={() => onSelectTab("repos")}
            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition ${
              activeTab === "repos"
                ? "bg-[#17181B] text-[#F5F5F5] border border-[#24262A]"
                : "text-[#8B8F98] hover:bg-[#17181B] hover:text-[#F5F5F5]"
            }`}
          >
            <FolderGit2 className={`w-4 h-4 ${activeTab === "repos" ? "text-[#6366F1]" : "text-[#8B8F98]"}`} />
            <span>Repositories</span>
          </button>

          <button
            onClick={() => onSelectTab("integrations")}
            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition ${
              activeTab === "integrations"
                ? "bg-[#17181B] text-[#F5F5F5] border border-[#24262A]"
                : "text-[#8B8F98] hover:bg-[#17181B] hover:text-[#F5F5F5]"
            }`}
          >
            <Webhook className={`w-4 h-4 ${activeTab === "integrations" ? "text-[#6366F1]" : "text-[#8B8F98]"}`} />
            <span>Integrations</span>
          </button>

          <button
            onClick={() => onSelectTab("queries")}
            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition ${
              activeTab === "queries"
                ? "bg-[#17181B] text-[#F5F5F5] border border-[#24262A]"
                : "text-[#8B8F98] hover:bg-[#17181B] hover:text-[#F5F5F5]"
            }`}
          >
            <History className={`w-4 h-4 ${activeTab === "queries" ? "text-[#6366F1]" : "text-[#8B8F98]"}`} />
            <span>History</span>
          </button>

          <button
            onClick={() => onSelectTab("settings")}
            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition ${
              activeTab === "settings"
                ? "bg-[#17181B] text-[#F5F5F5] border border-[#24262A]"
                : "text-[#8B8F98] hover:bg-[#17181B] hover:text-[#F5F5F5]"
            }`}
          >
            <Settings className={`w-4 h-4 ${activeTab === "settings" ? "text-[#6366F1]" : "text-[#8B8F98]"}`} />
            <span>Settings</span>
          </button>
        </nav>

        {/* Recent Chats Section */}
        <div className="pt-2">
          <div className="flex items-center justify-between px-2 mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#8B8F98]">
            <span>Recent Chats</span>
            <MessageSquare className="w-3 h-3 text-[#5C6068]" />
          </div>

          <div className="space-y-0.5">
            {displayQueries.map((chat) => (
              <button
                key={chat.id}
                onClick={() => {
                  onSelectRecentQuery(chat.query_text);
                  onSelectTab("chat");
                }}
                className="w-full text-left rounded-lg px-2.5 py-1.5 text-[11px] text-[#8B8F98] hover:bg-[#17181B] hover:text-[#F5F5F5] transition flex items-center justify-between group"
              >
                <div className="flex items-center gap-2 truncate pr-1">
                  <MessageSquare className="w-3 h-3 text-[#5C6068] flex-shrink-0 group-hover:text-[#F5F5F5] transition" />
                  <span className="truncate">{chat.query_text}</span>
                </div>
                <span className="text-[9px] text-[#5C6068] whitespace-nowrap">{formatTimeAgo(chat.asked_at || chat.created_at)}</span>
              </button>
            ))}
          </div>

          <button
            onClick={() => onSelectTab("queries")}
            className="w-full text-left px-2.5 py-1 text-[10px] font-medium text-[#8B8F98] hover:text-[#6366F1] transition mt-1 flex items-center gap-1"
          >
            <span>View all query history</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* User Footer Profile */}
      <div className="pt-3 border-t border-[#24262A] flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#17181B] border border-[#24262A] text-[#F5F5F5] font-semibold text-[11px] flex-shrink-0">
            {user.name.charAt(0).toUpperCase() || "A"}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-[#F5F5F5] truncate">{user.name}</div>
            <div className="text-[10px] text-[#8B8F98] truncate">{user.email}</div>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="rounded-lg p-1.5 text-[#8B8F98] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition"
          title="Sign Out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}
