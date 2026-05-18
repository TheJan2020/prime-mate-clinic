import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  PhoneCall, PhoneForwarded, UserPlus, UserCheck, CalendarPlus, CalendarX,
  CalendarClock, Trash2, Sparkles, Activity, ChevronRight, ChevronDown,
  AlertTriangle, ShieldAlert, Headphones, MessageSquare, Megaphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useApp } from "@/lib/i18n";
import {
  useLiveAgentStore,
  acknowledgeFlag,
  type LiveCall,
  type SupervisorFlag,
} from "@/lib/liveAgentStore";
import {
  SEED_AGENT_ACTIVITY,
  SEED_DEPARTMENTS, SEED_PATIENTS, SEED_PROVIDERS, SEED_SLOT_OVERRIDES,
  DEFAULT_WORKING_HOURS, SLOT_MINUTES,
  bookedSlotsForDate, getSeedAppointments, isBreakSlot, localized,
  nextId, slotsForDay, suggestIdNumber, timeToMinutes, useDemoCollection,
  weekdayOf,
  type AgentActivity, type AgentActionKind, type Appointment,
  type ClinicSlotOverride, type Department, type Patient, type Provider,
  type Gender,
} from "@/lib/demoStore";

export const Route = createFileRoute("/_app/call-center/dashboard")({
  component: DashboardPage,
});

// LiveCall type now imported from @/lib/liveAgentStore (singleton store
// that owns the WebSocket so the transcript survives navigation while a
// call is active).

