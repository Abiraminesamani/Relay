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
            <h2 className="text-2xl font-bold text-[#F5F5F5] tracking-tight">Integrations & Webhooks</h2>
            <span className="rounded-full bg-[#17181B] text-[#8B8F98] border border-[#24262A] px-2.5 py-0.5 text-[10px] font-semibold">
              Slack • Discord • Webhooks
            </span>
          </div>
          <p className="text-xs text-[#8B8F98] mt-0.5">
            Deliver automated AI PR reviews, CI failure alerts, and security audits to your team channels
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="rounded-xl bg-[#6366F1] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#4F46E5] transition shadow-sm flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Channel Webhook</span>
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 p-3 text-xs text-[#EF4444]">
          <AlertCircle className="w-4 h-4 text-[#EF4444] flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-xl bg-[#22C55E]/10 border border-[#22C55E]/30 p-3 text-xs text-[#22C55E]">
          <CheckCircle2 className="w-4 h-4 text-[#22C55E] flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* 3 Integration Provider Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Slack Card */}
        <div className="rounded-2xl bg-[#111214] p-4 border border-[#24262A] relative overflow-hidden flex flex-col justify-between hover:bg-[#17181B] transition">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-[#17181B] text-[#F5F5F5] border border-[#24262A]">
                  <Webhook className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-[#F5F5F5]">Slack Channels</span>
              </div>
              <span className="text-[10px] font-semibold text-[#22C55E] bg-[#22C55E]/10 px-2 py-0.5 rounded-full border border-[#22C55E]/20">
                Supported
              </span>
            </div>
            <p className="text-[11px] text-[#8B8F98] leading-relaxed">
              Post rich Block Kit reviews, button actions, and CI triage directly into team channels.
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-[#24262A] text-[10px] text-[#8B8F98] font-mono">
            Format: Incoming Webhook
          </div>
        </div>

        {/* Discord Card */}
        <div className="rounded-2xl bg-[#111214] p-4 border border-[#24262A] relative overflow-hidden flex flex-col justify-between hover:bg-[#17181B] transition">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-[#17181B] text-[#F5F5F5] border border-[#24262A]">
                  <Radio className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-[#F5F5F5]">Discord Servers</span>
              </div>
              <span className="text-[10px] font-semibold text-[#22C55E] bg-[#22C55E]/10 px-2 py-0.5 rounded-full border border-[#22C55E]/20">
                Supported
              </span>
            </div>
            <p className="text-[11px] text-[#8B8F98] leading-relaxed">
              Broadcast rich embedded alert cards with color-coded severity and build metrics.
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-[#24262A] text-[10px] text-[#8B8F98] font-mono">
            Format: Discord Webhook API
          </div>
        </div>

        {/* Custom Webhooks Card */}
        <div className="rounded-2xl bg-[#111214] p-4 border border-[#24262A] relative overflow-hidden flex flex-col justify-between hover:bg-[#17181B] transition">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-[#17181B] text-[#6366F1] border border-[#24262A]">
                  <Zap className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-[#F5F5F5]">Custom Webhooks</span>
              </div>
              <span className="text-[10px] font-semibold text-[#8B8F98] bg-[#17181B] px-2 py-0.5 rounded-full border border-[#24262A]">
                JSON REST
              </span>
            </div>
            <p className="text-[11px] text-[#8B8F98] leading-relaxed">
              Forward event payloads to internal logging endpoints, PagerDuty, or custom microservices.
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-[#24262A] text-[10px] text-[#8B8F98] font-mono">
            Format: JSON POST
          </div>
        </div>
      </div>

      {/* Main 2-Column Split View: Configured Webhooks & Live Broadcast Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Configured Webhooks List (7 Columns) */}
        <div className="lg:col-span-7 rounded-2xl bg-[#111214] p-5 border border-[#24262A] space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#24262A]">
            <h3 className="text-xs font-bold text-[#F5F5F5] uppercase tracking-wider">
              Connected Webhooks ({webhooks.length})
            </h3>
            <button
              onClick={fetchWebhooks}
              className="text-[11px] text-[#8B8F98] hover:text-[#F5F5F5] flex items-center gap-1 transition"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh</span>
            </button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-[#8B8F98] flex flex-col items-center gap-2">
              <div className="h-4 w-4 rounded-full border-2 border-[#6366F1] border-t-transparent animate-spin" />
              <span>Loading webhook endpoints...</span>
            </div>
          ) : webhooks.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#8B8F98] space-y-2">
              <Bell className="w-6 h-6 text-[#5C6068] mx-auto" />
              <p className="font-semibold text-[#F5F5F5]">No webhooks configured yet</p>
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
                    className="rounded-xl border border-[#24262A] bg-[#0C0D0F] hover:bg-[#17181B] p-4 transition space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#F5F5F5] text-xs truncate">{hook.name}</span>
                          <span
                            className="text-[9px] font-semibold uppercase px-2 py-0.5 rounded-full bg-[#17181B] text-[#8B8F98] border border-[#24262A]"
                          >
                            {hook.service_type}
                          </span>
                        </div>
                        <div className="text-[10px] text-[#8B8F98] font-mono truncate max-w-md">
                          {hook.webhook_url}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => handleTestWebhook(hook)}
                          disabled={isTesting}
                          className="rounded-lg bg-[#17181B] hover:bg-[#24262A] text-[#F5F5F5] border border-[#24262A] px-2.5 py-1 text-[11px] font-semibold transition flex items-center gap-1 disabled:opacity-50"
                        >
                          {isTesting ? (
                            <>
                              <div className="h-3 w-3 rounded-full border-2 border-[#6366F1] border-t-transparent animate-spin" />
                              <span>Testing...</span>
                            </>
                          ) : (
                            <>
                              <Send className="w-3 h-3 text-[#6366F1]" />
                              <span>Test Ping</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => handleDeleteWebhook(hook.id, hook.name)}
                          className="rounded-lg border border-[#EF4444]/20 bg-[#EF4444]/10 p-1.5 text-xs text-[#EF4444] hover:bg-[#EF4444]/20 transition"
                          title="Delete Webhook"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#24262A] text-[10px] text-[#8B8F98]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#8B8F98]">Subscribed Events:</span>
                        <span className="text-[#F5F5F5] font-mono">{hook.events}</span>
                      </div>

                      {hook.last_triggered_at && (
                        <div className="flex items-center gap-1 text-[#8B8F98]">
                          <Clock className="w-3 h-3" />
                          <span>Last active {new Date(hook.last_triggered_at).toLocaleTimeString()}</span>
                        </div>
                      )}
                    </div>

                    {result && (
                      <div
                        className={`rounded-lg p-2.5 text-xs flex items-center gap-2 ${
                          result.success
                            ? "bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/30"
                            : "bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/30"
                        }`}
                      >
                        {result.success ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#22C55E] flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-[#EF4444] flex-shrink-0" />
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
        <div className="lg:col-span-5 rounded-2xl bg-[#111214] p-5 border border-[#24262A] flex flex-col justify-between shadow-sm">
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-[#24262A]">
              <Sparkles className="w-4 h-4 text-[#6366F1]" />
              <h3 className="text-xs font-bold text-[#F5F5F5] uppercase tracking-wider">
                Broadcast AI Alert
              </h3>
            </div>

            <p className="text-xs text-[#8B8F98] leading-relaxed">
              Test broadcasting real-time AI triage summaries across all connected Slack, Discord, and custom channels simultaneously.
            </p>

            <form onSubmit={handleBroadcast} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-[#8B8F98] uppercase tracking-wider mb-1">
                  Event Type
                </label>
                <select
                  value={broadcastEventType}
                  onChange={(e) => setBroadcastEventType(e.target.value)}
                  className="w-full rounded-xl border border-[#24262A] bg-[#0C0D0F] px-3 py-2 text-xs text-[#F5F5F5] outline-none focus:border-[#6366F1]"
                >
                  <option value="pr_review" className="bg-[#0C0D0F]">Pull Request Review Completed</option>
                  <option value="ci_failure" className="bg-[#0C0D0F]">CI/CD Build Pipeline Failure</option>
                  <option value="security_alert" className="bg-[#0C0D0F]">Security Audit Vulnerability</option>
                  <option value="daily_summary" className="bg-[#0C0D0F]">Daily Engineering Summary</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#8B8F98] uppercase tracking-wider mb-1">
                  Alert Title
                </label>
                <input
                  type="text"
                  required
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  className="w-full rounded-xl border border-[#24262A] bg-[#0C0D0F] px-3 py-2 text-xs text-[#F5F5F5] placeholder-[#8B8F98] outline-none focus:border-[#6366F1]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#8B8F98] uppercase tracking-wider mb-1">
                  Summary / Message Body
                </label>
                <textarea
                  rows={3}
                  required
                  value={broadcastSummary}
                  onChange={(e) => setBroadcastSummary(e.target.value)}
                  className="w-full rounded-xl border border-[#24262A] bg-[#0C0D0F] px-3 py-2 text-xs text-[#F5F5F5] placeholder-[#8B8F98] outline-none focus:border-[#6366F1] resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={broadcasting || webhooks.length === 0}
                className="w-full rounded-xl bg-[#6366F1] py-2.5 text-xs font-semibold text-white hover:bg-[#4F46E5] disabled:opacity-40 transition shadow-sm flex items-center justify-center gap-2"
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
          <div className="w-full max-w-md rounded-2xl bg-[#0C0D0F] p-6 border border-[#24262A] shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#24262A]">
              <div className="flex items-center gap-2">
                <Webhook className="w-4 h-4 text-[#6366F1]" />
                <h3 className="text-sm font-bold text-[#F5F5F5]">Add Channel Webhook</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-[#8B8F98] hover:text-[#F5F5F5] p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddWebhook} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-[#8B8F98] uppercase tracking-wider mb-1">
                  Integration Service
                </label>
                <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setServiceType("slack")}
                    className={`rounded-xl p-2.5 border transition flex items-center justify-center gap-1.5 ${
                      serviceType === "slack"
                        ? "bg-[#6366F1] text-white border-[#6366F1]"
                        : "bg-[#111214] text-[#8B8F98] border-[#24262A] hover:text-[#F5F5F5]"
                    }`}
                  >
                    <span>Slack</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setServiceType("discord")}
                    className={`rounded-xl p-2.5 border transition flex items-center justify-center gap-1.5 ${
                      serviceType === "discord"
                        ? "bg-[#6366F1] text-white border-[#6366F1]"
                        : "bg-[#111214] text-[#8B8F98] border-[#24262A] hover:text-[#F5F5F5]"
                    }`}
                  >
                    <span>Discord</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setServiceType("custom")}
                    className={`rounded-xl p-2.5 border transition flex items-center justify-center gap-1.5 ${
                      serviceType === "custom"
                        ? "bg-[#6366F1] text-white border-[#6366F1]"
                        : "bg-[#111214] text-[#8B8F98] border-[#24262A] hover:text-[#F5F5F5]"
                    }`}
                  >
                    <span>Custom</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#8B8F98] uppercase tracking-wider mb-1">
                  Channel / Webhook Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. #engineering-alerts or Discord Alerts"
                  className="w-full rounded-xl border border-[#24262A] bg-[#111214] px-3.5 py-2.5 text-xs text-[#F5F5F5] placeholder-[#8B8F98] outline-none focus:border-[#6366F1]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#8B8F98] uppercase tracking-wider mb-1">
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
                  className="w-full rounded-xl border border-[#24262A] bg-[#111214] px-3.5 py-2.5 text-xs text-[#F5F5F5] placeholder-[#8B8F98] outline-none focus:border-[#6366F1]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#8B8F98] uppercase tracking-wider mb-1.5">
                  Subscribed Event Triggers
                </label>
                <div className="space-y-1.5 text-xs">
                  <label className="flex items-center gap-2 text-[#F5F5F5] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={events.pr_review}
                      onChange={(e) => setEvents({ ...events, pr_review: e.target.checked })}
                      className="rounded border-[#24262A] bg-[#111214] text-[#6366F1] focus:ring-[#6366F1]"
                    />
                    <span>Pull Request Reviews</span>
                  </label>
                  <label className="flex items-center gap-2 text-[#F5F5F5] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={events.ci_failure}
                      onChange={(e) => setEvents({ ...events, ci_failure: e.target.checked })}
                      className="rounded border-[#24262A] bg-[#111214] text-[#6366F1] focus:ring-[#6366F1]"
                    />
                    <span>CI/CD Workflow Failures</span>
                  </label>
                  <label className="flex items-center gap-2 text-[#F5F5F5] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={events.security_alert}
                      onChange={(e) => setEvents({ ...events, security_alert: e.target.checked })}
                      className="rounded border-[#24262A] bg-[#111214] text-[#6366F1] focus:ring-[#6366F1]"
                    />
                    <span>Security & Vulnerability Alerts</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#24262A]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-[#24262A] bg-[#17181B] px-4 py-2 text-xs font-semibold text-[#8B8F98] hover:text-[#F5F5F5]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#6366F1] px-4 py-2 text-xs font-semibold text-white hover:bg-[#4F46E5] shadow-sm"
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
