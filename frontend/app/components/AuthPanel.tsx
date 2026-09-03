"use client";

import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export type User = {
  id: number;
  name: string;
  email: string;
  created_at: string;
};

type AuthPanelProps = {
  onAuthSuccess: (token: string, user: User) => void;
};

function formatApiError(detail: any): string {
  if (!detail) return "Authentication failed";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item: any) => {
        if (typeof item === "string") return item;
        if (item.msg) {
          const field = item.loc ? item.loc[item.loc.length - 1] : "";
          return field ? `${field}: ${item.msg}` : item.msg;
        }
        return JSON.stringify(item);
      })
      .join(", ");
  }
  if (typeof detail === "object") {
    return detail.msg || detail.message || detail.detail || JSON.stringify(detail);
  }
  return String(detail);
}

export default function AuthPanel({ onAuthSuccess }: AuthPanelProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Basic email sanity check
    if (!email.includes(".") || !email.includes("@")) {
      setError("Please enter a valid email address with a domain (e.g. alex@gmail.com)");
      return;
    }

    setLoading(true);

    const endpoint = mode === "register" ? "/auth/register" : "/auth/login";
    const payload = mode === "register" ? { name, email, password } : { email, password };

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(formatApiError(data.detail) || "Authentication failed");
      }

      onAuthSuccess(data.access_token, data.user);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-bg flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-950/80 p-8 shadow-2xl backdrop-blur-xl">
        {/* Logo & Header */}
        <div className="mb-6 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 font-bold text-xl mb-3 border border-blue-500/30">
            R
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">RELAY</h1>
          <p className="mt-1 text-sm text-gray-400">Engineering Intelligence Platform</p>
        </div>

        {/* Tabs */}
        <div className="mb-6 grid grid-cols-2 rounded-lg bg-gray-900/80 p-1 border border-gray-800">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            className={`rounded-md py-2 text-sm font-medium transition-all ${
              mode === "login"
                ? "bg-blue-600 text-white shadow-md"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError(null);
            }}
            className={`rounded-md py-2 text-sm font-medium transition-all ${
              mode === "register"
                ? "bg-blue-600 text-white shadow-md"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-950/60 border border-red-800/50 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Developer"
                className="w-full rounded-lg border border-gray-800 bg-gray-900 px-3.5 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@gmail.com"
              className="w-full rounded-lg border border-gray-800 bg-gray-900 px-3.5 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
              Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-gray-800 bg-gray-900 px-3.5 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 transition shadow-lg shadow-blue-600/20"
          >
            {loading ? "Processing..." : mode === "login" ? "Sign In" : "Register Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
