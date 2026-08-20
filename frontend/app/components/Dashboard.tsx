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

  return (
    <div className="min-h-screen bg-[#0b0c0e] text-gray-100 flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 border-b border-gray-800/80 bg-gray-950/80 backdrop-blur-xl px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 font-bold text-lg border border-blue-500/30">
            R
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-wide">RELAY</h1>
            <p className="text-[11px] text-gray-400">Engineering Intelligence</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 rounded-xl bg-gray-900/80 p-1 border border-gray-800">
          <button
            onClick={() => setActiveTab("chat")}
            className={`rounded-lg px-4 py-1.5 text-xs font-medium transition ${
              activeTab === "chat"
                ? "bg-blue-600 text-white shadow-md"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            💬 AI Copilot
          </button>
          <button
            onClick={() => setActiveTab("repos")}
            className={`rounded-lg px-4 py-1.5 text-xs font-medium transition ${
              activeTab === "repos"
                ? "bg-blue-600 text-white shadow-md"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            📁 Repositories
          </button>
          <button
            onClick={() => setActiveTab("queries")}
            className={`rounded-lg px-4 py-1.5 text-xs font-medium transition ${
              activeTab === "queries"
                ? "bg-blue-600 text-white shadow-md"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            📜 Query History
          </button>
        </nav>

        {/* User Info & Logout */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-medium text-white">{user.name}</div>
            <div className="text-[11px] text-gray-400">{user.email}</div>
          </div>
          <button
            onClick={onLogout}
            className="rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-1.5 text-xs text-gray-400 hover:bg-red-950/40 hover:text-red-300 hover:border-red-800/50 transition"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content View */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6">
        {activeTab === "chat" && <ChatPanel token={token} />}
        {activeTab === "repos" && <RepositoryManager token={token} />}
        {activeTab === "queries" && <QueryHistory token={token} />}
      </main>
    </div>
  );
}
