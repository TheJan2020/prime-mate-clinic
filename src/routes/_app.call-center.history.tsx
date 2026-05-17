import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  History as HistoryIcon, PhoneIncoming, Trash2, RefreshCw,
  ChevronDown, MessageCircle, Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useApp } from "@/lib/i18n";

export const Route = createFileRoute("/_app/call-center/history")({
  component: HistoryPage,
});

type CallSummary = {
  id: string;
  call_id: string | null;
  started_at: number;
  ended_at: number;
  duration_s: number;
  peer: string | null;
  caller_phone: string | null;
  turn_count: number;
  has_caller_wav: boolean;
  has_agent_wav: boolean;
};

type Turn = { role: "caller" | "agent"; text: string; ts: number };

type CallDetail = {
  id: string;
  call_id: string | null;
  started_at: number;
  ended_at: number;
  duration_s: number;
  peer: string | null;
  caller_phone: string | null;
  voice: string;
  turns: Turn[];
};

function HistoryPage() {
  const { t, lang } = useApp();
  const [calls, setCalls] = useState<CallSummary[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, CallDetail>>({});
  const [deleting, setDeleting] = useState<CallSummary | null>(null);

  const loadList = useCallback(async () => {
    try {
      const r = await fetch("/api/demo/clinic/agent/calls");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setCalls(data.items || []);
      setLoadErr(null);
    } catch (e: any) {
      setCalls([]);
      setLoadErr(e?.message || t("backendUnreachable"));
    }
  }, [t]);

  useEffect(() => { loadList(); }, [loadList]);

  const toggleExpand = async (c: CallSummary) => {
    if (expanded === c.id) {
      setExpanded(null);
      return;
    }
    setExpanded(c.id);
    if (!detail[c.id]) {
      try {
        const r = await fetch(`/api/demo/clinic/agent/calls/${encodeURIComponent(c.id)}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data: CallDetail = await r.json();
        setDetail((prev) => ({ ...prev, [c.id]: data }));
      } catch {
        /* swallow — the row just stays minimal */
      }
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    try {
      const r = await fetch(`/api/demo/clinic/agent/calls/${encodeURIComponent(target.id)}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setCalls((prev) => (prev || []).filter((x) => x.id !== target.id));
      setDetail((prev) => {
        const { [target.id]: _drop, ...rest } = prev;
        return rest;
      });
      if (expanded === target.id) setExpanded(null);
    } catch (e) {
      console.error("delete failed", e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("callCenter")} · {t("history")}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("historyDesc")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadList}>
            <RefreshCw className="me-2 h-4 w-4" />
            {t("refresh")}
          </Button>
        </div>
      </div>

      {loadErr && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <strong>{t("backendUnreachable")}:</strong> {loadErr}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <HistoryIcon className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">{t("history")}</h2>
            <span className="ms-2 text-xs text-muted-foreground">
              {calls === null ? "…" : `${calls.length} ${t("callerLabel").toLowerCase()}s`}
            </span>
          </div>
        </div>

        {calls && calls.length === 0 && (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">{t("noSavedCalls")}</p>
        )}

        <ul className="divide-y divide-border">
          {(calls || []).map((c) => (
            <li key={c.id} className="px-5 py-3">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-start"
                onClick={() => toggleExpand(c)}
              >
                <div className="flex items-center gap-3">
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded === c.id ? "rotate-0" : "-rotate-90"}`} />
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    <PhoneIncoming className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">
                      {c.caller_phone ?? c.peer ?? t("unknownCaller")}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {c.id} · {c.turn_count} turn{c.turn_count === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                  <span>{durationLabel(c.duration_s)}</span>
                  <span>{new Date(c.started_at * 1000).toLocaleString(lang === "ar" ? "ar-EG" : undefined)}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); setDeleting(c); }}
                    aria-label={t("deleteEntry")}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </button>

              {expanded === c.id && (
                <div className="mt-3 space-y-3 rounded-md border border-border bg-muted/20 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {c.has_caller_wav && (
                      <AudioBlock
                        label={t("callerAudio")}
                        url={`/api/demo/clinic/agent/calls/${encodeURIComponent(c.id)}/audio/caller`}
                      />
                    )}
                    {c.has_agent_wav && (
                      <AudioBlock
                        label={t("agentAudio")}
                        url={`/api/demo/clinic/agent/calls/${encodeURIComponent(c.id)}/audio/agent`}
                      />
                    )}
                  </div>
                  <TranscriptBlock t={t} turns={detail[c.id]?.turns} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <AlertDialog open={deleting !== null} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteSavedCall")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteSavedCallDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("deleteEntry")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AudioBlock({ label, url }: { label: string; url: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Volume2 className="h-3.5 w-3.5" />
        {label}
      </div>
      <audio controls preload="none" src={url} className="w-full" />
    </div>
  );
}

function TranscriptBlock({
  t, turns,
}: {
  t: (k: never) => string;
  turns?: Turn[];
}) {
  if (!turns) {
    return <div className="text-xs text-muted-foreground">…</div>;
  }
  if (turns.length === 0) {
    return <div className="text-xs text-muted-foreground">{t("noTranscript" as never)}</div>;
  }
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <MessageCircle className="h-3.5 w-3.5" />
        {t("transcript" as never)}
      </div>
      <div className="space-y-2">
        {turns.map((turn, i) => (
          <div
            key={i}
            className={`rounded-md p-2 text-sm ${
              turn.role === "agent"
                ? "bg-primary/10 text-foreground"
                : "bg-muted/50 text-foreground"
            }`}
            dir="auto"
          >
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {turn.role === "agent" ? t("agentLabel" as never) : t("callerLabel" as never)}
            </div>
            <div>{turn.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function durationLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
