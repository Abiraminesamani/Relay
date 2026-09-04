"use client";

import { User } from "./AuthPanel";

type SidebarProps = {
  user: User;
  activeTab: "home" | "chat" | "repos" | "queries" | "settings";
  onSelectTab: (tab: "home" | "chat" | "repos" | "queries" | "settings") => void;
  onNewChat: () => void;
  onSelectRecentQuery: (query: string) => void;
  onLogout: () => void;
};

const RECENT_CHATS = [
  { icon: "⚙️", title: "CI/CD failure analysis", time: "2m ago", query: "Why did the latest CI/CD workflow pipeline fail?" },
  { icon: "🏛️", title: "Architecture explanation", time: "1h ago", query: "Explain the backend architecture and service layer in this repo" },
  { icon: "🔍", title: "Review authentication flow", time: "3h ago", query: "Review the latest open pull request diff and suggest fixes" },
  { icon: "⚡", title: "Database optimization", time: "Yesterday", query: "Explain database entities and optimization opportunities" },
  { icon: "🛡️", title: "Security vulnerabilities", time: "2 days ago", query: "Run a security scan on this repository for hardcoded secrets and flaws" },
];

export default function Sidebar({
  user,
  activeTab,
  onSelectTab,
  onNewChat,
  onSelectRecentQuery,
  onLogout,
}: SidebarProps) {
  return (
    <aside className="w-64 flex-shrink-0 flex flex-col justify-between border-r border-white/5 bg-[#090b10]/95 backdrop-blur-2xl p-4 shadow-2xl h-screen sticky top-0">
      <div className="space-y-5">
        {/* Brand Logo */}
        <div className="flex items-center justify-between px-2 pt-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 text-white font-black text-xs shadow-md glow-indigo">
              ⚡
            </div>
            <span className="text-sm font-black tracking-widest text-white uppercase">RELAY</span>
          </div>
        </div>

        {/* New Chat Action Button */}
        <button
          onClick={onNewChat}
          className="w-full rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 px-3.5 py-2.5 text-xs font-bold text-white hover:from-indigo-500 hover:to-purple-500 transition shadow-lg glow-indigo flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          <span className="text-sm font-bold">+</span>
          <span>New Chat</span>
        </button>

        {/* Main Navigation Links */}
        <nav className="space-y-1">
          <button
            onClick={() => onSelectTab("home")}
            className={`w-full flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold transition ${
              activeTab === "home"
                ? "bg-white/[0.08] text-white border border-white/10 shadow-sm"
                : "text-gray-400 hover:bg-white/[0.03] hover:text-gray-200"
            }`}
          >
            <span className="text-sm">🏠</span>
            <span>Home</span>
          </button>

          <button
            onClick={() => onSelectTab("chat")}
            className={`w-full flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold transition ${
              activeTab === "chat"
                ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-sm"
                : "text-gray-400 hover:bg-white/[0.03] hover:text-gray-200"
            }`}
          >
            <span className="text-sm">💬</span>
            <span>AI Copilot</span>
          </button>

          <button
            onClick={() => onSelectTab("repos")}
            className={`w-full flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold transition ${
              activeTab === "repos"
                ? "bg-white/[0.08] text-white border border-white/10 shadow-sm"
                : "text-gray-400 hover:bg-white/[0.03] hover:text-gray-200"
            }`}
          >
            <span className="text-sm">📁</span>
            <span>Repositories</span>
          </button>

          <button
            onClick={() => onSelectTab("queries")}
            className={`w-full flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold transition ${
              activeTab === "queries"
                ? "bg-white/[0.08] text-white border border-white/10 shadow-sm"
                : "text-gray-400 hover:bg-white/[0.03] hover:text-gray-200"
            }`}
          >
            <span className="text-sm">📜</span>
            <span>History</span>
          </button>

          <button
            onClick={() => onSelectTab("settings")}
            className={`w-full flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold transition ${
              activeTab === "settings"
                ? "bg-white/[0.08] text-white border border-white/10 shadow-sm"
                : "text-gray-400 hover:bg-white/[0.03] hover:text-gray-200"
            }`}
          >
            <span className="text-sm">⚙️</span>
            <span>Settings</span>
          </button>
        </nav>

        {/* Recent Chats Section */}
        <div className="pt-2">
          <div className="flex items-center justify-between px-2 mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
            <span>Recent Chats</span>
            <span className="text-xs text-gray-600">💬</span>
          </div>

          <div className="space-y-0.5">
            {RECENT_CHATS.map((chat, idx) => (
              <button
                key={idx}
                onClick={() => {
                  onSelectRecentQuery(chat.query);
                  onSelectTab("chat");
                }}
                className="w-full text-left rounded-lg px-2.5 py-1.5 text-[11px] text-gray-300 hover:bg-white/[0.04] hover:text-white transition flex items-center justify-between group"
              >
                <div className="flex items-center gap-2 truncate pr-1">
                  <span className="text-xs">{chat.icon}</span>
                  <span className="truncate group-hover:text-indigo-300 transition">{chat.title}</span>
                </div>
                <span className="text-[9px] text-gray-600 whitespace-nowrap">{chat.time}</span>
              </button>
            ))}
          </div>

          <button
            onClick={() => onSelectTab("queries")}
            className="w-full text-left px-2.5 py-1 text-[10px] font-medium text-indigo-400 hover:text-indigo-300 transition mt-1"
          >
            + View all chats
          </button>
        </div>
      </div>

      {/* User Footer Profile */}
      <div className="pt-3 border-t border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-bold text-[11px] ring-2 ring-indigo-500/30 flex-shrink-0">
            {user.name.charAt(0).toUpperCase() || "A"}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white truncate">{user.name}</div>
            <div className="text-[10px] text-gray-500 truncate">{user.email}</div>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="rounded-lg p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition"
          title="Sign Out"
        >
          <span className="text-xs">⏻</span>
        </button>
      </div>
    </aside>
  );
}
