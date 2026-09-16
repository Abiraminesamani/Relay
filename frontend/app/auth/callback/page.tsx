"use client";

import { useEffect, useState } from "react";
import { Zap, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export default function AuthCallbackPage() {
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    async function processAuth() {
      try {
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

        localStorage.setItem("relay_access_token", data.access_token);

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
    <div className="min-h-screen bg-[#08090A] flex items-center justify-center p-6 text-[#F5F5F5]">
      <div className="max-w-md w-full rounded-2xl bg-[#111214] p-8 border border-[#24262A] text-center space-y-5 shadow-2xl">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#6366F1] text-white mx-auto shadow-md">
          <Zap className="w-6 h-6 text-white" />
        </div>

        {status === "processing" && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-[#F5F5F5]">Completing Google Sign-in...</h2>
            <div className="flex justify-center items-center gap-2 text-xs text-[#8B8F98]">
              <div className="h-4 w-4 rounded-full border-2 border-[#6366F1] border-t-transparent animate-spin" />
              <span>Verifying credentials with Relay Security Engine...</span>
            </div>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-[#22C55E]">
              <CheckCircle2 className="w-5 h-5" />
              <h2 className="text-lg font-bold">Authentication Successful!</h2>
            </div>
            <p className="text-xs text-[#8B8F98]">Redirecting to Relay Dashboard...</p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 text-[#EF4444]">
              <AlertCircle className="w-5 h-5" />
              <h2 className="text-lg font-bold">Authentication Failed</h2>
            </div>
            <p className="text-xs text-[#EF4444] leading-relaxed bg-[#EF4444]/10 p-3 rounded-xl border border-[#EF4444]/30">
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
              className="w-full rounded-xl bg-[#17181B] hover:bg-[#24262A] border border-[#24262A] py-2.5 text-xs font-semibold text-[#F5F5F5] transition flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Sign In</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
