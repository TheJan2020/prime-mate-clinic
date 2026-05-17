import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BrandToggles } from "@/components/BrandToggles";
import { useApp } from "@/lib/i18n";
import { consumeMutation, useLiveAgentStore } from "@/lib/liveAgentStore";
import {
  nextId,
  SEED_AGENT_ACTIVITY,
  SEED_DEPARTMENTS, SEED_PATIENTS, SEED_PROVIDERS, SEED_SLOT_OVERRIDES,
  getSeedAppointments, useDemoCollection,
  type AgentActivity, type Appointment, type ClinicSlotOverride,
  type Department, type Patient, type Provider,
} from "@/lib/demoStore";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { isAuthed, t } = useApp();
  const navigate = useNavigate();
  useEffect(() => {
    if (!isAuthed) navigate({ to: "/login" });
  }, [isAuthed, navigate]);

  // ---- Push clinic data snapshot to the backend on every change.
  // This used to live in Dashboard, but the agent needs current data
  // even when the user is on /patients or /calendar (otherwise it
  // suggests already-booked slots). Lifting to the layout means the
  // push fires from the moment the user logs in, on every change.
  const { items: patients,    setAll: setPatients }     = useDemoCollection<Patient>("patients", SEED_PATIENTS);
  const { items: appointments, setAll: setAppointments } = useDemoCollection<Appointment>("appointments", getSeedAppointments);
  const { items: clinics }      = useDemoCollection<Department>("departments", SEED_DEPARTMENTS);
  const { items: providers }    = useDemoCollection<Provider>("providers", SEED_PROVIDERS);
  const { items: overrides }    = useDemoCollection<ClinicSlotOverride>("slot_overrides", SEED_SLOT_OVERRIDES);
  const { setAll: setActivity } = useDemoCollection<AgentActivity>("agent_activity", SEED_AGENT_ACTIVITY);
  useEffect(() => {
    if (!isAuthed) return;
    fetch("/api/demo/clinic/data/snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patients, appointments, clinics, providers, slot_overrides: overrides,
      }),
    }).catch(() => { /* backend offline — retried on next change */ });
  }, [isAuthed, patients, appointments, clinics, providers, overrides]);

  // ---- Drain agent tool_mutation events on EVERY page.
  // Used to live in Dashboard only — meant that a cancel /
  // reschedule the agent did while the user was on Patients or
  // Calendar wouldn't reach localStorage until the user navigated
  // back to Dashboard (and worse, the snapshot push above could
  // overwrite the backend's cancelled state with stale data in the
  // gap). Running it at the layout level closes both holes.
  const live = useLiveAgentStore();
  useEffect(() => {
    if (!isAuthed) return;
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
      } else if (ev.kind === "appointment_cancelled" && ev.appointment) {
        const apt = ev.appointment;
        setAppointments((prev) =>
          prev.map((a) => (a.id === apt.id ? { ...a, ...apt } : a)),
        );
        setActivity((prev) => [{
          id:             nextId("LAE", prev),
          ts:             new Date().toISOString(),
          call_id:        ev.call_id,
          caller_name:    apt.patient_name || "Unknown",
          caller_phone:   apt.patient_phone || "",
          action:         "cancel_appointment",
          summary:        `Cancelled appointment ${apt.id} (was ${apt.scheduled_at?.slice(0, 16).replace("T", " ")})`,
          summary_ar:     `ألغى الموعد ${apt.id} (كان ${apt.scheduled_at?.slice(0, 16).replace("T", " ")})`,
          patient_id:     null,
          appointment_id: apt.id,
        }, ...prev]);
      } else if (ev.kind === "appointment_rescheduled" && ev.appointment) {
        const apt = ev.appointment;
        const prevAt = ev.previous_scheduled_at;
        setAppointments((prev) =>
          prev.map((a) => (a.id === apt.id ? { ...a, ...apt } : a)),
        );
        setActivity((prev) => [{
          id:             nextId("LAE", prev),
          ts:             new Date().toISOString(),
          call_id:        ev.call_id,
          caller_name:    apt.patient_name || "Unknown",
          caller_phone:   apt.patient_phone || "",
          action:         "reschedule_appointment",
          summary:        `Rescheduled ${apt.id}: ${prevAt?.slice(0, 16).replace("T", " ") ?? "?"} → ${apt.scheduled_at?.slice(0, 16).replace("T", " ")}`,
          summary_ar:     `أعاد جدولة ${apt.id}: ${prevAt?.slice(0, 16).replace("T", " ") ?? "؟"} → ${apt.scheduled_at?.slice(0, 16).replace("T", " ")}`,
          patient_id:     null,
          appointment_id: apt.id,
        }, ...prev]);
      }
      consumeMutation(ev);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, live.recentMutations]);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b border-border bg-card/60 px-4 backdrop-blur">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <span className="text-sm font-medium text-foreground">{t("appName")}</span>
            </div>
            <BrandToggles />
          </header>
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}