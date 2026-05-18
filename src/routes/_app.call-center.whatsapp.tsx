import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MessageCircle, Send, AlertTriangle, CheckCircle2, RefreshCw,
  Loader2, Settings, Inbox, Users, MessageSquarePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useApp } from "@/lib/i18n";
import {
  SEED_PATIENTS, useDemoCollection,
  type Patient,
} from "@/lib/demoStore";

export const Route = createFileRoute("/_app/call-center/whatsapp")({
  component: WhatsAppPage,
});

// ---------- Types mirroring the backend response shapes -----------------

type StatusState =
  | { kind: "loading" }
  | { kind: "unconfigured" }
  | { kind: "ok"; contactCount?: number | null }
  | { kind: "error"; message: string };

type Chat = {
  jid:           string;
  name:          string;
  last_text:     string;
  last_ts:       number;          // unix seconds
  last_from_me:  boolean;
  msg_count:     number;
  is_group:      boolean;
};

type Message = {
  id:      string | null;
  ts:      number;       // unix seconds
  from_me: boolean;
  text:    string;
  type:    string;
};

type SendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "failed"; error: string };

// Poll intervals — chat list refreshes less often than the open
// conversation. Pure UX guesses; bump up if WasenderApi rate-limits hit.
const CHATS_POLL_MS    = 15_000;
const MESSAGES_POLL_MS = 5_000;

// Strip a phone number / JID down to digits so two different encodings of
// the same number compare equal. "+966 50 123 4567" → "966501234567";
// "9665…@s.whatsapp.net" → "9665…".
function phoneDigits(s: string | null | undefined): string {
  return (s || "").replace(/\D+/g, "");
}

// A Saudi number can be written +966501234567, 966501234567, 0501234567,
// or 501234567. Match on the last 9 digits (the national number) so all
// of those forms collapse to the same key.
function phoneKey(s: string | null | undefined): string {
  const d = phoneDigits(s);
  return d.length >= 9 ? d.slice(-9) : d;
}

