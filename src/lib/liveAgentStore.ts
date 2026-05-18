/**
 * Module-level singleton for the Live Agent WebSocket feed.
 *
 * Lives outside React's component tree so navigating away from the
 * Dashboard (e.g. opening Patients or Configuration) does NOT tear
 * down the connection or wipe the in-flight transcript. The store
 * survives all in-SPA navigation; it resets only on a full page
 * reload (browser refresh), which is the right semantic — a refresh
 * "starts a new session" but in-app navigation does not.
 *
 * Components subscribe via the useLiveAgentStore() hook and re-render
 * on any state change.
 */
import { useEffect, useState } from "react";

export type LiveCall = {
  call_id: string;
  peer: string;
  started_at: number;          // unix seconds
  caller_name: string;         // defaults to "New patient" until a tool resolves it
  caller_phone: string | null;
  turns: Array<{ who: "caller" | "agent"; text: string }>;
};

export type ToolMutationEvent = {
  /** What changed — drives the SPA-side localStorage sync. */
  kind:
    | "patient_created"
    | "appointment_created"
    | "appointment_cancelled"
    | "appointment_rescheduled";
  call_id: string;
  patient?: any;        // shape mirrors clinic SPA Patient
  appointment?: any;    // shape mirrors clinic SPA Appointment
  /** Reschedule events also carry the prior scheduled_at string so the
   *  activity feed can show the before/after time. */
  previous_scheduled_at?: string;
};

export type ToolResultEvent = {
  call_id: string;
  name: string;
  ok: boolean;
  args: Record<string, any>;
  error: string | null;
  ts: number;          // unix seconds, client-stamped
};

export type FabricationEvent = {
  call_id: string;
  kind: "file_number" | "appointment_id";
  value: string;
  ts: number;          // unix seconds, client-stamped
};

/** Real-time log line from any clinic backend module. Streamed by the
 * Python `_DebugBroadcastHandler` (see live_agent.py) and consumed by
 * the Call Center → Debug page. */
export type DebugEvent = {
  ts:      number;     // unix seconds, server-stamped (record.created)
  level:   string;     // "INFO" / "WARNING" / "ERROR" / "DEBUG"
  logger:  string;     // e.g. "clinic_live_agent"
  message: string;
  exc:     string | null;
};

/** Supervisor flag — set by the backend's `flag_for_supervisor` tool call
 *  or by an auto-detect pass. Stored per call_id; cleared by the operator
 *  via POST /agent/calls/{id}/acknowledge_flag. */
export type SupervisorFlag = {
  reason: string;
  /** 'high' = drop everything; 'normal' = check when free. */
  severity: "low" | "normal" | "high";
  source: string;       // 'agent' | 'auto_keyword' | 'auto_tool_errors' …
  ts: number;           // unix seconds (server-stamped)
};

type State = {
  wsConnected: boolean;
  liveCalls: Record<string, LiveCall>;
  /** Append-only log of recent mutations the agent emitted. The Dashboard
   * applies these to the SPA's localStorage so the Patients / Appointments
   * pages catch up to what the agent did on a call. */
  recentMutations: ToolMutationEvent[];
  /** Last 20 tool results — surfaced on the Dashboard so a silent
   * "the agent said it booked but the tool returned an error" failure
   * is visible while the call is still live. */
  recentToolResults: ToolResultEvent[];
  /** Fabrication warnings — emitted by the backend when the agent
   * SPEAKS a file_number / appointment_id that wasn't actually
   * returned by any tool on this call. Kept across calls until the
   * page is refreshed so the user can spot the pattern. */
  recentFabrications: FabricationEvent[];
  /** Real-time debug log from the clinic backend. Capped at
   * DEBUG_BUFFER_MAX so a long-running session doesn't bloat memory.
   * The Call Center → Debug page renders this directly. */
  debugEvents: DebugEvent[];
  /** Active supervisor flags keyed by call_id. A flagged call paints
   * red on the Dashboard with the reason; the operator clicks
   * Acknowledge to clear which calls POST … /acknowledge_flag and
   * deletes the entry locally (the backend also broadcasts
   * supervisor_flag_ack so peer dashboards drop the red tint in sync). */
  supervisorFlags: Record<string, SupervisorFlag>;
};

type Listener = () => void;

const DEBUG_BUFFER_MAX = 1000;

let state: State = {
  wsConnected: false,
  liveCalls: {},
  recentMutations: [],
  recentToolResults: [],
  recentFabrications: [],
  supervisorFlags: {},
  debugEvents: [],
};
const listeners = new Set<Listener>();
let ws: WebSocket | null = null;
let reconnectTimer: number | null = null;
let starting = false;

function setState(patch: Partial<State> | ((s: State) => State)) {
  state = typeof patch === "function" ? patch(state) : { ...state, ...patch };
  for (const l of listeners) l();
}

