import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  PhoneCall, UserPlus, CalendarPlus, CalendarX, CalendarClock,
  Trash2, Sparkles, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useApp } from "@/lib/i18n";
import {
  consumeMutation, useLiveAgentStore,
  type LiveCall,
} from "@/lib/liveAgentStore";
import {
  SEED_AGENT_ACTIVITY,
  SEED_DEPARTMENTS, SEED_PATIENTS, SEED_PROVIDERS, SEED_SLOT_OVERRIDES,
  DEFAULT_WORKING_HOURS, SLOT_MINUTES,
  bookedSlotsForDate, getSeedAppointments, isBreakSlot, localized,
  nextId, slotsForDay, timeToMinutes, useDemoCollection, weekdayOf,
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
  const activeCall = activeCallList[0] ?? null;
  const wsConnected = live.wsConnected;

  // Snapshot push moved to _app.tsx so the agent always has fresh data,
  // even when the user is on a non-Dashboard page when a call lands.

  // When the backend agent creates a patient / appointment via a tool call
  // it broadcasts a tool_mutation event. Mirror those records into the
  // SPA's localStorage so the Patients + Appointments + Calendar pages
  // show what the agent did, AND drop an entry into the SPA's existing
  // agent_activity feed so the per-row delete-with-cascade keeps working.
  //
  // Uses functional updaters everywhere so multiple mutations in the same
  // useEffect tick see each other's results (prior versions of this code
  // used stale closures and silently dropped the appointment update when
  // a patient_created event arrived first).
  useEffect(() => {
    for (const ev of live.recentMutations) {
      if (ev.kind === "patient_created" && ev.patient) {
        setPatients((prev) =>
          prev.some((p) => p.id === ev.patient.id) ? prev : [...prev, ev.patient],
        );
        setActivity((prev) => [{
          id:             nextId("LAE", prev),
          ts:             new Date().toISOString(),
          call_id:        ev.call_id,
          caller_name:    ev.patient.name || "Unknown",
          caller_phone:   ev.patient.phone || "",
          action:         "create_patient",
          summary:        `Created new patient ${ev.patient.name} (file ${ev.patient.file_number})`,
          summary_ar:     `أنشأ مريضاً جديداً ${ev.patient.name_ar || ev.patient.name} (الملف ${ev.patient.file_number})`,
          patient_id:     ev.patient.id,
          appointment_id: null,
        }, ...prev]);
      } else if (ev.kind === "appointment_created" && ev.appointment) {
        const apt = ev.appointment;
        setAppointments((prev) =>
          prev.some((a) => a.id === apt.id) ? prev : [...prev, apt],
        );
        setActivity((prev) => [{
          id:             nextId("LAE", prev),
          ts:             new Date().toISOString(),
          call_id:        ev.call_id,
          caller_name:    apt.patient_name || "Unknown",
          caller_phone:   apt.patient_phone || "",
          action:         "create_appointment",
          summary:        `Booked appointment ${apt.id} at ${apt.scheduled_at?.slice(0, 16).replace("T", " ")}`,
          summary_ar:     `حجز موعد ${apt.id} في ${apt.scheduled_at?.slice(0, 16).replace("T", " ")}`,
          patient_id:     null,
          appointment_id: apt.id,
        }, ...prev]);
      }
      consumeMutation(ev);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.recentMutations]);

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
    const entry: AgentActivity = {
      id: nextId("LAE", activity),
      ts: new Date().toISOString(),
      call_id: DEMO_CALL.id,
      caller_name: DEMO_CALL.name_en,
      caller_phone: DEMO_CALL.phone,
      ...payload,
    };
    setActivity([entry, ...activity]);
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

      {/* Active calls + transcript — both driven by the agent WebSocket */}
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <PhoneCall className={`h-4 w-4 ${activeCall ? "text-emerald-600" : "text-muted-foreground"}`} />
              <h2 className="text-sm font-semibold">{t("activeCallsHeading")}</h2>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {!wsConnected && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-300">
                  reconnecting…
                </span>
              )}
              <span className="text-muted-foreground">{activeCallList.length}</span>
            </div>
          </div>
          {activeCall
            ? <ActiveCallCard call={activeCall} t={t} />
            : <div className="p-6 text-center text-sm text-muted-foreground">{t("noActiveCalls")}</div>
          }
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">{t("liveTranscript")}</h2>
            </div>
            <span className="text-xs text-muted-foreground">
              {activeCall ? `${activeCall.turns.length} turns` : "—"}
            </span>
          </div>
          <div className="max-h-[360px] space-y-2 overflow-y-auto p-4">
            {(activeCall?.turns ?? []).length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {activeCall
                  ? "Awaiting first transcribed turn…"
                  : t("noActiveCalls")}
              </div>
            )}
            {activeCall?.turns.map((m, i) => (
              <div
                key={i}
                className={`flex flex-col rounded-lg p-2.5 text-sm ${
                  m.who === "agent"
                    ? "bg-primary/10 text-foreground"
                    : "bg-muted/50 text-foreground"
                }`}
                dir="auto"
              >
                <span className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {m.who === "agent" ? t("agentLabel") : t("callerLabel")}
                </span>
                <span>{m.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

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

function ActiveCallCard({
  call, t,
}: {
  call: LiveCall;
  t: (k: never) => string;
}) {
  // Live-ticking duration counter — recomputed every second from the
  // server-provided started_at.
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const elapsedSec = Math.max(0, Math.floor((now - call.started_at * 1000) / 1000));
  const m = Math.floor(elapsedSec / 60);
  const s = elapsedSec % 60;
  const elapsed = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <span className="relative inline-flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
        <span className="text-xs font-medium uppercase tracking-wide text-emerald-600">
          {t("statusInCall" as never)}
        </span>
      </div>
      <div>
        <div className="text-base font-semibold text-foreground">
          {call.caller_name}
        </div>
        <div className="font-mono text-xs text-muted-foreground" dir="ltr">
          {call.caller_phone ?? call.peer}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-muted/40 p-2">
          <div className="text-[10px] uppercase text-muted-foreground">{t("callDuration" as never)}</div>
          <div className="mt-1 font-mono text-foreground">{elapsed}</div>
        </div>
        <div className="rounded-lg bg-muted/40 p-2">
          <div className="text-[10px] uppercase text-muted-foreground">{t("callerStatus" as never)}</div>
          <div className="mt-1 text-foreground">{t("statusInCall" as never)}</div>
        </div>
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
