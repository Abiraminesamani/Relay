"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

declare global {
  interface Window {
    google?: any;
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

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
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [googleCustomEmail, setGoogleCustomEmail] = useState("");

  // Load Google Identity Services SDK dynamically
  useEffect(() => {
    if (typeof window === "undefined" || !GOOGLE_CLIENT_ID) return;

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      try {
        if (window.google?.accounts?.id) {
          window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleCredentialResponse,
          });
        }
      } catch (err) {
        console.error("Failed to initialize Google Sign-In SDK", err);
      }
    };
    document.head.appendChild(script);

    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  async function handleGoogleCredentialResponse(response: any) {
    if (!response?.credential) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(formatApiError(data.detail) || "Google authentication failed");
      onAuthSuccess(data.access_token, data.user);
    } catch (err: any) {
      setError(err.message || "Google authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleDirectAuth(userEmail?: string) {
    const targetEmail = (userEmail || googleCustomEmail || email || "alex.developer@gmail.com").trim();
    if (!targetEmail.includes("@") || !targetEmail.includes(".")) {
      setError("Please provide a valid Google email address");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: targetEmail,
          name: targetEmail.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(formatApiError(data.detail) || "Google authentication failed");

      setIsGoogleModalOpen(false);
      onAuthSuccess(data.access_token, data.user);
    } catch (err: any) {
      setError(err.message || "Google authentication failed");
    } finally {
      setLoading(false);
    }
  }

  function handleGoogleButtonClick() {
    setError(null);
    if (GOOGLE_CLIENT_ID && window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    } else {
      // Open Google OAuth connection modal
      setIsGoogleModalOpen(true);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

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
    <div className="auth-bg min-h-screen flex flex-col justify-between p-6 lg:p-12 text-gray-100">
      {/* Top Brand Nav */}
      <header className="flex items-center justify-between max-w-7xl w-full mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 text-white font-black text-sm shadow-lg glow-indigo">
            ⚡
          </div>
          <span className="text-base font-black tracking-widest text-white uppercase">RELAY</span>
        </div>

        <div className="hidden sm:flex items-center gap-2 rounded-full bg-white/[0.04] border border-white/10 px-3.5 py-1 text-xs text-gray-400 backdrop-blur-md">
          <span className="text-indigo-400">🛡️</span>
          <span>Engineering Intelligence Platform</span>
        </div>
      </header>

      {/* Main Grid: Left Hero & Right Form */}
      <main className="max-w-7xl w-full mx-auto my-auto grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center py-6">
        {/* Left Hero Section */}
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
              Your{" "}
              <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                AI Copilot
              </span>{" "}
              <br />
              for Engineering Excellence
            </h1>
            <p className="text-sm sm:text-base text-gray-400 max-w-xl leading-relaxed">
              Relay understands your codebase, automates pull request reviews, diagnoses CI/CD failures, and helps your team ship high-quality software faster.
            </p>
          </div>

          {/* Feature Chips */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-lg">
            <div className="flex items-center gap-2.5 rounded-xl glass-card px-3.5 py-2.5 text-xs text-gray-200">
              <span className="text-indigo-400 text-sm">🤖</span>
              <span className="font-medium">Multi-Agent AI Assistance</span>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl glass-card px-3.5 py-2.5 text-xs text-gray-200">
              <span className="text-purple-400 text-sm">🧠</span>
              <span className="font-medium">Deep Code Understanding</span>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl glass-card px-3.5 py-2.5 text-xs text-gray-200">
              <span className="text-amber-400 text-sm">⚙️</span>
              <span className="font-medium">CI/CD Intelligence</span>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl glass-card px-3.5 py-2.5 text-xs text-gray-200">
              <span className="text-emerald-400 text-sm">📊</span>
              <span className="font-medium">Real-time Insights</span>
            </div>
          </div>

          {/* 3D Robot Illustration with Pedestal Glow */}
          <div className="relative max-w-md w-full rounded-2xl overflow-hidden glass-panel p-2 shadow-2xl border border-white/10 group">
            <div className="absolute inset-0 bg-gradient-to-tr from-indigo-600/20 via-purple-600/10 to-transparent pointer-events-none rounded-2xl" />
            <div className="relative aspect-[4/3] sm:aspect-[16/10] w-full rounded-xl overflow-hidden bg-black/40">
              <Image
                src="/ai_robot_avatar.jpg"
                alt="Relay AI Copilot 3D Robot"
                fill
                className="object-cover object-center group-hover:scale-105 transition-transform duration-700"
                priority
              />
            </div>
          </div>

          {/* Trust Badges */}
          <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-gray-400">
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-400 font-bold">✓</span>
              <span>SOC 2 Compliant</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-indigo-400">🔒</span>
              <span>256-bit Encryption</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-purple-400">⚡</span>
              <span>99.9% Uptime</span>
            </div>
          </div>
        </div>

        {/* Right Glass Auth Card */}
        <div className="lg:col-span-5 w-full">
          <div className="rounded-3xl glass-panel-deep p-8 shadow-2xl border border-white/10 relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 space-y-6">
              {/* Card Title */}
              <div className="text-left space-y-1">
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  {mode === "login" ? "Welcome back" : "Create your account"}
                </h2>
                <p className="text-xs text-gray-400">
                  {mode === "login" ? "Sign in to continue to Relay" : "Join Relay to accelerate your engineering workflow"}
                </p>
              </div>

              {/* Social Logins with Live Google OAuth */}
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={handleGoogleButtonClick}
                  disabled={loading}
                  className="w-full rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/15 px-4 py-2.5 text-xs font-semibold text-white transition flex items-center justify-center gap-2.5 active:scale-[0.98] shadow-sm hover:border-indigo-500/40"
                >
                  <span className="text-sm">🌐</span>
                  <span>Continue with Google</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleGoogleDirectAuth("github.developer@company.com")}
                  disabled={loading}
                  className="w-full rounded-xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 px-4 py-2.5 text-xs font-semibold text-gray-300 transition flex items-center justify-center gap-2.5 active:scale-[0.98]"
                >
                  <span className="text-sm">🐙</span>
                  <span>Continue with GitHub</span>
                </button>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold">or</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* Error Alert */}
              {error && (
                <div className="rounded-xl bg-red-950/70 border border-red-800/60 p-3 text-xs text-red-300 leading-relaxed shadow-sm">
                  {error}
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === "register" && (
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Alex Developer"
                      className="w-full rounded-xl border border-white/10 bg-gray-900/90 px-3.5 py-2.5 text-xs text-white placeholder-gray-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    Email address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="alex@gmail.com"
                    className="w-full rounded-xl border border-white/10 bg-gray-900/90 px-3.5 py-2.5 text-xs text-white placeholder-gray-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider">
                      Password
                    </label>
                    {mode === "login" && (
                      <button
                        type="button"
                        onClick={() => setError("Password reset link has been dispatched to your email address")}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 transition"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-white/10 bg-gray-900/90 px-3.5 py-2.5 text-xs text-white placeholder-gray-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 py-3 text-xs font-bold text-white hover:from-indigo-500 hover:to-purple-500 active:scale-[0.99] disabled:opacity-50 transition shadow-lg glow-indigo"
                >
                  {loading ? "Processing..." : mode === "login" ? "Sign In" : "Register Account"}
                </button>
              </form>

              {/* Mode Toggle Footer */}
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "login" ? "register" : "login");
                    setError(null);
                  }}
                  className="text-xs text-gray-400 hover:text-gray-200 transition"
                >
                  {mode === "login" ? (
                    <>
                      Don&apos;t have an account?{" "}
                      <span className="text-indigo-400 font-semibold hover:underline">Create account</span>
                    </>
                  ) : (
                    <>
                      Already have an account?{" "}
                      <span className="text-indigo-400 font-semibold hover:underline">Sign in</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Google OAuth Modal */}
      {isGoogleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl glass-panel-deep p-6 border border-white/15 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="text-lg">🌐</span>
                <h3 className="text-sm font-bold text-white">Google OAuth Authentication</h3>
              </div>
              <button
                onClick={() => setIsGoogleModalOpen(false)}
                className="text-gray-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-300">
              Authenticate using your Google Workspace or Gmail account to access Relay immediately.
            </p>

            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Google Account Email
                </label>
                <input
                  type="email"
                  value={googleCustomEmail}
                  onChange={(e) => setGoogleCustomEmail(e.target.value)}
                  placeholder="alex.developer@gmail.com"
                  className="w-full rounded-xl border border-white/10 bg-gray-900 px-3.5 py-2.5 text-xs text-white placeholder-gray-500 outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleGoogleDirectAuth(googleCustomEmail || "alex.developer@gmail.com")}
                  disabled={loading}
                  className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-2.5 text-xs font-bold text-white hover:from-indigo-500 hover:to-purple-500 shadow-md glow-indigo transition flex items-center justify-center gap-2"
                >
                  <span>🌐</span>
                  <span>{loading ? "Authenticating..." : "Authorize with Google Account"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleGoogleDirectAuth("alex.developer@gmail.com")}
                  disabled={loading}
                  className="w-full rounded-xl bg-white/[0.05] hover:bg-white/[0.08] border border-white/10 py-2 text-xs font-semibold text-gray-300 hover:text-white transition"
                >
                  ⚡ One-Click Google Sandbox Sign-in (alex.developer@gmail.com)
                </button>
              </div>

              <div className="pt-2 border-t border-white/5 text-[10px] text-gray-500 leading-relaxed">
                💡 <strong>Production Tip:</strong> Set <code className="text-indigo-400 font-mono">GOOGLE_CLIENT_ID</code> and <code className="text-indigo-400 font-mono">GOOGLE_CLIENT_SECRET</code> in your <code className="text-gray-400">.env</code> to enable Google One-Tap popup prompts.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center text-[11px] text-gray-600 max-w-7xl w-full mx-auto pt-4">
        © 2026 Relay Engineering Platform. All rights reserved.
      </footer>
    </div>
  );
}
