import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bug, Trash2, Pause, Play, CircleDot,
  ChevronRight, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/lib/i18n";
import {
  useLiveAgentStore, clearDebugEvents,
  type DebugEvent,
} from "@/lib/liveAgentStore";

export const Route = createFileRoute("/_app/call-center/debug")({
  component: DebugPage,
});

// What levels show. Order matters — used in the toolbar buttons.
const LEVELS = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] as const;
type Level = (typeof LEVELS)[number];

// Colour per level for the row's level chip.
const LEVEL_STYLE: Record<string, string> = {
  DEBUG:    "bg-muted text-muted-foreground",
  INFO:     "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  WARNING:  "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  ERROR:    "bg-destructive/15 text-destructive",
  CRITICAL: "bg-destructive text-destructive-foreground",
};

function DebugPage() {
  const { t } = useApp();
  const live = useLiveAgentStore();
  const [paused, setPaused]               = useState(false);
  const [levelFilter, setLevelFilter]     = useState<Set<Level>>(
    new Set(["INFO", "WARNING", "ERROR", "CRITICAL"]),
  );
  const [loggerFilter, setLoggerFilter]   = useState("");
  const [textFilter, setTextFilter]       = useState("");
  const [expanded, setExpanded]           = useState<Set<number>>(new Set());
  const [autoScroll, setAutoScroll]       = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Snapshot of debugEvents at the moment Pause was clicked. When
  // paused, we render this fixed copy so the screen stops moving. When
  // resumed, we drop back to the live array.
  const [frozen, setFrozen] = useState<DebugEvent[] | null>(null);
  useEffect(() => {
    if (paused && frozen === null) setFrozen([...live.debugEvents]);
    if (!paused && frozen !== null) setFrozen(null);
  }, [paused, live.debugEvents, frozen]);

  const sourceEvents = frozen ?? live.debugEvents;

  const visible = useMemo(() => {
    const lf = loggerFilter.trim().toLowerCase();
    const tf = textFilter.trim().toLowerCase();
    return sourceEvents.filter((e) => {
      if (!levelFilter.has(e.level as Level)) return false;
      if (lf && !e.logger.toLowerCase().includes(lf)) return false;
      if (tf && !(e.message.toLowerCase().includes(tf)
                  || (e.exc || "").toLowerCase().includes(tf))) return false;
      return true;
    });
  }, [sourceEvents, levelFilter, loggerFilter, textFilter]);

  // Auto-scroll to bottom when new events arrive — unless the user
  // scrolled up (we detect that and let them stay where they are).
  useEffect(() => {
    if (!autoScroll || paused) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [visible.length, autoScroll, paused]);

  // If the user manually scrolls up, disable auto-scroll. If they
  // scroll back to the bottom, re-enable.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAutoScroll(distanceFromBottom < 40);
  };

  const toggleLevel = (l: Level) => {
    setLevelFilter((prev) => {
      const next = new Set(prev);
      if (next.has(l)) next.delete(l);
      else next.add(l);
      return next;
    });
  };

  const toggleExpanded = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const renderedCount = visible.length;
  const totalCount = sourceEvents.length;
  const wsConnected = live.wsConnected;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("callCenter")} · {t("debug" as never)}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Live tail of the clinic backend's loggers. Streams everything
            the agent dispatcher, function tools, WhatsApp sender, and
            inbox handler emit via{" "}
            <code className="rounded bg-muted px-1 font-mono text-xs">
              logger.info / .warning / .exception
            </code>
            . Capped at the last 1000 events; pausing freezes the view
            without dropping anything (resume to catch up).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs ${
            wsConnected
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
          }`}>
            <CircleDot className="h-3 w-3" />
            {wsConnected ? "WS live" : "WS offline"}
          </span>
          <Button
            size="sm" variant="outline"
            onClick={() => setPaused((p) => !p)}
          >
            {paused
              ? <><Play className="me-1.5 h-3.5 w-3.5" />Resume</>
              : <><Pause className="me-1.5 h-3.5 w-3.5" />Pause</>}
          </Button>
          <Button
            size="sm" variant="outline"
            onClick={clearDebugEvents}
            disabled={totalCount === 0}
          >
            <Trash2 className="me-1.5 h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Levels:
          </span>
          {LEVELS.map((l) => {
            const active = levelFilter.has(l);
            return (
              <button
                key={l}
                type="button"
                onClick={() => toggleLevel(l)}
                className={`rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide transition-colors ${
                  active
                    ? `${LEVEL_STYLE[l]} border-transparent`
                    : "border-border text-muted-foreground/60 hover:text-foreground"
                }`}
              >
                {l}
              </button>
            );
          })}
          <span className="mx-2 h-4 w-px bg-border" />
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Input
              value={loggerFilter}
              onChange={(e) => setLoggerFilter(e.target.value)}
              placeholder="filter by logger (e.g. wasender)"
              className="h-7 max-w-[260px] font-mono text-xs"
            />
            <Input
              value={textFilter}
              onChange={(e) => setTextFilter(e.target.value)}
              placeholder="filter by message text"
              className="h-7 flex-1 min-w-[180px] font-mono text-xs"
            />
            <span className="text-[10px] text-muted-foreground">
              {renderedCount} / {totalCount} events
            </span>
          </div>
        </div>
      </div>

      {/* Log view */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-[60vh] overflow-y-auto font-mono text-xs"
        >
          {visible.length === 0 ? (
            <div className="px-4 py-12 text-center text-muted-foreground">
              <Bug className="mx-auto mb-2 h-5 w-5" />
              {totalCount === 0
                ? "No events yet. The page is connected to the live agent — make a call and events will stream in."
                : "No events match the current filter."}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((ev, i) => {
                const isExpanded = expanded.has(i);
                const hasExc = !!ev.exc;
                return (
                  <li
                    key={`${ev.ts}-${i}`}
                    className="px-3 py-1.5 hover:bg-muted/30"
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => hasExc && toggleExpanded(i)}
                        className={`mt-0.5 shrink-0 ${hasExc ? "cursor-pointer" : "cursor-default invisible"}`}
                        aria-label={isExpanded ? "Collapse" : "Expand traceback"}
                      >
                        {isExpanded
                          ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                          : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                      </button>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {fmtTs(ev.ts)}
                      </span>
                      <span className={`shrink-0 rounded px-1 text-[9px] font-bold uppercase ${LEVEL_STYLE[ev.level] ?? "bg-muted"}`}>
                        {ev.level}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground/80">
                        {ev.logger}
                      </span>
                      <span className="min-w-0 flex-1 break-words text-foreground" dir="auto">
                        {ev.message}
                      </span>
                    </div>
                    {hasExc && isExpanded && (
                      <pre className="ms-7 mt-1 max-w-full overflow-x-auto whitespace-pre rounded bg-muted/40 p-2 text-[10px] text-foreground">
                        {ev.exc}
                      </pre>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {!autoScroll && !paused && (
          <div className="border-t border-border bg-amber-500/10 px-4 py-1 text-[10px] text-amber-700 dark:text-amber-300">
            Auto-scroll paused (you scrolled up). Scroll to the bottom to resume.
          </div>
        )}
      </div>
    </div>
  );
}


function fmtTs(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}