function applyEvent(raw: unknown) {
  let m: any;
  try { m = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return; }
  if (!m || typeof m !== "object") return;

  switch (m.type) {
    case "snapshot": {
      // The backend re-sends snapshot every time a client (re)connects
      // the WS. If we let it REPLACE liveCalls, we wipe the in-flight
      // transcript whenever the WS drops + reopens — exact bug we hit
      // when the user navigated away from the Dashboard and came back
      // to a blank transcript. Merge instead: preserve our state for
      // any call_id we already know about, and only seed brand-new ones.
      setState((s) => {
        const merged: Record<string, LiveCall> = { ...s.liveCalls };
        const mergedFlags: Record<string, SupervisorFlag> = { ...s.supervisorFlags };
        for (const c of (m.calls || [])) {
          const existing = merged[c.call_id];
          if (existing) {
            // Refresh metadata in case the backend learned more (peer,
            // started_at) but DO NOT touch turns / caller_name / caller_phone.
            merged[c.call_id] = {
              ...existing,
              peer:       c.peer ?? existing.peer,
              started_at: c.started_at ?? existing.started_at,
            };
          } else {
            merged[c.call_id] = {
              call_id:      c.call_id,
              peer:         c.peer,
              started_at:   c.started_at,
              caller_name:  "New patient",
              caller_phone: null,
              turns:        [],
            };
          }
          // Snapshot may carry a live supervisor flag — replay it so
          // dashboards that connect AFTER the flag was raised still see
          // the red row. Missing/null `flag` means no active flag.
          if (c.flag && typeof c.flag === "object") {
            mergedFlags[c.call_id] = {
              reason:   String(c.flag.reason ?? ""),
              severity: (c.flag.severity ?? "normal") as SupervisorFlag["severity"],
              source:   String(c.flag.source ?? "agent"),
              ts:       Number(c.flag.ts ?? Date.now() / 1000),
            };
          }
        }
        // Note: we deliberately do NOT prune calls that aren't in the
        // snapshot. If a call_ended happened while we were disconnected,
        // we'd rather show a slightly-stale "active" panel than wipe
        // the user's transcript silently. The real call_ended event
        // will clean up if it ever arrives; otherwise a page refresh
        // resets the singleton.
        return { ...s, liveCalls: merged, supervisorFlags: mergedFlags };
      });
      return;
    }
    case "call_started": {
      setState((s) => ({
        ...s,
        liveCalls: {
          ...s.liveCalls,
          [m.call_id]: {
            call_id:      m.call_id,
            peer:         m.peer,
            started_at:   m.started_at,
            caller_name:  "New patient",
            caller_phone: null,
            turns:        [],
          },
        },
      }));
      return;
    }
    case "call_ended": {
      setState((s) => {
        const { [m.call_id]: _drop, ...rest } = s.liveCalls;
        // When the call ends, any pending supervisor flag is moot —
        // the operator has nothing left to take over.
        const { [m.call_id]: _flagDrop, ...remainingFlags } = s.supervisorFlags;
        return { ...s, liveCalls: rest, supervisorFlags: remainingFlags };
      });
      return;
    }
    case "supervisor_flag": {
      if (!m.call_id || !m.flag || typeof m.flag !== "object") return;
      setState((s) => ({
        ...s,
        supervisorFlags: {
          ...s.supervisorFlags,
          [m.call_id]: {
            reason:   String(m.flag.reason ?? ""),
            severity: (m.flag.severity ?? "normal") as SupervisorFlag["severity"],
            source:   String(m.flag.source ?? "agent"),
            ts:       Number(m.flag.ts ?? Date.now() / 1000),
          },
        },
      }));
      return;
    }
    case "supervisor_flag_ack": {
      if (!m.call_id) return;
      setState((s) => {
        const { [m.call_id]: _drop, ...rest } = s.supervisorFlags;
        return { ...s, supervisorFlags: rest };
      });
      return;
    }
    case "transcript": {
      setState((s) => {
        const call = s.liveCalls[m.call_id];
        if (!call) return s;
        const turns = [...call.turns];
        const last = turns[turns.length - 1];
        if (last && last.who === m.who) {
          turns[turns.length - 1] = { ...last, text: last.text + m.text };
        } else {
          turns.push({ who: m.who, text: m.text });
        }
        return {
          ...s,
          liveCalls: { ...s.liveCalls, [m.call_id]: { ...call, turns } },
        };
      });
      return;
    }
    case "caller_identified": {
      // Emitted after a successful lookup_* tool call so the Dashboard
      // can show the real patient name + phone.
      setState((s) => {
        const call = s.liveCalls[m.call_id];
        if (!call) return s;
        return {
          ...s,
          liveCalls: {
            ...s.liveCalls,
            [m.call_id]: {
              ...call,
              caller_name:  m.name || call.caller_name,
              caller_phone: m.phone ?? call.caller_phone,
            },
          },
        };
      });
      return;
    }
    case "debug": {
      const event: DebugEvent = {
        ts:      Number(m.ts) || (Date.now() / 1000),
        level:   String(m.level || "INFO"),
        logger:  String(m.logger || ""),
        message: String(m.message ?? ""),
        exc:     m.exc ? String(m.exc) : null,
      };
      setState((s) => {
        // Append + cap. Sliced from the END so we keep the most recent.
        const next = s.debugEvents.length >= DEBUG_BUFFER_MAX
          ? s.debugEvents.slice(-(DEBUG_BUFFER_MAX - 1))
          : s.debugEvents;
        return { ...s, debugEvents: [...next, event] };
      });
      return;
    }
    case "fabrication": {
      const event: FabricationEvent = {
        call_id: m.call_id,
        kind:    m.kind,
        value:   m.value,
        ts:      Math.floor(Date.now() / 1000),
      };
      setState((s) => ({
        ...s,
        recentFabrications: [event, ...s.recentFabrications].slice(0, 20),
      }));
      return;
    }
    case "tool_result": {
      const event: ToolResultEvent = {
        call_id: m.call_id,
        name:    m.name,
        ok:      !!m.ok,
        args:    m.args || {},
        error:   m.error || null,
        ts:      Math.floor(Date.now() / 1000),
      };
      setState((s) => ({
        ...s,
        recentToolResults: [event, ...s.recentToolResults].slice(0, 20),
      }));
      return;
    }
    case "tool_mutation": {
      // Append a copy for any subscriber that's watching mutations
      // (the Dashboard mirrors these into localStorage so the SPA's
      // Patients / Appointments pages reflect what the agent did).
      const event: ToolMutationEvent = {
        kind:                  m.kind,
        call_id:               m.call_id,
        patient:               m.patient,
        appointment:           m.appointment,
        previous_scheduled_at: m.previous_scheduled_at,
      };
      setState((s) => ({
        ...s,
        // keep the last 100 so the buffer doesn't grow forever during a
        // long session
        recentMutations: [event, ...s.recentMutations].slice(0, 100),
      }));
      return;
    }
    default:
      return;
  }
}

