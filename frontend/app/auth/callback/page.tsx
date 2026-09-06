"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export default function AuthCallbackPage() {
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    async function processAuth() {
      try {
        // 1. Parse tokens from URL hash (#access_token=...) or query string (?code=...)
        const hash = window.location.hash.substring(1);
        const hashParams = new URLSearchParams(hash);
        const accessToken = hashParams.get("access_token");

        const searchParams = new URLSearchParams(window.location.search);
        const code = searchParams.get("code");
        const error = searchParams.get("error") || hashParams.get("error");

        if (error) {
          throw new Error(`Google authorization error: ${error}`);
        }

        let payload: Record<string, any> = {};
        if (accessToken) {
          payload = { access_token: accessToken };
        } else if (code) {
          payload = { code };
        } else {
          throw new Error("No authorization token or code received from Google");
        }

        // 2. Exchange token with backend
        const res = await fetch(`${API_BASE}/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || "Authentication verification failed");
        }

        setStatus("success");

        // 3. Save access token locally
        localStorage.setItem("relay_access_token", data.access_token);

        // 4. If in a popup, inform opener window and close
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(
            {
              type: "GOOGLE_AUTH_SUCCESS",
              token: data.access_token,
              user: data.user,
            },
            window.location.origin
          );
          setTimeout(() => {
            window.close();
          }, 600);
          return;
        }

        // 5. Otherwise redirect to main dashboard
        setTimeout(() => {
          window.location.href = "/";
        }, 800);
      } catch (err: any) {
        setStatus("error");
        setErrorMessage(err.message || "Authentication failed");
      }
    }

    processAuth();
  }, []);

  return (
    <div className="auth-bg min-h-screen flex items-center justify-center p-6 text-gray-100">
      <div className="max-w-md w-full rounded-2xl glass-panel-deep p-8 border border-white/10 text-center space-y-4 shadow-2xl">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 text-white text-xl font-bold mx-auto shadow-lg glow-indigo">
          ⚡
        </div>

        {status === "processing" && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-white">Completing Google Sign-in...</h2>
            <div className="flex justify-center items-center gap-2 text-xs text-indigo-300">
              <div className="h-4 w-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
              <span>Verifying credentials with Relay Security Engine...</span>
            </div>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-emerald-400">Authentication Successful!</h2>
            <p className="text-xs text-gray-300">Redirecting to Relay Dashboard...</p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-red-400">Authentication Failed</h2>
            <p className="text-xs text-red-300/90 leading-relaxed bg-red-950/60 p-3 rounded-xl border border-red-800/40">
              {errorMessage}
            </p>
            <button
              onClick={() => {
                if (window.opener) {
                  window.close();
                } else {
                  window.location.href = "/";
                }
              }}
              className="w-full rounded-xl bg-white/10 hover:bg-white/15 py-2.5 text-xs font-semibold text-white transition"
            >
              Back to Sign In
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
