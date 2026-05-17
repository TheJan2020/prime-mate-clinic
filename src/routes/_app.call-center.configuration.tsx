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
