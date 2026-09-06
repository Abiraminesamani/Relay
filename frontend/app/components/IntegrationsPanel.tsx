"use client";

import { useEffect, useState } from "react";
import {
  Webhook,
  Send,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ExternalLink,
  RefreshCw,
  X,
  Radio,
  Sliders,
  Bell,
  Check,
  Zap,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type WebhookItem = {
  id: number;
  user_id: number;
  repository_id: number | null;
  name: string;
  service_type: "slack" | "discord" | "custom";
  webhook_url: string;
  events: string;
  is_active: boolean;
  created_at: string;
  last_triggered_at: string | null;
};

type Repository = {
  id: number;
  name: string;
  repo_url: string;
};

type IntegrationsPanelProps = {
  token: string;
};

export default function IntegrationsPanel({ token }: IntegrationsPanelProps) {
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [serviceType, setServiceType] = useState<"slack" | "discord" | "custom">("slack");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [selectedRepoId, setSelectedRepoId] = useState<number | "">("");
  const [events, setEvents] = useState({
    pr_review: true,
    ci_failure: true,
    security_alert: true,
  });

  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id?: number; success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Broadcast state
  const [broadcastTitle, setBroadcastTitle] = useState("AI PR Review Completed (#142)");
  const [broadcastSummary, setBroadcastSummary] = useState(
    "Relay PR Review Agent detected 0 security vulnerabilities and suggested 2 memory optimizations."
  );
  const [broadcastEventType, setBroadcastEventType] = useState("pr_review");
  const [broadcasting, setBroadcasting] = useState(false);

  async function fetchWebhooks() {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/integrations/webhooks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setWebhooks(data);
      }
    } catch {
      setError("Failed to load configured webhooks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchWebhooks();

    fetch(`${API_BASE}/repositories`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setRepositories(data))
      .catch(() => {});
  }, [token]);

  async function handleAddWebhook(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const activeEvents = Object.entries(events)
      .filter(([_, v]) => v)
      .map(([k]) => k)
      .join(",");

    try {
      const res = await fetch(`${API_BASE}/integrations/webhooks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          service_type: serviceType,
          webhook_url: webhookUrl,
          repository_id: selectedRepoId ? Number(selectedRepoId) : null,
          events: activeEvents,
          is_active: true,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to create webhook");
      }

      setSuccess(`Webhook '${name}' configured successfully!`);
      setName("");
      setWebhookUrl("");
      setIsModalOpen(false);
      await fetchWebhooks();
    } catch (err: any) {
      setError(err.message || "Error creating webhook");
    }
  }

  async function handleTestWebhook(webhook: WebhookItem) {
    setTestingId(webhook.id);
    setTestResult(null);

    try {
      const res = await fetch(`${API_BASE}/integrations/webhooks/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          webhook_id: webhook.id,
          service_type: webhook.service_type,
          webhook_url: webhook.webhook_url,
          title: `Relay ${webhook.service_type.toUpperCase()} Integration Test`,
          message: `Test alert dispatched from Relay AI Engineering Platform to '${webhook.name}'.`,
        }),
      });

      const data = await res.json();
      setTestResult({
        id: webhook.id,
        success: data.success,
        message: data.message,
      });

      if (data.success) {
        setWebhooks((prev) =>
          prev.map((w) =>
            w.id === webhook.id ? { ...w, last_triggered_at: new Date().toISOString() } : w
          )
        );
      }
    } catch (err: any) {
      setTestResult({
        id: webhook.id,
        success: false,
        message: err.message || "Failed to deliver test alert",
      });
    } finally {
      setTestingId(null);
    }
  }

  async function handleDeleteWebhook(id: number, hookName: string) {
    if (!confirm(`Delete webhook '${hookName}'?`)) return;

    try {
      const res = await fetch(`${API_BASE}/integrations/webhooks/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setSuccess(`Webhook '${hookName}' deleted.`);
        setWebhooks((prev) => prev.filter((w) => w.id !== id));
      }
    } catch {
      setError("Failed to delete webhook");
    }
  }

  async function handleBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastSummary.trim()) return;

    setBroadcasting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/integrations/webhooks/broadcast`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          event_type: broadcastEventType,
          title: broadcastTitle,
          summary: broadcastSummary,
          agent_name: "Relay Multi-Agent Copilot",
        }),
      });

      const data = await res.json();
      setSuccess(`Event broadcasted to ${data.dispatched_count} active webhook channels!`);
      await fetchWebhooks();
    } catch {
      setError("Failed to broadcast event to channels");
    } finally {
      setBroadcasting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl w-full mx-auto pb-10">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-white tracking-tight">Integrations & Webhooks</h2>
            <span className="rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-0.5 text-[10px] font-semibold">
              Slack • Discord • Webhooks
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Deliver automated AI PR reviews, CI failure alerts, and security audits to your team channels
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 px-4 py-2.5 text-xs font-bold text-white hover:from-indigo-500 hover:to-purple-500 transition shadow-lg glow-indigo flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Channel Webhook</span>
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-950/70 border border-red-800/60 p-3 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-950/70 border border-emerald-800/60 p-3 text-xs text-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* 3 Integration Provider Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Slack Card */}
        <div className="rounded-2xl glass-card p-4 border border-white/10 relative overflow-hidden flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-[#4A154B]/30 text-[#E01E5A] border border-[#E01E5A]/30">
                  <Webhook className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-white">Slack Channels</span>
              </div>
              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                Supported
              </span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Post rich Block Kit reviews, button actions, and CI triage directly into team channels.
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-white/5 text-[10px] text-gray-500 font-mono">
            Format: Incoming Webhook
          </div>
        </div>

        {/* Discord Card */}
        <div className="rounded-2xl glass-card p-4 border border-white/10 relative overflow-hidden flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-[#5865F2]/20 text-[#5865F2] border border-[#5865F2]/30">
                  <Radio className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-white">Discord Servers</span>
              </div>
              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                Supported
              </span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Broadcast rich embedded alert cards with color-coded severity and build metrics.
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-white/5 text-[10px] text-gray-500 font-mono">
            Format: Discord Webhook API
          </div>
        </div>

        {/* Custom Webhooks Card */}
        <div className="rounded-2xl glass-card p-4 border border-white/10 relative overflow-hidden flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <Zap className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-white">Custom Webhooks</span>
              </div>
              <span className="text-[10px] font-semibold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full">
                JSON REST
              </span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Forward event payloads to internal logging endpoints, PagerDuty, or custom microservices.
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-white/5 text-[10px] text-gray-500 font-mono">
            Format: JSON POST
          </div>
        </div>
      </div>

      {/* Main 2-Column Split View: Configured Webhooks & Live Broadcast Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Configured Webhooks List (7 Columns) */}
        <div className="lg:col-span-7 rounded-2xl glass-panel p-5 border border-white/10 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-white/5">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Connected Webhooks ({webhooks.length})
            </h3>
            <button
              onClick={fetchWebhooks}
              className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1 transition"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh</span>
            </button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-gray-500 flex flex-col items-center gap-2">
              <div className="h-4 w-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
              <span>Loading webhook endpoints...</span>
            </div>
          ) : webhooks.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-500 space-y-2">
              <Bell className="w-6 h-6 text-gray-600 mx-auto" />
              <p className="font-semibold text-gray-400">No webhooks configured yet</p>
              <p>Click &quot;Add Channel Webhook&quot; above to connect Slack or Discord.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {webhooks.map((hook) => {
                const isTesting = testingId === hook.id;
                const result = testResult?.id === hook.id ? testResult : null;

                return (
                  <div
                    key={hook.id}
                    className="rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] p-4 transition space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-xs truncate">{hook.name}</span>
                          <span
                            className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                              hook.service_type === "slack"
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                : hook.service_type === "discord"
                                ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                                : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                            }`}
                          >
                            {hook.service_type}
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono truncate max-w-md">
                          {hook.webhook_url}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => handleTestWebhook(hook)}
                          disabled={isTesting}
                          className="rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 px-2.5 py-1 text-[11px] font-semibold transition flex items-center gap-1 disabled:opacity-50"
                        >
                          {isTesting ? (
                            <>
                              <div className="h-3 w-3 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                              <span>Testing...</span>
                            </>
                          ) : (
                            <>
                              <Send className="w-3 h-3" />
                              <span>Test Ping</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => handleDeleteWebhook(hook.id, hook.name)}
                          className="rounded-lg border border-red-500/20 bg-red-950/20 p-1.5 text-xs text-red-400 hover:bg-red-950/60 transition"
                          title="Delete Webhook"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5 text-[10px] text-gray-400">
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-500">Subscribed Events:</span>
                        <span className="text-gray-300 font-mono">{hook.events}</span>
                      </div>

                      {hook.last_triggered_at && (
                        <div className="flex items-center gap-1 text-gray-500">
                          <Clock className="w-3 h-3" />
                          <span>Last active {new Date(hook.last_triggered_at).toLocaleTimeString()}</span>
                        </div>
                      )}
                    </div>

                    {result && (
                      <div
                        className={`rounded-lg p-2.5 text-xs flex items-center gap-2 ${
                          result.success
                            ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/40"
                            : "bg-red-950/60 text-red-300 border border-red-800/40"
                        }`}
                      >
                        {result.success ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                        )}
                        <span className="truncate">{result.message}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Live Broadcast Simulator (5 Columns) */}
        <div className="lg:col-span-5 rounded-2xl glass-panel p-5 border border-white/10 flex flex-col justify-between shadow-xl">
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-white/5">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Broadcast AI Alert
              </h3>
            </div>

            <p className="text-xs text-gray-400 leading-relaxed">
              Test broadcasting real-time AI triage summaries across all connected Slack, Discord, and custom channels simultaneously.
            </p>

            <form onSubmit={handleBroadcast} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1">
                  Event Type
                </label>
                <select
                  value={broadcastEventType}
                  onChange={(e) => setBroadcastEventType(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-gray-900 px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                >
                  <option value="pr_review">Pull Request Review Completed</option>
                  <option value="ci_failure">CI/CD Build Pipeline Failure</option>
                  <option value="security_alert">Security Audit Vulnerability</option>
                  <option value="daily_summary">Daily Engineering Summary</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1">
                  Alert Title
                </label>
                <input
                  type="text"
                  required
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-gray-900 px-3 py-2 text-xs text-white placeholder-gray-500 outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1">
                  Summary / Message Body
                </label>
                <textarea
                  rows={3}
                  required
                  value={broadcastSummary}
                  onChange={(e) => setBroadcastSummary(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-gray-900 px-3 py-2 text-xs text-white placeholder-gray-500 outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={broadcasting || webhooks.length === 0}
                className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-2.5 text-xs font-bold text-white hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 transition shadow-md glow-indigo flex items-center justify-center gap-2"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{broadcasting ? "Broadcasting..." : "Broadcast Event to All Channels"}</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Add Webhook Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl glass-panel-deep p-6 border border-white/15 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Webhook className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">Add Channel Webhook</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddWebhook} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1">
                  Integration Service
                </label>
                <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setServiceType("slack")}
                    className={`rounded-xl p-2.5 border transition flex items-center justify-center gap-1.5 ${
                      serviceType === "slack"
                        ? "bg-indigo-600 text-white border-indigo-500"
                        : "bg-gray-900 text-gray-400 border-white/10 hover:text-white"
                    }`}
                  >
                    <span>Slack</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setServiceType("discord")}
                    className={`rounded-xl p-2.5 border transition flex items-center justify-center gap-1.5 ${
                      serviceType === "discord"
                        ? "bg-indigo-600 text-white border-indigo-500"
                        : "bg-gray-900 text-gray-400 border-white/10 hover:text-white"
                    }`}
                  >
                    <span>Discord</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setServiceType("custom")}
                    className={`rounded-xl p-2.5 border transition flex items-center justify-center gap-1.5 ${
                      serviceType === "custom"
                        ? "bg-indigo-600 text-white border-indigo-500"
                        : "bg-gray-900 text-gray-400 border-white/10 hover:text-white"
                    }`}
                  >
                    <span>Custom</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1">
                  Channel / Webhook Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. #engineering-alerts or Discord Alerts"
                  className="w-full rounded-xl border border-white/10 bg-gray-900 px-3.5 py-2.5 text-xs text-white placeholder-gray-500 outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1">
                  Webhook URL
                </label>
                <input
                  type="url"
                  required
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder={
                    serviceType === "slack"
                      ? "https://hooks.slack.com/services/..."
                      : serviceType === "discord"
                      ? "https://discord.com/api/webhooks/..."
                      : "https://api.yourdomain.com/webhook"
                  }
                  className="w-full rounded-xl border border-white/10 bg-gray-900 px-3.5 py-2.5 text-xs text-white placeholder-gray-500 outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Subscribed Event Triggers
                </label>
                <div className="space-y-1.5 text-xs">
                  <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={events.pr_review}
                      onChange={(e) => setEvents({ ...events, pr_review: e.target.checked })}
                      className="rounded border-gray-700 bg-gray-900 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Pull Request Reviews</span>
                  </label>
                  <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={events.ci_failure}
                      onChange={(e) => setEvents({ ...events, ci_failure: e.target.checked })}
                      className="rounded border-gray-700 bg-gray-900 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>CI/CD Workflow Failures</span>
                  </label>
                  <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={events.security_alert}
                      onChange={(e) => setEvents({ ...events, security_alert: e.target.checked })}
                      className="rounded border-gray-700 bg-gray-900 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Security & Vulnerability Alerts</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-white/[0.08]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 shadow-md glow-indigo"
                >
                  Save Webhook
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
