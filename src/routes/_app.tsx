import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BrandToggles } from "@/components/BrandToggles";
import { useApp } from "@/lib/i18n";
import {
  SEED_DEPARTMENTS, SEED_PATIENTS, SEED_PROVIDERS, SEED_SLOT_OVERRIDES,
  getSeedAppointments, useDemoCollection,
  type Appointment, type ClinicSlotOverride, type Department,
  type Patient, type Provider,
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
  const { items: patients }     = useDemoCollection<Patient>("patients", SEED_PATIENTS);
  const { items: appointments } = useDemoCollection<Appointment>("appointments", getSeedAppointments);
  const { items: clinics }      = useDemoCollection<Department>("departments", SEED_DEPARTMENTS);
  const { items: providers }    = useDemoCollection<Provider>("providers", SEED_PROVIDERS);
  const { items: overrides }    = useDemoCollection<ClinicSlotOverride>("slot_overrides", SEED_SLOT_OVERRIDES);
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