function connect() {
  if (typeof window === "undefined") return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  if (starting) return;
  starting = true;
  try {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/api/demo/clinic/agent/ws`;
    ws = new WebSocket(url);
  } catch {
    ws = null;
    starting = false;
    scheduleReconnect();
    return;
  }
  ws.onopen = () => {
    starting = false;
    setState({ wsConnected: true });
  };
  ws.onmessage = (e) => applyEvent(e.data);
  ws.onclose = () => {
    starting = false;
    setState({ wsConnected: false });
    ws = null;
    scheduleReconnect();
  };
  ws.onerror = () => {
    // close handler runs after this; reconnect is scheduled there
  };
}

function scheduleReconnect() {
  if (reconnectTimer) window.clearTimeout(reconnectTimer);
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 2000);
}

export function liveAgentStoreSnapshot(): State {
  return state;
}

/** Operator clicked Acknowledge on a flagged row. Optimistically removes
 * the flag locally, then POSTs to the backend; the backend's broadcast
 * keeps peer dashboards in sync. If the POST fails we restore — the
 * optimism is what keeps the UI from feeling laggy. */
export async function acknowledgeFlag(callId: string): Promise<void> {
  const prior = state.supervisorFlags[callId];
  if (!prior) return;
  setState((s) => {
    const { [callId]: _drop, ...rest } = s.supervisorFlags;
    return { ...s, supervisorFlags: rest };
  });
  try {
    const r = await fetch(
      `/api/demo/clinic/agent/calls/${encodeURIComponent(callId)}/acknowledge_flag`,
      { method: "POST" },
    );
    if (!r.ok) throw new Error(`ack failed: ${r.status}`);
  } catch (err) {
    // Restore so the operator sees that the click didn't land.
    setState((s) => ({
      ...s,
      supervisorFlags: { ...s.supervisorFlags, [callId]: prior },
    }));
    // eslint-disable-next-line no-console
    console.warn("[liveAgent] acknowledgeFlag failed", err);
  }
}

export function consumeMutation(event: ToolMutationEvent) {
  // Called by the Dashboard once it has applied a mutation to localStorage,
  // so the same event isn't replayed.
  setState((s) => ({
    ...s,
    recentMutations: s.recentMutations.filter((e) => e !== event),
  }));
}

/** Drop every accumulated debug event. Used by the Debug page's Clear
 * button when the operator wants a fresh view. */
export function clearDebugEvents() {
  setState((s) => ({ ...s, debugEvents: [] }));
}

/** React hook — re-renders the component on any store change. Boots the
 * WebSocket on first use; multiple components share the same connection. */
export function useLiveAgentStore(): State {
  const [, force] = useState(0);
  useEffect(() => {
    connect();
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return state;
}
