import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  Settings, Power, RefreshCw, Save, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/lib/i18n";

export const Route = createFileRoute("/_app/call-center/configuration")({
  component: ConfigurationPage,
});

// Mirrors the backend AgentConfigOut Pydantic model.
type AgentConfig = {
  enabled: boolean;
  bind_host: string;
  bind_port: number;
  voice: string;
  greeting: string;
  max_call_s: number;
  interruption_enabled: boolean;
};

type AgentStatus = {
  running: boolean;
  enabled: boolean;
  host: string;
  port: number;
  active: number;
  bound_at: number | null;
  last_error: string | null;
  calls: unknown[];
  persona_chars: number;
  kb_chars: number;
  api_key_set: boolean;
};

const VOICES = ["Aoede", "Kore", "Leda", "Charon", "Fenrir", "Orus", "Puck"];

function ConfigurationPage() {
  const { t } = useApp();
  const [cfg, setCfg] = useState<AgentConfig | null>(null);
  const [draft, setDraft] = useState<AgentConfig | null>(null);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const loadCfg = useCallback(async () => {
    try {
      const r = await fetch("/api/demo/clinic/agent/config");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: AgentConfig = await r.json();
      setCfg(data);
      setDraft(data);
      setLoadErr(null);
    } catch (e: any) {
      setLoadErr(e?.message || t("backendUnreachable"));
    }
  }, [t]);

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/demo/clinic/agent/status");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: AgentStatus = await r.json();
      setStatus(data);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    loadCfg();
    loadStatus();
    const id = window.setInterval(loadStatus, 5000);
    return () => window.clearInterval(id);
  }, [loadCfg, loadStatus]);

  const dirty = !!(cfg && draft && JSON.stringify(cfg) !== JSON.stringify(draft));

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const r = await fetch("/api/demo/clinic/agent/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: AgentConfig = await r.json();
      setCfg(data);
      setDraft(data);
      setSaveMsg({ kind: "ok", text: t("saved") });
      // Re-pull status because enabling/disabling the agent or changing port
      // toggles whether the listener is bound.
      setTimeout(loadStatus, 300);
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (e: any) {
      setSaveMsg({ kind: "err", text: e?.message || "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  // Quick "Power" toggle in the header — flips enabled and saves in one click.
  const togglePower = async () => {
    if (!cfg) return;
    const next = { ...cfg, enabled: !cfg.enabled };
    setDraft(next);
    setSaving(true);
    setSaveMsg(null);
    try {
      const r = await fetch("/api/demo/clinic/agent/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next.enabled }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: AgentConfig = await r.json();
      setCfg(data);
      setDraft(data);
      setTimeout(loadStatus, 300);
    } catch (e: any) {
      setSaveMsg({ kind: "err", text: e?.message || "Toggle failed" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("callCenter")} · {t("configuration")}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("configDesc")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={cfg?.enabled ? "default" : "outline"}
            onClick={togglePower}
            disabled={!cfg || saving}
            className={cfg?.enabled ? "bg-emerald-600 hover:bg-emerald-700" : ""}
          >
            <Power className="me-2 h-4 w-4" />
            {cfg?.enabled ? t("agentRunning") : t("agentStopped")}
          </Button>
        </div>
      </div>

      {loadErr && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <strong>{t("backendUnreachable")}:</strong> {loadErr}
        </div>
      )}

      {/* Status pane — read-only, refreshed every 5s */}
      <StatusCard t={t} status={status} onRefresh={loadStatus} />

      {/* Editable config form */}
      {draft && (
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">{t("configuration")}</h2>
            </div>
            <div className="flex items-center gap-2">
              {saveMsg && (
                <span className={`text-xs ${saveMsg.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                  {saveMsg.text}
                </span>
              )}
              <Button onClick={save} disabled={!dirty || saving}>
                <Save className="me-2 h-4 w-4" />
                {t("saveAndApply")}
              </Button>
            </div>
          </div>

          <div className="space-y-5 p-5">
            <Row
              label={t("enableAgent")}
              hint={t("enableAgentHint")}
              control={
                <Switch
                  checked={draft.enabled}
                  onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
                />
              }
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Row
                label={t("bindHost")}
                control={
                  <Input
                    value={draft.bind_host}
                    onChange={(e) => setDraft({ ...draft, bind_host: e.target.value })}
                    placeholder="0.0.0.0"
                  />
                }
              />
              <Row
                label={t("bindPort")}
                hint={t("bindPortHint")}
                control={
                  <Input
                    type="number"
                    min={1}
                    max={65535}
                    value={draft.bind_port}
                    onChange={(e) => setDraft({ ...draft, bind_port: parseInt(e.target.value, 10) || 8092 })}
                  />
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Row
                label={t("voice")}
                hint={t("voiceHint")}
                control={
                  <Select
                    value={draft.voice}
                    onValueChange={(v) => setDraft({ ...draft, voice: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VOICES.map((v) => (
                        <SelectItem key={v} value={v}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              />
              <Row
                label={t("maxCallDuration")}
                hint={t("maxCallDurationHint")}
                control={
                  <Input
                    type="number"
                    min={0}
                    value={draft.max_call_s}
                    onChange={(e) => setDraft({ ...draft, max_call_s: parseInt(e.target.value, 10) || 0 })}
                  />
                }
              />
            </div>

            <Row
              label={t("greetingLabel")}
              control={
                <Input
                  dir="auto"
                  value={draft.greeting}
                  onChange={(e) => setDraft({ ...draft, greeting: e.target.value })}
                />
              }
            />

            <Row
              label={t("allowInterruption")}
              hint={t("allowInterruptionHint")}
              control={
                <Switch
                  checked={draft.interruption_enabled}
                  onCheckedChange={(v) => setDraft({ ...draft, interruption_enabled: v })}
                />
              }
            />
          </div>
        </div>
      )}

      {/* Escalation triggers — operator-editable keywords + scenarios
       *  the agent's persona reads on every new call to decide when to
       *  call flag_for_supervisor. Self-contained so it doesn't entangle
       *  with the main config's draft/dirty state. */}
      <EscalationConfigCard />
    </div>
  );
}

// ---------- subcomponents -------------------------------------------------

function StatusCard({
  t, status, onRefresh,
}: {
  t: (k: never) => string;
  status: AgentStatus | null;
  onRefresh: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          {status?.running
            ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            : <AlertTriangle className="h-4 w-4 text-amber-600" />
          }
          <h2 className="text-sm font-semibold">{t("agentStatus" as never)}</h2>
        </div>
        <Button size="sm" variant="ghost" onClick={onRefresh} title={t("refreshStatus" as never)}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        <StatusCell
          label={t("agentStatus" as never)}
          value={status?.running ? t("agentRunning" as never) : t("agentStopped" as never)}
          accent={status?.running ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}
        />
        <StatusCell
          label="Host : Port"
          value={status ? `${status.host}:${status.port}` : "—"}
          mono
        />
        <StatusCell
          label={t("agentActiveCalls" as never)}
          value={status ? String(status.active) : "—"}
        />
        <StatusCell
          label={t("agentBoundAt" as never)}
          value={status?.bound_at ? new Date(status.bound_at * 1000).toLocaleTimeString() : "—"}
        />
        <StatusCell
          label={t("personaSize" as never)}
          value={status ? `${status.persona_chars.toLocaleString()} chars` : "—"}
        />
        <StatusCell
          label={t("kbSize" as never)}
          value={status ? `${status.kb_chars.toLocaleString()} chars` : "—"}
        />
        <StatusCell
          label="Gemini API key"
          value={status ? (status.api_key_set ? "OK" : t("apiKeyMissing" as never)) : "—"}
          accent={status && !status.api_key_set ? "text-destructive" : ""}
        />
        <StatusCell
          label="Last error"
          value={status?.last_error || "—"}
          accent={status?.last_error ? "text-destructive" : ""}
        />
      </div>
    </div>
  );
}

function StatusCell({
  label, value, mono, accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: string;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-sm ${mono ? "font-mono" : "font-medium"} ${accent || "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

function Row({
  label, hint, control,
}: { label: string; hint?: string; control: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</Label>
      {control}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ============================================================================
// Escalation triggers — operator-editable keywords + scenarios that the
// Live Agent's persona reads on every new inbound call. Backend stores at
// data/demos/clinic/escalation.json. Saving here takes effect on the NEXT
// call (the service rebuilds the system instruction per call, no restart).
// ============================================================================

type EscalationConfig = {
  keywords_en: string[];
  keywords_ar: string[];
  scenarios:   string[];
  supervisor_extension: string;
  // PBX integration (Asterisk Manager Interface). Used by the future
  // backend-originated auto-dial path. data/demos/clinic/escalation.json
  // is gitignored, so the secret stays on the machine it was entered on.
  ami_host:     string;
  ami_port:     number;
  ami_username: string;
  ami_secret:   string;
  // WhatsApp via WasenderApi. Per-session API key — the WhatsApp number
  // must already be paired on the WasenderApi dashboard.
  wasender_api_key:    string;
  // Required by the inbox view (message-logs API takes a session id in
  // its path). Sending works without it; chats list + history don't.
  wasender_session_id: string;
  auto_keyword_match:   boolean;
  auto_on_tool_errors:  boolean;
  tool_error_threshold: number;
};

const linesToList = (text: string): string[] =>
  text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

const listToLines = (xs: string[] | undefined): string =>
  (xs ?? []).join("\n");

function EscalationConfigCard() {
  const [cfg, setCfg]       = useState<EscalationConfig | null>(null);
  const [draft, setDraft]   = useState<EscalationConfig | null>(null);
  const [loadErr, setErr]   = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/demo/clinic/agent/escalation");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: EscalationConfig = await r.json();
      setCfg(data);
      setDraft(data);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || "Could not load escalation config");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const dirty = !!(cfg && draft && JSON.stringify(cfg) !== JSON.stringify(draft));

  const save = async () => {
    if (!draft) return;
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/demo/clinic/agent/escalation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: EscalationConfig = await r.json();
      setCfg(data); setDraft(data);
      setMsg({ kind: "ok", text: "Saved — takes effect on the next call" });
      setTimeout(() => setMsg(null), 2500);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <h2 className="text-sm font-semibold text-card-foreground">Supervisor escalation triggers</h2>
        </div>
        <div className="flex items-center gap-2">
          {msg && (
            <span className={`flex items-center gap-1 text-xs ${
              msg.kind === "ok" ? "text-emerald-600" : "text-destructive"
            }`}>
              {msg.kind === "ok"
                ? <CheckCircle2 className="h-3.5 w-3.5" />
                : <AlertTriangle className="h-3.5 w-3.5" />}
              {msg.text}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={load} disabled={saving}>
            <RefreshCw className="me-1.5 h-3.5 w-3.5" /> Reload
          </Button>
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            <Save className="me-1.5 h-3.5 w-3.5" /> {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {loadErr && (
        <div className="border-b border-destructive/40 bg-destructive/10 px-5 py-2 text-xs text-destructive">
          {loadErr}
        </div>
      )}

      {draft && (
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Supervisor extension
            </Label>
            <Input
              value={draft.supervisor_extension}
              onChange={(e) => setDraft({ ...draft, supervisor_extension: e.target.value })}
              placeholder="e.g. 1001"
              className="max-w-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              The PBX extension a human supervisor should dial to join a
              flagged call. Surfaced as an "Ext. {draft.supervisor_extension || "…"}"
              copy-button on flagged rows on the Dashboard. Leave empty to
              hide the button.
            </p>
          </div>

          {/* PBX integration (Asterisk Manager Interface) — credentials
           *  used by the backend's future auto-dial path. The secret is
           *  stored in data/demos/clinic/escalation.json (gitignored). */}
          <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/20 p-4 md:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                PBX integration (Asterisk Manager Interface)
              </h3>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                stored locally · gitignored
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              When wired up, the backend uses these to <code className="rounded bg-muted px-1">Originate</code>
              a call from Asterisk to your supervisor extension and bridge
              you into the live call (no copy-paste / softphone tel-handler
              needed). Each machine stores its own values — the secret
              never lands in git.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  AMI host
                </Label>
                <Input
                  value={draft.ami_host}
                  onChange={(e) => setDraft({ ...draft, ami_host: e.target.value })}
                  placeholder="192.168.100.x or freepbx.local"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  AMI port
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={draft.ami_port}
                  onChange={(e) => setDraft({
                    ...draft,
                    ami_port: Math.max(1, Math.min(65535, parseInt(e.target.value || "5038", 10))),
                  })}
                  placeholder="5038"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  AMI username
                </Label>
                <Input
                  value={draft.ami_username}
                  onChange={(e) => setDraft({ ...draft, ami_username: e.target.value })}
                  placeholder="pwdemo-clinic"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  AMI secret
                </Label>
                <Input
                  type="password"
                  value={draft.ami_secret}
                  onChange={(e) => setDraft({ ...draft, ami_secret: e.target.value })}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <p className="text-[10px] text-muted-foreground">
                  Stored at <code className="rounded bg-muted px-1">data/demos/clinic/escalation.json</code> —
                  the value is masked here but sent in clear over the API. Run
                  the SPA over HTTPS in production.
                </p>
              </div>
            </div>
          </div>

          {/* WhatsApp (WasenderApi) — per-session API key used by the
           *  /call-center/whatsapp page to send messages. Stored in the
           *  same gitignored escalation.json file so it never lands in
           *  git. The number must be paired on the WasenderApi dashboard
           *  separately — we only handle the send leg. */}
          <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/20 p-4 md:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                WhatsApp (WasenderApi)
              </h3>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                stored locally · gitignored
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Per-session API key from <a
                className="text-primary underline-offset-4 hover:underline"
                href="https://wasenderapi.com" target="_blank" rel="noreferrer"
              >wasenderapi.com</a>. The WhatsApp number itself must already be
              paired on the WasenderApi dashboard — we only authorise the send
              leg, no QR pairing here yet.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  WhatsApp API key
                </Label>
                <Input
                  type="password"
                  value={draft.wasender_api_key}
                  onChange={(e) => setDraft({ ...draft, wasender_api_key: e.target.value })}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <p className="text-[10px] text-muted-foreground">
                  Required for sending. The WhatsApp page pings <code
                  className="mx-1 rounded bg-muted px-1">/whatsapp/status</code>
                  on mount to confirm it's accepted.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  WhatsApp session ID
                </Label>
                <Input
                  value={draft.wasender_session_id}
                  onChange={(e) => setDraft({ ...draft, wasender_session_id: e.target.value })}
                  placeholder="e.g. 12345 or session-uuid"
                  autoComplete="off"
                />
                <p className="text-[10px] text-muted-foreground">
                  Required for the inbox view (chat list + message history).
                  Find it on the WasenderApi dashboard under your paired
                  WhatsApp number. Sending works without it.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Keyword examples (English) — one per line
            </Label>
            <textarea
              value={listToLines(draft.keywords_en)}
              onChange={(e) => setDraft({ ...draft, keywords_en: linesToList(e.target.value) })}
              rows={6}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
              placeholder={"manager\nsupervisor\nspeak to a human"}
            />
            <p className="text-[11px] text-muted-foreground">
              Illustrative — the persona tells the agent to use JUDGMENT
              (anger, frustration, asking for a human) not exact keyword
              matches. These are hints for what to watch for.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Keyword examples (Arabic) — one per line
            </Label>
            <textarea
              value={listToLines(draft.keywords_ar)}
              onChange={(e) => setDraft({ ...draft, keywords_ar: linesToList(e.target.value) })}
              rows={6}
              dir="rtl"
              className="block w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
              placeholder={"مدير\nمديرة\nاريد بشر"}
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Scenario triggers — one per line, free text
            </Label>
            <textarea
              value={listToLines(draft.scenarios)}
              onChange={(e) => setDraft({ ...draft, scenarios: linesToList(e.target.value) })}
              rows={6}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
              placeholder={"The caller has raised their voice across multiple turns.\nThe caller mentioned a medical emergency you cannot triage."}
            />
            <p className="text-[11px] text-muted-foreground">
              These are read by the agent's persona on every call. Describe
              situations in plain language — the agent decides when each
              applies and calls <code className="mx-1 rounded bg-muted px-1">flag_for_supervisor</code>.
            </p>
          </div>

          <Row
            label="Auto-detect: keyword match in caller speech"
            hint="If on, the backend will also pattern-match the keyword lists against the caller's live transcript and auto-flag, even if the agent fails to call the tool."
            control={
              <Switch
                checked={draft.auto_keyword_match}
                onCheckedChange={(v) => setDraft({ ...draft, auto_keyword_match: v })}
              />
            }
          />
          <Row
            label="Auto-detect: consecutive tool errors"
            hint="Flag automatically after N consecutive failed tool calls on the same call (signals the agent is stuck)."
            control={
              <div className="flex items-center gap-3">
                <Switch
                  checked={draft.auto_on_tool_errors}
                  onCheckedChange={(v) => setDraft({ ...draft, auto_on_tool_errors: v })}
                />
                <Input
                  type="number"
                  min={1}
                  max={10}
                  className="w-20"
                  value={draft.tool_error_threshold}
                  disabled={!draft.auto_on_tool_errors}
                  onChange={(e) => setDraft({
                    ...draft,
                    tool_error_threshold: Math.max(1, Math.min(10, parseInt(e.target.value || "3", 10))),
                  })}
                />
                <span className="text-[11px] text-muted-foreground">errors in a row</span>
              </div>
            }
          />
        </div>
      )}
    </div>
  );
}
