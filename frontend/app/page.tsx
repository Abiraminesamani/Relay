"use client";

import { useEffect, useState } from "react";
import AuthPanel, { User } from "./components/AuthPanel";
import Dashboard from "./components/Dashboard";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem("relay_access_token");
    if (!savedToken) {
      setInitializing(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    // Verify token with backend GET /auth/me
    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${savedToken}` },
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Invalid token");
        return res.json();
      })
      .then((userData: User) => {
        setToken(savedToken);
        setUser(userData);
      })
      .catch(() => {
        localStorage.removeItem("relay_access_token");
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        clearTimeout(timeoutId);
        setInitializing(false);
      });
  }, []);

  function handleAuthSuccess(newToken: string, newUser: User) {
    localStorage.setItem("relay_access_token", newToken);
    setToken(newToken);
    setUser(newUser);
  }

  function handleLogout() {
    localStorage.removeItem("relay_access_token");
    setToken(null);
    setUser(null);
  }

  if (initializing) {
    return (
      <div className="auth-bg flex min-h-screen items-center justify-center text-sm text-gray-400">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          Initializing Relay...
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return <AuthPanel onAuthSuccess={handleAuthSuccess} />;
  }

  return <Dashboard token={token} user={user} onLogout={handleLogout} />;
}
