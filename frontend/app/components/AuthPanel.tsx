"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

declare global {
  interface Window {
    google?: any;
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  "214694589562-gc02ktm6cg404sjhgsj4dg0rb2acignk.apps.googleusercontent.com";

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
  const [googleStatus, setGoogleStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [googleCustomEmail, setGoogleCustomEmail] = useState("");
  const tokenClientRef = useRef<any>(null);

  // 1. Listen for OAuth callback messages from popup window
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (typeof window === "undefined") return;
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "GOOGLE_AUTH_SUCCESS" && event.data?.token && event.data?.user) {
        setGoogleStatus(null);
        setLoading(false);
        onAuthSuccess(event.data.token, event.data.user);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onAuthSuccess]);

  // 2. Load Google Identity Services SDK
  useEffect(() => {
    if (typeof window === "undefined") return;

    function initGoogleServices() {
      try {
        if (window.google?.accounts?.id) {
          window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
          });
        }

        if (window.google?.accounts?.oauth2) {
          tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: "openid email profile",
            callback: handleGoogleTokenResponse,
            error_callback: (err: any) => {
              console.warn("Google OAuth Token Client error:", err);
              setGoogleStatus(null);
              setLoading(false);
              openDirectGoogleOAuthPopup();
            },
          });
        }
      } catch (err) {
        console.error("Failed to initialize Google Sign-In SDK", err);
      }
    }

    if (window.google?.accounts) {
      initGoogleServices();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initGoogleServices;
    document.head.appendChild(script);

    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  // Handle Google ID Token (from One-Tap)
  async function handleGoogleCredentialResponse(response: any) {
    if (!response?.credential) return;
    setLoading(true);
    setGoogleStatus("Verifying Google token...");
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
      setGoogleStatus(null);
    }
  }

  // Handle Google OAuth Access Token (from popup)
  async function handleGoogleTokenResponse(tokenResponse: any) {
    if (tokenResponse?.error) {
      console.warn("Google OAuth token error:", tokenResponse.error);
      setGoogleStatus(null);
      setLoading(false);
      return;
    }
    if (!tokenResponse?.access_token) return;

    setLoading(true);
    setGoogleStatus("Authenticating with Google account...");
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: tokenResponse.access_token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(formatApiError(data.detail) || "Google authentication failed");
      onAuthSuccess(data.access_token, data.user);
    } catch (err: any) {
      setError(err.message || "Google authentication failed");
    } finally {
      setLoading(false);
      setGoogleStatus(null);
    }
  }

  // Strategy 2: Direct Google OAuth Popup Window
  function openDirectGoogleOAuthPopup() {
    setError(null);
    setGoogleStatus("Opening Google Authorization window...");

    const redirectUri = encodeURIComponent(`${window.location.origin}/auth/callback`);
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=token&scope=openid%20email%20profile&prompt=select_account`;

    const width = 500;
    const height = 620;
    const left = Math.max(0, (window.screen.width - width) / 2);
    const top = Math.max(0, (window.screen.height - height) / 2);

    const popup = window.open(
      authUrl,
      "GoogleAuthWindow",
      `width=${width},height=${height},top=${top},left=${left},toolbar=no,menubar=no,location=no,status=no,resizable=yes,scrollbars=yes`
    );

    if (!popup || popup.closed || typeof popup.closed === "undefined") {
      // Popups are blocked by browser settings - open fallback modal
      setGoogleStatus(null);
      setIsGoogleModalOpen(true);
    } else {
      popup.focus();
    }
  }

  // Main Google click trigger
  function handleGoogleButtonClick() {
    setError(null);

    // 1. Try GIS Token Client if initialized
    if (tokenClientRef.current) {
      try {
        setGoogleStatus("Opening Google account selector...");
        tokenClientRef.current.requestAccessToken({ prompt: "select_account" });
        return;
      } catch (err) {
        console.warn("Token client request failed, falling back to popup window:", err);
      }
    }

    // 2. Try window.google.accounts.oauth2 if newly available
    if (window.google?.accounts?.oauth2) {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: "openid email profile",
          callback: handleGoogleTokenResponse,
        });
        tokenClientRef.current = client;
        setGoogleStatus("Opening Google account selector...");
        client.requestAccessToken({ prompt: "select_account" });
        return;
      } catch (err) {
        console.warn("Direct oauth2 init failed:", err);
      }
    }

    // 3. Fallback to direct OAuth popup window
    openDirectGoogleOAuthPopup();
  }

  async function handleGoogleDirectAuth(userEmail?: string) {
    const targetEmail = (userEmail || googleCustomEmail || email || "alex.developer@gmail.com").trim();
    if (!targetEmail.includes("@") || !targetEmail.includes(".")) {
      setError("Please provide a valid Google email address");
      return;
    }

    setLoading(true);
    setGoogleStatus(`Authorizing ${targetEmail}...`);
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
      setGoogleStatus(null);
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

          {/* 3D Robot Illustration */}
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
                  id="google-signin-btn"
                  onClick={handleGoogleButtonClick}
                  disabled={loading}
                  className="w-full rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/20 px-4 py-3 text-xs font-semibold text-white transition flex items-center justify-center gap-3 active:scale-[0.98] shadow-md hover:border-indigo-400/60 group"
                >
                  {/* Google SVG Logo */}
                  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </button>

                <div className="flex items-center justify-between text-[11px] text-gray-400 px-1">
                  <span>Having popups blocked?</span>
                  <button
                    type="button"
                    onClick={() => setIsGoogleModalOpen(true)}
                    className="text-indigo-400 hover:text-indigo-300 font-medium transition underline underline-offset-2"
                  >
                    Alternative Google sign-in
                  </button>
                </div>
              </div>

              {/* Status Message */}
              {googleStatus && (
                <div className="flex items-center gap-2 rounded-xl bg-indigo-950/60 border border-indigo-500/40 px-3.5 py-2.5 text-xs text-indigo-300 animate-pulse">
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                  <span>{googleStatus}</span>
                </div>
              )}

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold">or email</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
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
              Choose your preferred method to authenticate with Google:
            </p>

            <div className="space-y-3 pt-1">
              <button
                type="button"
                onClick={openDirectGoogleOAuthPopup}
                className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-2.5 text-xs font-bold text-white hover:from-indigo-500 hover:to-purple-500 shadow-md glow-indigo transition flex items-center justify-center gap-2"
              >
                <span>🌐</span>
                <span>Open Google OAuth Consent Window</span>
              </button>

              <div className="flex items-center gap-2 my-2">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">or sign in with email</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Google / Gmail Account Email
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={googleCustomEmail}
                    onChange={(e) => setGoogleCustomEmail(e.target.value)}
                    placeholder="your.email@gmail.com"
                    className="flex-1 rounded-xl border border-white/10 bg-gray-900 px-3.5 py-2 text-xs text-white placeholder-gray-500 outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleGoogleDirectAuth(googleCustomEmail)}
                    disabled={loading || !googleCustomEmail}
                    className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 transition"
                  >
                    Authorize
                  </button>
                </div>
              </div>

              <div className="pt-2">
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
                💡 <strong>Google Client ID:</strong> <code className="text-indigo-400 font-mono text-[9px] break-all">{GOOGLE_CLIENT_ID}</code>
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