function DashboardPage() {
  const { t, lang } = useApp();

  // Live collections — needed for the simulate buttons + the cascade delete.
  const { items: activity, setAll: setActivity, reset: _resetActivity } =
    useDemoCollection<AgentActivity>("agent_activity", SEED_AGENT_ACTIVITY);
  const { items: patients, setAll: setPatients } =
    useDemoCollection<Patient>("patients", SEED_PATIENTS);
  const { items: appointments, setAll: setAppointments } =
    useDemoCollection<Appointment>("appointments", getSeedAppointments);
  const { items: clinics } =
    useDemoCollection<Department>("departments", SEED_DEPARTMENTS);
  const { items: providers } =
    useDemoCollection<Provider>("providers", SEED_PROVIDERS);
  const { items: overrides } =
    useDemoCollection<ClinicSlotOverride>("slot_overrides", SEED_SLOT_OVERRIDES);

  void providers; // FK look-up reserved for future use

  // ----- live agent feed (singleton store, survives navigation) ----------
  const live = useLiveAgentStore();
  const activeCallList = useMemo(
    () => Object.values(live.liveCalls).sort((a, b) => b.started_at - a.started_at),
    [live.liveCalls],
  );
  // Set of call_ids where the agent has created a new patient file —
  // flips that row's badge from yellow to green even if `caller_identified`
  // never fires (lookup found nobody, but create_patient succeeded).
  const callsWithCreatedPatient = useMemo(() => {
    const set = new Set<string>();
    for (const m of live.recentMutations) {
      if (m.kind === "patient_created" && m.call_id) set.add(m.call_id);
    }
    return set;
  }, [live.recentMutations]);
  const wsConnected = live.wsConnected;

  // Supervisor extension — read from the same escalation config that the
  // agent's persona uses. Refetched on focus so editing it in Call Center
  // → Configuration reflects on the Dashboard without a page reload.
  const [supervisorExt, setSupervisorExt] = useState<string>("");
  useEffect(() => {
    const load = () => {
      fetch("/api/demo/clinic/agent/escalation")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d && typeof d.supervisor_extension === "string") setSupervisorExt(d.supervisor_extension); })
        .catch(() => { /* silent — banner just hides the dial button */ });
    };
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, []);

  // Snapshot push + tool_mutation drain both moved to _app.tsx so the
  // SPA's localStorage stays in sync with the agent's writes regardless
  // of which page the user is viewing during a call. Dashboard just
  // READS the same useDemoCollection state here.

  // ----- delete cascade --------------------------------------------------
  const [deletingEntry, setDeletingEntry] = useState<AgentActivity | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);

  const cascadeDelete = (entry: AgentActivity) => {
    if (entry.patient_id) {
      setPatients(patients.filter((p) => p.id !== entry.patient_id));
    }
    if (entry.appointment_id) {
      setAppointments(appointments.filter((a) => a.id !== entry.appointment_id));
    }
    setActivity(activity.filter((e) => e.id !== entry.id));
  };

  const clearAllCascade = () => {
    const patientIds = new Set(activity.map((e) => e.patient_id).filter(Boolean) as string[]);
    const appointmentIds = new Set(activity.map((e) => e.appointment_id).filter(Boolean) as string[]);
    if (patientIds.size) {
      setPatients(patients.filter((p) => !patientIds.has(p.id)));
    }
    if (appointmentIds.size) {
      setAppointments(appointments.filter((a) => !appointmentIds.has(a.id)));
    }
    setActivity([]);
  };

  // ----- simulate buttons ------------------------------------------------
  const simulateNewPatient = () => {
    const p = generateRandomPatient(patients);
    setPatients([...patients, p]);
    appendActivity({
      action: "create_patient",
      summary: `Created new patient ${p.name} (file ${p.file_number})`,
      summary_ar: `أنشأ مريضاً جديداً ${p.name_ar} (الملف ${p.file_number})`,
      patient_id: p.id,
      appointment_id: null,
    });
  };

  const simulateNewAppointment = () => {
    // Pick a clinic + a free slot in the next 7 days; pick a random
    // patient (from the existing list) and book.
    const slot = findOpenSlot(clinics, appointments, overrides);
    if (!slot) {
      alert("No free slots in the next 7 days to book."); return;
    }
    const patient = patients[Math.floor(Math.random() * patients.length)];
    const apt: Appointment = {
      id: nextId("APT", appointments),
      patient_id: patient.id,
      patient_name: patient.name,
      patient_name_ar: patient.name_ar,
      patient_phone: patient.phone,
      department_id: slot.dept.id,
      provider_id: null,
      scheduled_at: slot.iso,
      duration_min: SLOT_MINUTES,
      status: "scheduled",
      notes: "Created by Live Agent (demo)",
    };
    setAppointments([...appointments, apt]);
    appendActivity({
      action: "create_appointment",
      summary: `Booked appointment for ${patient.name} at ${localized(slot.dept.name, slot.dept.name_ar, "en")} — ${slot.iso.slice(0, 16).replace("T", " ")}`,
      summary_ar: `حجز موعد لـ ${patient.name_ar} في ${localized(slot.dept.name, slot.dept.name_ar, "ar")} — ${slot.iso.slice(0, 16).replace("T", " ")}`,
      patient_id: null,
      appointment_id: apt.id,
    });
  };

  const simulateCancel = () => {
    // Find any "scheduled" appointment in the future, mark cancelled.
    const future = appointments
      .filter((a) => a.status === "scheduled" && new Date(a.scheduled_at).getTime() > Date.now())
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    if (future.length === 0) {
      alert("No upcoming scheduled appointments to cancel."); return;
    }
    const target = future[Math.floor(Math.random() * future.length)];
    setAppointments(appointments.map((a) =>
      a.id === target.id ? { ...a, status: "cancelled" as const } : a));
    appendActivity({
      action: "cancel_appointment",
      summary: `Cancelled appointment ${target.id} for ${target.patient_name} (${target.scheduled_at.slice(0, 16).replace("T", " ")})`,
      summary_ar: `ألغى الموعد ${target.id} لـ ${target.patient_name_ar} (${target.scheduled_at.slice(0, 16).replace("T", " ")})`,
      patient_id: null,
      appointment_id: null,
    });
  };

  const simulateReschedule = () => {
    const future = appointments
      .filter((a) => a.status === "scheduled" && new Date(a.scheduled_at).getTime() > Date.now())
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    if (future.length === 0) {
      alert("No upcoming scheduled appointments to reschedule."); return;
    }
    const target = future[Math.floor(Math.random() * future.length)];
    const dept = clinics.find((d) => d.id === target.department_id) ?? clinics[0];
    const newSlot = findOpenSlot([dept], appointments, overrides, target.id);
    if (!newSlot) {
      alert("No alternative free slot found."); return;
    }
    const before = target.scheduled_at;
    setAppointments(appointments.map((a) =>
      a.id === target.id ? { ...a, scheduled_at: newSlot.iso } : a));
    appendActivity({
      action: "reschedule_appointment",
      summary: `Rescheduled ${target.id} for ${target.patient_name}: ${before.slice(0,16).replace("T"," ")} → ${newSlot.iso.slice(0,16).replace("T"," ")}`,
      summary_ar: `أعاد جدولة ${target.id} لـ ${target.patient_name_ar}: ${before.slice(0,16).replace("T"," ")} → ${newSlot.iso.slice(0,16).replace("T"," ")}`,
      patient_id: null,
      appointment_id: target.id,
    });
  };

  const appendActivity = (
    payload: Omit<AgentActivity, "id" | "ts" | "call_id" | "caller_name" | "caller_phone">,
  ) => {
    const active = activeCallList[0];
    const entry: AgentActivity = {
      id: nextId("LAE", activity),
      ts: new Date().toISOString(),
      call_id: active?.call_id ?? "simulated",
      caller_name: active?.caller_name ?? "(simulated)",
      caller_phone: active?.caller_phone ?? "",
      ...payload,
    };
    setActivity((prev) => [entry, ...prev]);
  };

  // Sort newest first for display
  const orderedActivity = useMemo(
    () => [...activity].sort((a, b) => b.ts.localeCompare(a.ts)),
    [activity],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("callCenter")} · {t("dashboard")}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("dashboardDesc")}</p>
      </div>

      {/* One unified Live Calls table — multi-call, yellow→green by
       *  identification, RED when the agent (or auto-detect) raised a
       *  supervisor flag, click row to expand the live transcript. */}
      <LiveCallsTable
        calls={activeCallList}
        callsWithCreatedPatient={callsWithCreatedPatient}
        supervisorFlags={live.supervisorFlags}
        supervisorExtension={supervisorExt}
        wsConnected={wsConnected}
        t={t}
      />

      {/* Fabrication warnings — the agent SPOKE an identifier we
       *  can prove no tool returned. The backend already nudged the
       *  agent to correct itself; we surface it here so the operator
       *  knows the original "your file number is X" was hallucinated. */}
      {live.recentFabrications.length > 0 && (
        <div className="rounded-xl border border-destructive bg-destructive/10">
          <div className="flex items-center gap-2 border-b border-destructive/40 px-4 py-2">
            <Sparkles className="h-4 w-4 text-destructive" />
            <h2 className="text-sm font-semibold text-destructive">
              {t("fabricationsHeading" as never)}
            </h2>
            <span className="ms-2 text-xs text-destructive/80">
              {live.recentFabrications.length}
            </span>
          </div>
          <ul className="divide-y divide-destructive/30">
            {live.recentFabrications.slice(0, 5).map((f, i) => (
              <li key={`${f.ts}-${i}`} className="px-4 py-2 text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono font-semibold text-destructive">
                    {f.kind} → {f.value}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(f.ts * 1000).toLocaleTimeString(
                      lang === "ar" ? "ar-EG" : undefined,
                    )}
                  </span>
                </div>
                <div className="mt-1 text-foreground" dir="auto">
                  {t("fabricationDetail" as never)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tool errors — surfaces silent failures (e.g. agent said
       *  "booked" but create_appointment returned an error). */}
      {live.recentToolResults.some((r) => !r.ok) && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5">
          <div className="flex items-center gap-2 border-b border-destructive/30 px-4 py-2">
            <CalendarX className="h-4 w-4 text-destructive" />
            <h2 className="text-sm font-semibold text-destructive">
              {t("toolErrorsHeading" as never)}
            </h2>
            <span className="ms-2 text-xs text-destructive/80">
              {live.recentToolResults.filter((r) => !r.ok).length}
            </span>
          </div>
          <ul className="divide-y divide-destructive/20">
            {live.recentToolResults
              .filter((r) => !r.ok)
              .slice(0, 5)
              .map((r, i) => (
                <li key={`${r.ts}-${i}`} className="px-4 py-2 text-xs">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono font-semibold text-destructive">
                      {r.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(r.ts * 1000).toLocaleTimeString(
                        lang === "ar" ? "ar-EG" : undefined,
                      )}
                    </span>
                  </div>
                  <div className="mt-1 text-foreground" dir="auto">
                    {r.error || t("toolErrorUnknown" as never)}
                  </div>
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Activity feed */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" />
            <h2 className="text-sm font-semibold">{t("activityFeed")}</h2>
            <span className="ms-2 text-xs text-muted-foreground">{activity.length} entries</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("simulateActions")}:
            </span>
            <Button size="sm" variant="outline" onClick={simulateNewPatient}>
              <UserPlus className="me-1.5 h-3.5 w-3.5" />{t("simulateNewPatient")}
            </Button>
            <Button size="sm" variant="outline" onClick={simulateNewAppointment}>
              <CalendarPlus className="me-1.5 h-3.5 w-3.5" />{t("simulateNewAppointment")}
            </Button>
            <Button size="sm" variant="outline" onClick={simulateCancel}>
              <CalendarX className="me-1.5 h-3.5 w-3.5" />{t("simulateCancel")}
            </Button>
            <Button size="sm" variant="outline" onClick={simulateReschedule}>
              <CalendarClock className="me-1.5 h-3.5 w-3.5" />{t("simulateReschedule")}
            </Button>
            <Button size="sm" variant="outline" className="danger" onClick={() => setClearAllOpen(true)} disabled={activity.length === 0}>
              <Trash2 className="me-1.5 h-3.5 w-3.5" />{t("clearAll")}
            </Button>
          </div>
        </div>
        <div className="divide-y divide-border">
          {orderedActivity.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("noResults")}</p>
          )}
          {orderedActivity.map((entry) => (
            <ActivityRow
              key={entry.id}
              entry={entry}
              lang={lang}
              t={t}
              patientName={
                entry.patient_id
                  ? patients.find((p) => p.id === entry.patient_id)
                  : null
              }
              appointment={
                entry.appointment_id
                  ? appointments.find((a) => a.id === entry.appointment_id) ?? null
                  : null
              }
              onDelete={() => setDeletingEntry(entry)}
            />
          ))}
        </div>
      </div>

      {/* Confirm dialogs */}
      <AlertDialog open={deletingEntry !== null} onOpenChange={(o) => { if (!o) setDeletingEntry(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteCascadeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteCascadeDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deletingEntry) cascadeDelete(deletingEntry); setDeletingEntry(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("deleteEntry")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("clearAllConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("clearAllConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { clearAllCascade(); setClearAllOpen(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("clearAll")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------- subcomponents -------------------------------------------------

function isCallIdentified(c: LiveCall, createdPatientCallIds: Set<string>): boolean {
  return (
    c.caller_name !== "New patient" ||
    c.caller_phone !== null ||
    createdPatientCallIds.has(c.call_id)
  );
}

function fmtElapsed(startedAtSec: number, nowMs: number): string {
  const s = Math.max(0, Math.floor((nowMs - startedAtSec * 1000) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Heuristic: the transcript turn is almost certainly a Gemini mis-classification
 * (echo, breathing, line noise) rather than real caller speech. Saudi-clinic
 * callers speak Arabic + occasionally English; if we see a turn that's mostly
 * CJK / Cyrillic / Greek / Hebrew / etc, it's noise being decoded as random
 * dictionary words from other languages.
 *
 * Returns true if >40% of the non-space characters fall outside Arabic +
 * Latin (incl. Arabic-Indic digits, common punctuation).
 */
function looksLikeGarbage(text: string): boolean {
  if (!text) return false;
  let arabic = 0, latin = 0, other = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    // Skip whitespace + most common punctuation/symbols.
    if (code <= 0x002F) continue;
    if (code >= 0x003A && code <= 0x0040) continue;
    if (code >= 0x005B && code <= 0x0060) continue;
    if (code >= 0x007B && code <= 0x007F) continue;
    // Arabic block (0600-06FF) + Arabic Presentation Forms-A/B (FB50-FDFF, FE70-FEFF).
    if ((code >= 0x0600 && code <= 0x06FF) ||
        (code >= 0xFB50 && code <= 0xFDFF) ||
        (code >= 0xFE70 && code <= 0xFEFF)) {
      arabic++;
    } else if (
      // Basic Latin letters/digits + Latin-1 Supplement + Latin Extended-A.
      (code >= 0x0030 && code <= 0x0039) ||
      (code >= 0x0041 && code <= 0x005A) ||
      (code >= 0x0061 && code <= 0x007A) ||
      (code >= 0x00A0 && code <= 0x017F)
    ) {
      latin++;
    } else {
      other++;
    }
  }
  const total = arabic + latin + other;
  if (total < 3) return false;            // too short to judge
  return other / total > 0.4;
}

function LiveCallsTable({
  calls, callsWithCreatedPatient, supervisorFlags, supervisorExtension,
  wsConnected, t,
}: {
  calls: LiveCall[];
  callsWithCreatedPatient: Set<string>;
  supervisorFlags: Record<string, SupervisorFlag>;
  supervisorExtension: string;
  wsConnected: boolean;
  t: (k: never) => string;
}) {
  // One row may be expanded at a time. Resets when the call ends (the
  // call_id disappears from the calls prop — the row vanishes and
  // expanded is harmless to leave stale).
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const identifiedCount = calls.filter((c) => isCallIdentified(c, callsWithCreatedPatient)).length;
  // Flagged count is computed against active calls only — a flag whose
  // call already ended is harmless leftover state and gets cleaned up
  // by the call_ended handler in the store.
  const flaggedCount = calls.filter((c) => supervisorFlags[c.call_id]).length;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <PhoneCall className={`h-4 w-4 ${calls.length > 0 ? "text-emerald-600" : "text-muted-foreground"}`} />
          <h2 className="text-sm font-semibold text-card-foreground">{t("activeCallsHeading")}</h2>
          <span className="text-xs text-muted-foreground">
            {calls.length === 0
              ? "0 in progress"
              : `${calls.length} in progress · ${identifiedCount} identified${flaggedCount > 0 ? ` · ${flaggedCount} flagged` : ""}`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-muted-foreground">Unidentified</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-muted-foreground">Identified</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            <span className="text-muted-foreground">Supervisor flag</span>
          </span>
          {!wsConnected && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-300">
              reconnecting…
            </span>
          )}
          {wsConnected && (
            <span className="inline-flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              <span className="text-muted-foreground">Streaming</span>
            </span>
          )}
        </div>
      </div>

      {calls.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <div className="text-sm text-muted-foreground">{t("noActiveCalls")}</div>
          <div className="mt-1 text-xs text-muted-foreground/80">
            Calls will appear here automatically as they come in.
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-12 gap-3 border-b border-border px-5 py-2 text-xs uppercase tracking-wide text-muted-foreground">
            <div className="col-span-1" />
            <div className="col-span-3">Caller</div>
            <div className="col-span-2">Status · Duration</div>
            <div className="col-span-3">Last from caller</div>
            <div className="col-span-3">Last from agent</div>
          </div>
          <div className="divide-y divide-border">
            {calls.map((c) => (
              <LiveCallRow
                key={c.call_id}
                call={c}
                identified={isCallIdentified(c, callsWithCreatedPatient)}
                flag={supervisorFlags[c.call_id] ?? null}
                supervisorExtension={supervisorExtension}
                expanded={expandedId === c.call_id}
                onToggle={() =>
                  setExpandedId((prev) => (prev === c.call_id ? null : c.call_id))
                }
                nowMs={nowMs}
                t={t}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LiveCallRow({
  call, identified, flag, supervisorExtension, expanded, onToggle, nowMs, t,
}: {
  call: LiveCall;
  identified: boolean;
  /** When non-null this row is escalated to a human supervisor and
   * paints red regardless of identification state. */
  flag: SupervisorFlag | null;
  supervisorExtension: string;
  expanded: boolean;
  onToggle: () => void;
  nowMs: number;
  t: (k: never) => string;
}) {
  // Flag tint trumps identification tint — a flagged call is the most
  // urgent state and must visually beat the green/yellow signal.
  const tint = flag
    ? (flag.severity === "high"
        ? "border-l-4 border-l-red-600 bg-red-500/15"
        : "border-l-4 border-l-red-500 bg-red-500/10")
    : identified
      ? "border-l-4 border-l-emerald-500 bg-emerald-500/5"
      : "border-l-4 border-l-amber-500 bg-amber-500/10";

  const lastCaller = call.turns.filter((m) => m.who === "caller").slice(-2);
  const lastAgent  = call.turns.filter((m) => m.who === "agent").slice(-2);

  return (
    <div className={tint}>
      {flag && (
        <FlagBanner flag={flag} callId={call.call_id} extension={supervisorExtension} />
      )}
      <button
        type="button"
        onClick={onToggle}
        className="grid w-full grid-cols-12 items-start gap-3 px-5 py-3 text-left text-sm transition-colors hover:bg-foreground/[0.03]"
        aria-expanded={expanded}
        title={expanded ? "Click to collapse" : "Click to expand live transcript"}
      >
        <div className="col-span-1 flex items-center pt-0.5">
          {expanded
            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="col-span-3 min-w-0">
          <div className="truncate font-medium text-foreground" dir="auto">{call.caller_name}</div>
          <div className="truncate font-mono text-xs text-muted-foreground" dir="ltr">
            {call.caller_phone ?? call.peer}
          </div>
        </div>
        <div className="col-span-2">
          {identified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <UserCheck className="h-3 w-3" /> Identified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              <UserPlus className="h-3 w-3" /> Unidentified
            </span>
          )}
          <div className="mt-1 font-mono text-xs text-muted-foreground">
            {fmtElapsed(call.started_at, nowMs)}
          </div>
          {/* Always-on dial button — copies the configured supervisor
              extension so the operator can join ANY call, not only
              flagged ones. Hidden hint links to the config page when
              the extension hasn't been set yet. */}
          <div className="mt-1.5">
            <DialModeButtons extension={supervisorExtension} callId={call.call_id} />
          </div>
        </div>
        <div className="col-span-3 min-w-0 space-y-0.5 text-xs">
          {lastCaller.length === 0 ? (
            <span className="italic text-muted-foreground">— awaiting —</span>
          ) : (
            lastCaller.map((m, i) =>
              looksLikeGarbage(m.text) ? (
                <div key={i} className="line-clamp-1 italic text-muted-foreground/70">
                  [unintelligible audio]
                </div>
              ) : (
                <div key={i} className="line-clamp-1 text-foreground" dir="auto">{m.text}</div>
              ),
            )
          )}
        </div>
        <div className="col-span-3 min-w-0 space-y-0.5 text-xs">
          {lastAgent.length === 0 ? (
            <span className="italic text-muted-foreground">— awaiting —</span>
          ) : (
            lastAgent.map((m, i) => (
              <div key={i} className="line-clamp-1 text-foreground" dir="auto">{m.text}</div>
            ))
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-card/60 px-5 py-3">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="h-3 w-3 text-primary" />
            <span className="font-medium uppercase tracking-wide">{t("liveTranscript" as never)}</span>
            <span>·</span>
            <span>{call.turns.length} turns</span>
          </div>
          <div className="max-h-[28rem] space-y-2 overflow-y-auto rounded-md border border-border bg-muted/20 p-3">
            {call.turns.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Awaiting first transcribed turn…
              </div>
            )}
            {call.turns.map((m, i) => {
              const garbage = m.who === "caller" && looksLikeGarbage(m.text);
              return (
                <div
                  key={i}
                  className={`flex ${m.who === "agent" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={
                      "max-w-[80%] rounded-lg px-3 py-2 text-sm " +
                      (m.who === "agent"
                        ? "bg-primary/10 text-foreground"
                        : garbage
                          ? "border border-dashed border-border bg-muted/30 text-muted-foreground italic"
                          : "border border-border bg-card text-foreground")
                    }
                    dir="auto"
                  >
                    <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {m.who === "agent" ? t("agentLabel" as never) : t("callerLabel" as never)}
                      {garbage && " · likely noise / echo"}
                    </div>
                    {garbage ? "[unintelligible audio]" : m.text}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Three-button group: Listen / Whisper / Barge. Each POSTs to
 *  /agent/calls/{id}/dial_supervisor?mode=<X>; backend originates an AMI
 *  ChanSpy with the matching option string. On any failure (AMI creds
 *  missing, FreePBX unreachable, etc.) the clicked button falls back to
 *  copying the extension to clipboard so the operator isn't stranded —
 *  the error surfaces in the button's title attribute. */
type SpyMode = "listen" | "whisper" | "barge";

const MODE_META: Record<SpyMode, {
  label:   string;
  Icon:    typeof Headphones;
  title:   string;
  doneMsg: string;
}> = {
  listen: {
    label:   "Listen",
    Icon:    Headphones,
    title:   "Listen silently — neither the caller nor the AI knows you're on the line",
    doneMsg: "Listening",
  },
  whisper: {
    label:   "Whisper",
    Icon:    MessageSquare,
    title:   "Coach the caller — your voice goes ONLY to them, the AI doesn't hear you",
    doneMsg: "Whispering",
  },
  barge: {
    label:   "Barge",
    Icon:    Megaphone,
    title:   "3-way — both the caller AND the AI hear you (full join-in)",
    doneMsg: "Joined",
  },
};

function DialModeButtons({
  extension,
  callId,
  variant = "neutral",
}: {
  extension: string;
  callId: string;
  variant?: "neutral" | "alert";
}) {
  const border = variant === "alert"
    ? "border-red-500/40 hover:bg-red-500/10"
    : "border-border hover:bg-muted";

  if (!extension) {
    return (
      <Link
        to="/call-center/configuration"
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-[11px] font-medium ${border}`}
        title="No supervisor extension configured yet — click to set one in Call Center → Configuration"
      >
        <PhoneForwarded className="h-3 w-3" />
        Set ext.
      </Link>
    );
  }

  return (
    <div className="inline-flex items-center gap-1">
      <span className="font-mono text-[10px] text-muted-foreground" title="Configured supervisor extension">
        ext {extension}
      </span>
      <div className="inline-flex overflow-hidden rounded-md border" role="group">
        {(["listen", "whisper", "barge"] as SpyMode[]).map((m, i) => (
          <DialModeOne
            key={m}
            mode={m}
            extension={extension}
            callId={callId}
            variant={variant}
            // Visual separation between adjacent buttons in the group.
            divider={i > 0}
          />
        ))}
      </div>
    </div>
  );
}

function DialModeOne({
  mode, extension, callId, variant, divider,
}: {
  mode: SpyMode;
  extension: string;
  callId: string;
  variant: "neutral" | "alert";
  divider: boolean;
}) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "calling" }
    | { kind: "ringing" }
    | { kind: "copied" }
    | { kind: "failed"; error: string }
  >({ kind: "idle" });

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(extension);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = extension;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* swallow */ }
      document.body.removeChild(ta);
    }
  };

  const onClick = async () => {
    if (!callId) {
      // No active call associated with this row — fall back to copy.
      await copyToClipboard();
      setState({ kind: "copied" });
      window.setTimeout(() => setState({ kind: "idle" }), 2000);
      return;
    }
    setState({ kind: "calling" });
    try {
      const r = await fetch(
        `/api/demo/clinic/agent/calls/${encodeURIComponent(callId)}/dial_supervisor?mode=${mode}`,
        { method: "POST" },
      );
      const data = await r.json().catch(() => ({}));
      if (r.ok && data?.ok) {
        setState({ kind: "ringing" });
        window.setTimeout(() => setState({ kind: "idle" }), 3500);
      } else {
        const errMsg = data?.error || data?.detail || `HTTP ${r.status}`;
        await copyToClipboard();
        setState({ kind: "failed", error: errMsg });
        window.setTimeout(() => setState({ kind: "idle" }), 5000);
      }
    } catch (e: any) {
      await copyToClipboard();
      setState({ kind: "failed", error: e?.message || "network error" });
      window.setTimeout(() => setState({ kind: "idle" }), 5000);
    }
  };

  const meta = MODE_META[mode];
  const baseBg = variant === "alert" ? "hover:bg-red-500/10" : "hover:bg-muted";
  const dividerCls = divider ? "border-s border-border" : "";

  let label: string;
  let title: string;
  let busy = false;
  let stateBg = "bg-background";
  if (state.kind === "calling") {
    label = "…";
    title = `Dialing ${extension} (${mode}) via AMI`;
    busy = true;
  } else if (state.kind === "ringing") {
    label = meta.doneMsg;
    title = `Phone is ringing on ext. ${extension} — pick up to ${meta.label.toLowerCase()}`;
    stateBg = "bg-emerald-500/15";
  } else if (state.kind === "copied") {
    label = "Copied";
    title = "Extension copied — paste into your softphone";
    stateBg = "bg-amber-500/10";
  } else if (state.kind === "failed") {
    label = "Failed";
    title = `Auto-dial (${mode}) failed:\n${state.error}\n\nExtension copied as fallback. Hover to see full error, or open Call Center → Debug for the full backend log.`;
    stateBg = "bg-destructive/15 text-destructive";
  } else {
    label = meta.label;
    title = meta.title;
  }

  const Icon = meta.Icon;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={busy}
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium disabled:opacity-60 ${stateBg} ${baseBg} ${dividerCls}`}
      title={title}
    >
      <Icon className="h-3 w-3" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function FlagBanner({
  flag, callId, extension,
}: {
  flag: SupervisorFlag;
  callId: string;
  /** PBX extension the supervisor should dial in to. Empty string makes
   * the dial button render as a "Set ext." link to the config page. */
  extension: string;
}) {
  const [busy, setBusy] = useState(false);
  const onAck = async () => {
    if (busy) return;
    setBusy(true);
    try { await acknowledgeFlag(callId); }
    finally { setBusy(false); }
  };
  const isHigh = flag.severity === "high";
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-5 py-2 text-xs ${
      isHigh
        ? "border-red-600/40 bg-red-600/10 text-red-700 dark:text-red-300"
        : "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-300"
    }`}>
      <div className="flex min-w-0 items-center gap-2">
        {isHigh ? <ShieldAlert className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
        <span className="font-semibold uppercase tracking-wide">
          {isHigh ? "Supervisor needed — high" : "Supervisor flagged"}
        </span>
        <span className="truncate" dir="auto">{flag.reason}</span>
        <span className="ms-1 hidden text-[10px] uppercase opacity-70 sm:inline">
          via {flag.source}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <DialModeButtons extension={extension} callId={callId} variant="alert" />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAck(); }}
          disabled={busy}
          className="rounded-md border border-red-500/40 bg-background px-2 py-0.5 text-[11px] font-medium hover:bg-red-500/10 disabled:opacity-50"
        >
          {busy ? "Acknowledging…" : "Acknowledge"}
        </button>
      </div>
    </div>
  );
}

function ActivityRow({
  entry, lang, t, patientName, appointment, onDelete,
}: {
  entry: AgentActivity;
  lang: "en" | "ar";
  t: (k: never) => string;
  patientName: Patient | null | undefined;
  appointment: Appointment | null;
  onDelete: () => void;
}) {
  const ts = new Date(entry.ts);
  const tsLabel = ts.toLocaleString(lang === "ar" ? "ar-EG" : undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const actionLabel = ACTION_KEY[entry.action];
  const actionColor = ACTION_COLOR[entry.action];
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${actionColor}`}>
        {ACTION_ICON[entry.action]}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium text-foreground">{t(actionLabel as never)}</span>
          <span className="font-mono text-[11px] text-muted-foreground">{entry.id}</span>
          <span className="text-[11px] text-muted-foreground">· {entry.call_id}</span>
          <span className="ms-auto text-[11px] text-muted-foreground">{tsLabel}</span>
        </div>
        <div className="mt-1 text-sm text-muted-foreground" dir="auto">
          {lang === "ar" ? entry.summary_ar : entry.summary}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          {entry.patient_id && (
            <span className="inline-flex items-center rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">
              + {entry.patient_id}
              {patientName && ` · ${localized(patientName.name, patientName.name_ar, lang)}`}
            </span>
          )}
          {entry.appointment_id && (
            <span className="inline-flex items-center rounded-md bg-sky-500/15 px-1.5 py-0.5 text-sky-700 dark:text-sky-300">
              {entry.action === "create_appointment" ? "+ " : ""}{entry.appointment_id}
              {appointment && ` · ${appointment.scheduled_at.slice(0, 16).replace("T", " ")}`}
            </span>
          )}
        </div>
      </div>
      <Button size="icon" variant="ghost" onClick={onDelete} aria-label={t("deleteEntry" as never)}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

const ACTION_KEY: Record<AgentActionKind, string> = {
  create_patient:        "actionCreatePatient",
  create_appointment:    "actionCreateAppointment",
  cancel_appointment:    "actionCancelAppointment",
  reschedule_appointment:"actionRescheduleAppointment",
};
const ACTION_COLOR: Record<AgentActionKind, string> = {
  create_patient:        "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  create_appointment:    "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  cancel_appointment:    "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  reschedule_appointment:"bg-violet-500/15 text-violet-600 dark:text-violet-400",
};
const ACTION_ICON: Record<AgentActionKind, React.ReactNode> = {
  create_patient:        <UserPlus className="h-4 w-4" />,
  create_appointment:    <CalendarPlus className="h-4 w-4" />,
  cancel_appointment:    <CalendarX className="h-4 w-4" />,
  reschedule_appointment:<CalendarClock className="h-4 w-4" />,
};

// ---------- random generators for simulate buttons -----------------------

function generateRandomPatient(existing: Patient[]): Patient {
  // Deterministic-ish from current time so we don't accidentally hit a
  // file-number collision; suggestFileNumber from demoStore picks a fresh
  // one against the existing set.
  const firstNamesM = ["Bilal", "Saad", "Walid", "Salem", "Adel", "Naif"];
  const firstNamesF = ["Reem", "Najla", "Bushra", "Asma", "Hala", "Lina"];
  const lastNames = ["Al-Otaibi", "Al-Qahtani", "Al-Harbi", "Al-Ghamdi"];
  const lastNamesAr = ["العتيبي", "القحطاني", "الحربي", "الغامدي"];
  const firstAr = {
    Bilal: "بلال", Saad: "سعد", Walid: "وليد", Salem: "سالم", Adel: "عادل", Naif: "نايف",
    Reem: "ريم", Najla: "نجلاء", Bushra: "بشرى", Asma: "أسماء", Hala: "هالة", Lina: "لينا",
  } as Record<string, string>;
  const gender: Gender = Math.random() < 0.5 ? "male" : "female";
  const firsts = gender === "male" ? firstNamesM : firstNamesF;
  const i = Math.floor(Math.random() * lastNames.length);
  const f = firsts[Math.floor(Math.random() * firsts.length)];
  const last = lastNames[i];
  const lastAr = lastNamesAr[i];
  const id = nextIdLocal("PAT", existing);
  const fileNum = randomFileNumber(existing);
  return {
    id: id,
    file_number: fileNum,
    id_number: suggestIdNumber(existing),
    name: `${f} ${last}`,
    name_ar: `${firstAr[f]} ${lastAr}`,
    gender,
    date_of_birth: randomDob(),
    phone: randomSaudiMobile(),
    email: `${f.toLowerCase()}.${last.toLowerCase().replace("al-", "")}@example.sa`,
    city: "Riyadh",
    city_ar: "الرياض",
    registration_date: new Date().toISOString().slice(0, 10),
    registration_source: "live_agent",
    notes: "Created during live agent call (demo).",
  };
}

function nextIdLocal(prefix: "PAT", existing: { id: string }[]): string {
  return nextId(prefix, existing);
}

function randomFileNumber(existing: Patient[]): string {
  const used = new Set(existing.map((p) => p.file_number));
  for (let i = 0; i < 100; i++) {
    const letter = ["A", "B", "C"][Math.floor(Math.random() * 3)];
    const first = 1 + Math.floor(Math.random() * 9);
    const rest = String(Math.floor(Math.random() * 100000)).padStart(5, "0");
    const candidate = `${letter}${first}${rest}`;
    if (!used.has(candidate)) return candidate;
  }
  return `A100000`;
}
function randomDob(): string {
  const age = 4 + Math.floor(Math.random() * 70);
  const year = new Date().getFullYear() - age;
  const m = 1 + Math.floor(Math.random() * 12);
  const d = 1 + Math.floor(Math.random() * 27);
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function randomSaudiMobile(): string {
  const second = Math.floor(Math.random() * 10);
  const b1 = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  const b2 = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `+9665${second} ${b1} ${b2}`;
}

interface FoundSlot { dept: Department; iso: string; }
function findOpenSlot(
  clinics: Department[],
  appointments: Appointment[],
  overrides: ClinicSlotOverride[],
  excludeId?: string,
): FoundSlot | null {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = new Date(today); date.setDate(today.getDate() + dayOffset);
    const ymdStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    for (const c of clinics) {
      const day = (c.working_hours ?? DEFAULT_WORKING_HOURS)[weekdayOf(ymdStr)];
      if (!day.open) continue;
      const all = slotsForDay(day).filter((s) => !isBreakSlot(s, day));
      const booked = bookedSlotsForDate(appointments, ymdStr, c.id, excludeId);
      const blocked = new Set(
        overrides
          .filter((o) => o.department_id === c.id && o.date === ymdStr)
          .flatMap((o) => o.blocked_slots),
      );
      // For today, skip past slots.
      const isToday = dayOffset === 0;
      const nowMin = today.getHours() * 60 + today.getMinutes();
      for (const slot of all) {
        if (booked.has(slot) || blocked.has(slot)) continue;
        if (isToday && timeToMinutes(slot) < nowMin) continue;
        const [hh, mm] = slot.split(":").map((n) => parseInt(n, 10));
        const dt = new Date(date); dt.setHours(hh, mm, 0, 0);
        return { dept: c, iso: dt.toISOString() };
      }
    }
  }
  return null;
}