function WhatsAppPage() {
  const { t, lang } = useApp();
  const [status, setStatus] = useState<StatusState>({ kind: "loading" });

  // Patients registry — lets us label a chat with the patient's name +
  // file number whenever the chat's phone matches a patient on record.
  // useDemoCollection reads from the same localStorage the Patients
  // page writes, so adding a patient there is reflected here on the
  // next React tick (the window event fires synchronously).
  const { items: patients } = useDemoCollection<Patient>("patients", SEED_PATIENTS);
  const patientByPhone = useMemo(() => {
    const map = new Map<string, Patient>();
    for (const p of patients) {
      const key = phoneKey(p.phone);
      if (key) map.set(key, p);
    }
    return map;
  }, [patients]);
  const lookupPatient = (jid: string): Patient | null =>
    patientByPhone.get(phoneKey(jid)) ?? null;

  // Chat list (left pane)
  const [chats, setChats]               = useState<Chat[]>([]);
  const [chatsErr, setChatsErr]         = useState<string | null>(null);
  const [chatsLoading, setChatsLoading] = useState(false);

  // Selected conversation (right pane)
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const [messages, setMessages]       = useState<Message[]>([]);
  const [msgsErr, setMsgsErr]         = useState<string | null>(null);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Send form (right pane footer)
  const [draft, setDraft]   = useState("");
  const [send, setSend]     = useState<SendState>({ kind: "idle" });

  // Compose dialog — send a new message to an arbitrary phone number
  // (someone the operator has never chatted with on this number).
  const [composeOpen,  setComposeOpen]  = useState(false);
  const [composePhone, setComposePhone] = useState("");
  const [composeText,  setComposeText]  = useState("");
  const [composeState, setComposeState] = useState<SendState>({ kind: "idle" });

  // ---------- API calls ------------------------------------------------

  const loadStatus = useCallback(async () => {
    setStatus({ kind: "loading" });
    try {
      const r = await fetch("/api/demo/clinic/whatsapp/status");
      const data = await r.json();
      if (!data.configured) { setStatus({ kind: "unconfigured" }); return; }
      if (data.ok)          { setStatus({ kind: "ok", contactCount: data.contact_count ?? null }); return; }
      setStatus({ kind: "error", message: data.error || `HTTP ${data.status}` });
    } catch (e: any) {
      setStatus({ kind: "error", message: e?.message || "network error" });
    }
  }, []);

  const loadChats = useCallback(async () => {
    setChatsLoading(true);
    try {
      const r = await fetch("/api/demo/clinic/whatsapp/chats?limit=300");
      const data = await r.json();
      if (r.ok && data?.ok) {
        setChats(data.chats || []);
        setChatsErr(null);
      } else {
        setChatsErr(data?.error || `HTTP ${r.status}`);
      }
    } catch (e: any) {
      setChatsErr(e?.message || "network error");
    } finally {
      setChatsLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (jid: string) => {
    setMsgsLoading(true);
    try {
      const r = await fetch(
        `/api/demo/clinic/whatsapp/messages?jid=${encodeURIComponent(jid)}&limit=300`,
      );
      const data = await r.json();
      if (r.ok && data?.ok) {
        setMessages(data.messages || []);
        setMsgsErr(null);
      } else {
        setMsgsErr(data?.error || `HTTP ${r.status}`);
      }
    } catch (e: any) {
      setMsgsErr(e?.message || "network error");
    } finally {
      setMsgsLoading(false);
    }
  }, []);

  // ---------- Boot + polling ------------------------------------------

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // Chats: load on mount once status is OK, then poll. We skip polling
  // when the page is hidden so the demo doesn't burn WasenderApi quota
  // when nobody's looking.
  useEffect(() => {
    if (status.kind !== "ok") return;
    loadChats();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") loadChats();
    }, CHATS_POLL_MS);
    return () => window.clearInterval(id);
  }, [status.kind, loadChats]);

  // Messages: re-fetch when the selected chat changes + on a tighter
  // poll than chats so the open conversation feels live.
  useEffect(() => {
    if (!selectedJid || status.kind !== "ok") return;
    loadMessages(selectedJid);
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") loadMessages(selectedJid);
    }, MESSAGES_POLL_MS);
    return () => window.clearInterval(id);
  }, [selectedJid, status.kind, loadMessages]);

  // Auto-scroll to the newest message whenever the list grows.
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // ---------- Send -----------------------------------------------------

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (send.kind === "sending") return;
    if (!selectedJid || !draft.trim()) return;
    // Convert JID → phone-number-or-group-id for /send. Individuals
    // are "<digits>@s.whatsapp.net"; groups are "<id>@g.us" and need
    // to be sent as-is.
    const to = selectedJid.endsWith("@g.us")
      ? selectedJid
      : selectedJid.split("@")[0];
    setSend({ kind: "sending" });
    try {
      const r = await fetch("/api/demo/clinic/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, text: draft }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data?.ok) {
        setDraft("");
        setSend({ kind: "idle" });
        // Optimistically refresh the open conversation so the new
        // message lands without waiting for the poll tick.
        loadMessages(selectedJid);
        loadChats();
      } else {
        setSend({ kind: "failed", error: data?.error || data?.detail || `HTTP ${r.status}` });
      }
    } catch (e: any) {
      setSend({ kind: "failed", error: e?.message || "network error" });
    }
  };

  // Compose-new-message submit: same backend endpoint as the inline
  // send form (POST /whatsapp/send), just with an arbitrary phone
  // number instead of a JID. The backend's normalize_phone handles
  // "+9665…" / "9665…" / "05…" — we don't need to do any client-side
  // formatting here.
  const onComposeSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (composeState.kind === "sending") return;
    if (!composePhone.trim() || !composeText.trim()) return;
    setComposeState({ kind: "sending" });
    try {
      const r = await fetch("/api/demo/clinic/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: composePhone.trim(), text: composeText }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data?.ok) {
        setComposeState({ kind: "idle" });
        setComposeOpen(false);
        setComposePhone("");
        setComposeText("");
        // Refresh chats so the new conversation appears in the left
        // pane on the next tick (WasenderApi indexes the message-log
        // first, then it shows up in our grouped view).
        setTimeout(() => { loadChats(); }, 1500);
      } else {
        setComposeState({
          kind: "failed",
          error: data?.error || data?.detail || `HTTP ${r.status}`,
        });
      }
    } catch (e: any) {
      setComposeState({ kind: "failed", error: e?.message || "network error" });
    }
  };

  // Derived: the currently selected chat object, for the header.
  const selectedChat = useMemo(
    () => chats.find((c) => c.jid === selectedJid) ?? null,
    [chats, selectedJid],
  );

  // ---------- Render ---------------------------------------------------

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("callCenter")} · {t("whatsapp")}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Inbox view of your paired WhatsApp number. The chat list refreshes
            every {CHATS_POLL_MS / 1000}s, the open conversation every
            {" "}{MESSAGES_POLL_MS / 1000}s. Sent messages appear after the
            next refresh tick.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={status} />
          <Button
            variant="default"
            size="sm"
            onClick={() => { setComposeState({ kind: "idle" }); setComposeOpen(true); }}
            disabled={status.kind !== "ok"}
          >
            <MessageSquarePlus className="me-1.5 h-3.5 w-3.5" />
            New message
          </Button>
          <Button variant="outline" size="sm" onClick={() => { loadStatus(); loadChats(); if (selectedJid) loadMessages(selectedJid); }}>
            <RefreshCw className={`me-1.5 h-3.5 w-3.5 ${status.kind === "loading" || chatsLoading || msgsLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {status.kind === "unconfigured" && <UnconfiguredHint />}
      {status.kind === "error" && <ErrorHint message={status.message} />}

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* Chat list */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-card-foreground">Chats</h2>
              <span className="text-[11px] text-muted-foreground">{chats.length}</span>
            </div>
            {chatsLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          {chatsErr ? (
            <InlineError message={chatsErr} />
          ) : chats.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {status.kind === "ok"
                ? "No conversations yet — once messages flow on this number they'll appear here."
                : "Waiting for connection…"}
            </div>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
              {chats.map((c) => {
                const linked = lookupPatient(c.jid);
                const displayName = linked
                  ? (lang === "ar" ? (linked.name_ar || linked.name) : linked.name)
                  : c.name;
                return (
                  <li key={c.jid}>
                    <button
                      type="button"
                      onClick={() => setSelectedJid(c.jid)}
                      className={`flex w-full flex-col gap-1 px-4 py-3 text-start text-sm transition-colors ${
                        selectedJid === c.jid
                          ? "bg-primary/10"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 truncate font-medium text-foreground" dir="auto">
                          {c.is_group && <Users className="h-3 w-3 shrink-0 text-muted-foreground" />}
                          <span className="truncate">{displayName}</span>
                          {linked && (
                            <span className="ms-1 shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-emerald-700 dark:text-emerald-400">
                              {linked.file_number}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-[10px] font-mono text-muted-foreground">
                          {c.last_ts ? fmtShortTime(c.last_ts * 1000, lang) : "—"}
                        </span>
                      </div>
                      <div className="line-clamp-1 text-xs text-muted-foreground" dir="auto">
                        {c.last_from_me && (
                          <span className="text-emerald-600 dark:text-emerald-400">You: </span>
                        )}
                        {c.last_text || "(empty)"}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Conversation */}
        <div className="flex flex-col rounded-xl border border-border bg-card overflow-hidden">
          {!selectedJid ? (
            <div className="flex flex-1 items-center justify-center px-6 py-20 text-center text-sm text-muted-foreground">
              <div>
                <MessageCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
                Select a chat on the left to view its messages, or
                {" "}<Link to="/call-center/configuration" className="text-primary hover:underline">configure</Link>
                {" "}your API key + session ID first if the list is empty.
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  {(() => {
                    const linkedHeader = lookupPatient(selectedJid);
                    const displayName = linkedHeader
                      ? (lang === "ar" ? (linkedHeader.name_ar || linkedHeader.name) : linkedHeader.name)
                      : (selectedChat?.name ?? selectedJid.split("@")[0]);
                    return (
                      <>
                        <div className="flex items-center gap-1.5 truncate text-sm font-semibold text-card-foreground" dir="auto">
                          {selectedChat?.is_group && <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                          <span className="truncate">{displayName}</span>
                          {linkedHeader && (
                            <Link
                              to="/patients"
                              className="ms-1 shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                              title="Open in Patients"
                            >
                              {linkedHeader.file_number}
                            </Link>
                          )}
                        </div>
                        <div className="truncate font-mono text-[10px] text-muted-foreground" dir="ltr">
                          {selectedJid}
                          {linkedHeader && linkedHeader.id_number && (
                            <span className="ms-2 text-muted-foreground/70">
                              · ID {linkedHeader.id_number}
                            </span>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
                {msgsLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto bg-muted/20 p-4" style={{ maxHeight: "60vh" }}>
                {msgsErr ? (
                  <InlineError message={msgsErr} />
                ) : messages.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    {msgsLoading ? "Loading…" : "No messages in this thread yet."}
                  </div>
                ) : (
                  messages.map((m, i) => (
                    <div
                      key={m.id ?? `${m.ts}-${i}`}
                      className={`flex ${m.from_me ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                          m.from_me
                            ? "bg-emerald-500/15 text-foreground"
                            : "bg-card text-foreground border border-border"
                        }`}
                        dir="auto"
                      >
                        <div className="whitespace-pre-wrap break-words">
                          {m.text || <span className="italic text-muted-foreground">[{m.type}]</span>}
                        </div>
                        <div className="mt-1 text-end font-mono text-[10px] text-muted-foreground/80">
                          {m.ts ? fmtShortTime(m.ts * 1000, lang) : ""}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={onSend} className="border-t border-border bg-card p-3">
                <div className="flex items-end gap-2">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter sends; Shift+Enter inserts a newline.
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        onSend(e as any);
                      }
                    }}
                    rows={2}
                    placeholder={selectedChat?.is_group ? "Send to group…" : "Type a message…"}
                    className="min-h-[56px] resize-y"
                    dir="auto"
                  />
                  <Button
                    type="submit"
                    disabled={send.kind === "sending" || !draft.trim()}
                    className="self-stretch"
                  >
                    {send.kind === "sending"
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Send className="h-4 w-4" />}
                  </Button>
                </div>
                {send.kind === "failed" && (
                  <p className="mt-2 break-all text-xs text-destructive">
                    <AlertTriangle className="me-1 inline h-3 w-3" />
                    {send.error}
                  </p>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Enter to send · Shift+Enter for newline
                </p>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Compose-new-message dialog. Sends to an arbitrary phone the
       *  operator has never chatted with on this WhatsApp number —
       *  the inline send form below an open chat only handles replies. */}
      <Dialog open={composeOpen} onOpenChange={(o) => { if (!o) setComposeOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New WhatsApp message</DialogTitle>
            <DialogDescription>
              Send a text to any phone number. The number must already have
              WhatsApp; we don't pre-validate.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onComposeSend} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recipient phone
              </label>
              <Input
                value={composePhone}
                onChange={(e) => setComposePhone(e.target.value)}
                placeholder="+966 50 123 4567"
                inputMode="tel"
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground">
                Saudi formats accepted: <code className="rounded bg-muted px-1">+9665…</code>,
                <code className="mx-1 rounded bg-muted px-1">9665…</code>,
                <code className="rounded bg-muted px-1">05…</code>.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Message
              </label>
              <Textarea
                value={composeText}
                onChange={(e) => setComposeText(e.target.value)}
                rows={4}
                placeholder="Type your message…"
                dir="auto"
              />
            </div>
            {composeState.kind === "failed" && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="me-1 inline h-3 w-3" />
                {composeState.error}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setComposeOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  composeState.kind === "sending"
                  || !composePhone.trim()
                  || !composeText.trim()
                }
              >
                {composeState.kind === "sending"
                  ? <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />
                  : <Send className="me-1.5 h-3.5 w-3.5" />
                }
                Send
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Helpers + small subcomponents ------------------------------

function fmtShortTime(ms: number, lang: "en" | "ar"): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString(lang === "ar" ? "ar-EG" : undefined, {
      hour: "2-digit", minute: "2-digit",
    });
  }
  return d.toLocaleDateString(lang === "ar" ? "ar-EG" : undefined, {
    month: "short", day: "numeric",
  });
}

function StatusPill({ status }: { status: StatusState }) {
  if (status.kind === "loading") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking…
      </span>
    );
  }
  if (status.kind === "ok") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
        title={status.contactCount != null ? `${status.contactCount} contacts synced` : "API key accepted"}
      >
        <CheckCircle2 className="h-3 w-3" />
        Connected
        {status.contactCount != null && (
          <span className="text-emerald-700/70 dark:text-emerald-400/70">· {status.contactCount} contacts</span>
        )}
      </span>
    );
  }
  if (status.kind === "unconfigured") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-3 w-3" />
        Not configured
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-medium text-destructive"
      title={status.message}
    >
      <AlertTriangle className="h-3 w-3" />
      Error
    </span>
  );
}

function UnconfiguredHint() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="flex-1">
        <p className="font-medium text-foreground">No WhatsApp API key configured</p>
        <p className="mt-1 text-muted-foreground">
          Paste your WasenderApi API key + session ID into the configuration
          page. The number must already be paired with WhatsApp on the
          WasenderApi dashboard.
        </p>
        <Link
          to="/call-center/configuration"
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <Settings className="h-3.5 w-3.5" />
          Open Configuration → WhatsApp
        </Link>
      </div>
    </div>
  );
}

function ErrorHint({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div className="flex-1">
        <p className="font-medium text-foreground">WasenderApi rejected the key</p>
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{message}</p>
        <p className="mt-2 text-muted-foreground">
          Common causes: key expired, wrong key copied, or the paired WhatsApp
          session is offline (re-scan on the dashboard).
        </p>
      </div>
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  // The "personal access token" failure is the most common WasenderApi
  // gotcha — the per-session API key authorises send-message but not
  // /whatsapp-sessions/{id}/message-logs. Surface a friendlier hint
  // with a one-click jump to Configuration instead of just dumping the
  // raw error.
  const needsPat = /personal access token/i.test(message);
  if (needsPat) {
    return (
      <div className="space-y-1.5 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
        <div className="flex items-start gap-2 font-medium">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Inbox needs a Personal Access Token</span>
        </div>
        <p className="ms-5 text-muted-foreground">
          WasenderApi's <code className="mx-0.5 rounded bg-muted px-1">/whatsapp-sessions/&#123;id&#125;/message-logs</code>
          endpoint won't accept the per-session API key. Open{" "}
          <Link to="/call-center/configuration" className="text-primary underline-offset-4 hover:underline">
            Configuration
          </Link>{" "}
          and paste your Personal Access Token (Settings → Personal Access
          Tokens on the WasenderApi dashboard).
        </p>
        <p className="ms-5 break-all font-mono text-[10px] text-muted-foreground">
          Raw: {message}
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 px-4 py-3 text-xs text-destructive">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="break-all">{message}</span>
    </div>
  );
}
