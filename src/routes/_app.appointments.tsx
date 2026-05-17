import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CalendarDays, Plus, Pencil, Trash2, RotateCcw, ChevronLeft,
  ChevronRight, CalendarClock, CheckCircle2, XCircle, UserX2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/lib/i18n";
import {
  SEED_DEPARTMENTS, SEED_PROVIDERS, SEED_PATIENTS, SEED_SLOT_OVERRIDES,
  getSeedAppointments,
  useDemoCollection, nextId, localized,
  DEFAULT_WORKING_HOURS, slotsForDay, isBreakSlot, weekdayOf,
  bookedSlotsForDate, timeToMinutes,
  type Appointment, type AppointmentStatus,
  type Department, type Provider, type Patient, type ClinicSlotOverride,
} from "@/lib/demoStore";

export const Route = createFileRoute("/_app/appointments")({
  component: AppointmentsPage,
});

// "Today" anchor — recomputed lazily so the user can scroll back to it.
function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoToYmd(iso: string): string {
  return iso.slice(0, 10);
}

function ymdToHuman(ymd: string, lang: "en" | "ar"): string {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(lang === "ar" ? "ar-EG" : undefined, {
    weekday: "short", year: "numeric", month: "short", day: "numeric",
  });
}

const STATUS_ORDER: AppointmentStatus[] = ["scheduled", "completed", "cancelled", "no_show"];

function AppointmentsPage() {
  const { t, lang } = useApp();
  const { items, setAll, reset } =
    useDemoCollection<Appointment>("appointments", getSeedAppointments);
  const { items: departments } =
    useDemoCollection<Department>("departments", SEED_DEPARTMENTS);
  const { items: providers } =
    useDemoCollection<Provider>("providers", SEED_PROVIDERS);
  const { items: patients } =
    useDemoCollection<Patient>("patients", SEED_PATIENTS);
  const { items: slotOverrides } =
    useDemoCollection<ClinicSlotOverride>("slot_overrides", SEED_SLOT_OVERRIDES);

  const deptById = useMemo(() => {
    const map = new Map<string, Department>();
    for (const d of departments) map.set(d.id, d);
    return map;
  }, [departments]);

  const providerById = useMemo(() => {
    const map = new Map<string, Provider>();
    for (const p of providers) map.set(p.id, p);
    return map;
  }, [providers]);

  // ----- Filters -----------------------------------------------------------
  // Default to Today (the brief).
  const [filterDay, setFilterDay] = useState<string>(() => todayYmd());
  // "all" means no date filter; otherwise filterDay is the YMD shown.
  const [scope, setScope] = useState<"today" | "day" | "all" | "upcoming" | "past">("today");
  const [statusFilter, setStatusFilter] = useState<"all" | AppointmentStatus>("all");

  const filtered = useMemo(() => {
    const today = todayYmd();
    return items.filter((a) => {
      const day = isoToYmd(a.scheduled_at);
      if (scope === "today" && day !== today) return false;
      if (scope === "day" && day !== filterDay) return false;
      if (scope === "upcoming" && day < today) return false;
      if (scope === "past" && day >= today) return false;
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      return true;
    });
  }, [items, scope, filterDay, statusFilter]);

  // Counters: status breakdown over the *currently visible* slice.
  const counts = useMemo(() => {
    const out: Record<AppointmentStatus, number> = {
      scheduled: 0, completed: 0, cancelled: 0, no_show: 0,
    };
    for (const a of filtered) out[a.status]++;
    return out;
  }, [filtered]);

  const [editing, setEditing] = useState<Appointment | null>(null);
  const [draft, setDraft] = useState<Appointment | null>(null);
  const [deleting, setDeleting] = useState<Appointment | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const openAdd = () => {
    // Default new appointments to today's 10:00 local.
    const at = new Date();
    at.setHours(10, 0, 0, 0);
    const blank: Appointment = {
      id: nextId("APT", items),
      patient_id: null,
      patient_name: "",
      patient_name_ar: "",
      patient_phone: "",
      department_id: departments[0]?.id ?? null,
      provider_id: providers.find((p) => p.role === "doctor")?.id ?? null,
      scheduled_at: at.toISOString(),
      duration_min: 30,
      status: "scheduled",
      notes: "",
    };
    setEditing(blank);
    setDraft(blank);
  };

  const openEdit = (a: Appointment) => {
    setEditing(a);
    setDraft({ ...a });
  };

  const saveDraft = () => {
    if (!draft) return;
    const exists = items.some((x) => x.id === draft.id);
    if (exists) setAll(items.map((x) => (x.id === draft.id ? draft : x)));
    else setAll([...items, draft]);
    setEditing(null);
    setDraft(null);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    setAll(items.filter((x) => x.id !== deleting.id));
    setDeleting(null);
  };

  // Day stepper used when scope is "day" (or upgrades "today" → "day").
  const shiftDay = (delta: number) => {
    const [y, m, d] = filterDay.split("-").map((n) => parseInt(n, 10));
    const next = new Date(y, m - 1, d + delta);
    const yy = next.getFullYear();
    const mm = String(next.getMonth() + 1).padStart(2, "0");
    const dd = String(next.getDate()).padStart(2, "0");
    setFilterDay(`${yy}-${mm}-${dd}`);
    setScope("day");
  };

  const jumpToToday = () => {
    setFilterDay(todayYmd());
    setScope("today");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("appointments")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("appointmentsDesc")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setResetOpen(true)}>
            <RotateCcw className="me-2 h-4 w-4" />
            {t("resetData")}
          </Button>
          <Button onClick={openAdd}>
            <Plus className="me-2 h-4 w-4" />
            {t("addAppointment")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={<CalendarClock className="h-4 w-4" />} label={t("scheduled")} value={counts.scheduled} accent="var(--brand-blue)" />
        <SummaryCard icon={<CheckCircle2 className="h-4 w-4" />}  label={t("completed")} value={counts.completed} accent="var(--brand-cyan)" />
        <SummaryCard icon={<XCircle className="h-4 w-4" />}       label={t("cancelled")} value={counts.cancelled} accent="var(--brand-purple)" />
        <SummaryCard icon={<UserX2 className="h-4 w-4" />}        label={t("noShow")}    value={counts.no_show}   accent="var(--brand-blue)" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-md"
              style={{
                background: "color-mix(in srgb, var(--brand-cyan) 18%, transparent)",
                color: "var(--brand-cyan)",
              }}
            >
              <CalendarDays className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-semibold text-card-foreground">{t("appointments")}</h2>
            <span className="ms-2 text-xs text-muted-foreground">
              {t("showingOf").replace("{filtered}", String(filtered.length)).replace("{total}", String(items.length))}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
              <FilterPill active={scope === "today"} onClick={jumpToToday}>{t("today")}</FilterPill>
              <FilterPill active={scope === "upcoming"} onClick={() => setScope("upcoming")}>{t("upcoming")}</FilterPill>
              <FilterPill active={scope === "past"} onClick={() => setScope("past")}>{t("past")}</FilterPill>
              <FilterPill active={scope === "all"} onClick={() => setScope("all")}>{t("all")}</FilterPill>
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" onClick={() => shiftDay(-1)} aria-label="Previous day">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                type="date"
                value={filterDay}
                onChange={(e) => { setFilterDay(e.target.value); setScope("day"); }}
                className="w-[148px]"
              />
              <Button size="icon" variant="ghost" onClick={() => shiftDay(1)} aria-label="Next day">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Select value={statusFilter} onValueChange={(v: "all" | AppointmentStatus) => setStatusFilter(v)}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder={t("filterStatus")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all")}</SelectItem>
                {STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>{statusLabel(s, t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {scope === "today" && (
          <div className="px-5 py-2 text-xs text-muted-foreground">
            {ymdToHuman(todayYmd(), lang)}
          </div>
        )}
        {scope === "day" && (
          <div className="px-5 py-2 text-xs text-muted-foreground">
            {ymdToHuman(filterDay, lang)}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-start">ID</th>
                <th className="px-4 py-2 text-start">{t("dateTime")}</th>
                <th className="px-4 py-2 text-start">{t("patient")}</th>
                <th className="px-4 py-2 text-start">{t("clinic")}</th>
                <th className="px-4 py-2 text-start">{t("provider")}</th>
                <th className="px-4 py-2 text-start">{t("durationMin")}</th>
                <th className="px-4 py-2 text-start">{t("status")}</th>
                <th className="px-4 py-2 text-end">{t("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">{t("noResults")}</td></tr>
              )}
              {filtered.map((a) => {
                const dept = a.department_id ? deptById.get(a.department_id) : null;
                const provider = a.provider_id ? providerById.get(a.provider_id) : null;
                const at = new Date(a.scheduled_at);
                const time = at.toLocaleTimeString(lang === "ar" ? "ar-EG" : undefined, {
                  hour: "2-digit", minute: "2-digit",
                });
                const day = at.toLocaleDateString(lang === "ar" ? "ar-EG" : undefined, {
                  month: "short", day: "numeric",
                });
                return (
                  <tr key={a.id}>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{a.id}</td>
                    <td className="px-4 py-2">
                      <div className="font-medium text-foreground">{time}</div>
                      <div className="text-xs text-muted-foreground">{day}</div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-medium text-foreground">{localized(a.patient_name, a.patient_name_ar, lang)}</div>
                      <div className="font-mono text-xs text-muted-foreground" dir="ltr">{a.patient_phone}</div>
                    </td>
                    <td className="px-4 py-2">
                      {dept ? (
                        <Link to="/clinics" hash={dept.id} className="font-medium text-primary hover:underline">
                          {localized(dept.name, dept.name_ar, lang)}
                        </Link>
                      ) : (
                        <span className="text-xs italic text-muted-foreground">{t("unassigned")}</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {provider ? (
                        <Link to="/providers" hash={provider.id} className="font-medium text-primary hover:underline">
                          {localized(provider.name, provider.name_ar, lang)}
                        </Link>
                      ) : (
                        <span className="text-xs italic text-muted-foreground">{t("unassigned")}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{a.duration_min}</td>
                    <td className="px-4 py-2"><AppointmentStatusPill status={a.status} /></td>
                    <td className="px-4 py-2 text-end">
                      <div className="inline-flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(a)} aria-label={t("edit")}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleting(a)} aria-label={t("delete")}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) { setEditing(null); setDraft(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{items.some((x) => x.id === draft?.id) ? t("editAppointment") : t("addAppointment")}</DialogTitle>
            <DialogDescription>{t("appointmentsDesc")}</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="ID">
                <Input value={draft.id} disabled />
              </Field>
              <Field label={t("status")}>
                <Select value={draft.status} onValueChange={(v: AppointmentStatus) => setDraft({ ...draft, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_ORDER.map((s) => (
                      <SelectItem key={s} value={s}>{statusLabel(s, t)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("patient")} className="col-span-2">
                <Select
                  value={draft.patient_id ?? "__custom__"}
                  onValueChange={(v) => {
                    if (v === "__custom__") {
                      setDraft({ ...draft, patient_id: null });
                      return;
                    }
                    const p = patients.find((x) => x.id === v);
                    if (!p) return;
                    setDraft({
                      ...draft,
                      patient_id: p.id,
                      patient_name: p.name,
                      patient_name_ar: p.name_ar,
                      patient_phone: p.phone,
                    });
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__custom__">{t("none")} ({t("patientName").toLowerCase()})</SelectItem>
                    {patients.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {localized(p.name, p.name_ar, lang)} <span className="text-muted-foreground">· {p.phone}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("patientName")}>
                <Input value={draft.patient_name} onChange={(e) => setDraft({ ...draft, patient_name: e.target.value, patient_id: null })} />
              </Field>
              <Field label={t("nameAr")}>
                <Input dir="rtl" value={draft.patient_name_ar} onChange={(e) => setDraft({ ...draft, patient_name_ar: e.target.value, patient_id: null })} />
              </Field>
              <Field label={t("patientPhone")} className="col-span-2">
                <Input dir="ltr" value={draft.patient_phone} onChange={(e) => setDraft({ ...draft, patient_phone: e.target.value, patient_id: null })} placeholder="+9665X XXX XXXX" />
              </Field>
              <Field label={t("department")}>
                <Select
                  value={draft.department_id ?? "__none__"}
                  onValueChange={(v) => setDraft({ ...draft, department_id: v === "__none__" ? null : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("none")}</SelectItem>
                    {departments.filter((d) => d.active).map((d) => (
                      <SelectItem key={d.id} value={d.id}>{localized(d.name, d.name_ar, lang)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("provider")}>
                <Select
                  value={draft.provider_id ?? "__none__"}
                  onValueChange={(v) => setDraft({ ...draft, provider_id: v === "__none__" ? null : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("none")}</SelectItem>
                    {providers.filter((p) => p.active).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {localized(p.name, p.name_ar, lang)} <span className="text-muted-foreground">· {localized(p.specialty, p.specialty_ar, lang)}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("filterDate")}>
                <Input
                  type="date"
                  value={draft.scheduled_at.slice(0, 10)}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    // Keep the existing time-of-day if any; otherwise clear it
                    // so the user is forced to pick a slot below.
                    const time = draft.scheduled_at.slice(11, 16) || "00:00";
                    setDraft({ ...draft, scheduled_at: `${e.target.value}T${time}:00` });
                  }}
                />
              </Field>
              <Field label={t("durationMin")}>
                <Input
                  type="number"
                  min={5}
                  step={5}
                  value={draft.duration_min}
                  onChange={(e) => setDraft({ ...draft, duration_min: Math.max(5, parseInt(e.target.value, 10) || 5) })}
                />
              </Field>
              <Field label={t("pickSlot")} className="col-span-2">
                <SlotPicker
                  date={draft.scheduled_at.slice(0, 10)}
                  departmentId={draft.department_id}
                  selectedTime={draft.scheduled_at.slice(11, 16)}
                  appointments={items}
                  overrides={slotOverrides}
                  department={draft.department_id ? deptById.get(draft.department_id) ?? null : null}
                  excludeAppointmentId={items.some((x) => x.id === draft.id) ? draft.id : null}
                  onPick={(time) => {
                    const date = draft.scheduled_at.slice(0, 10);
                    setDraft({ ...draft, scheduled_at: `${date}T${time}:00` });
                  }}
                />
              </Field>
              <Field label={t("notes")} className="col-span-2">
                <Textarea
                  value={draft.notes}
                  rows={3}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setEditing(null); setDraft(null); }}>{t("cancel")}</Button>
            <Button onClick={saveDraft} disabled={!canSaveDraft(draft, items, slotOverrides, departments)}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("resetConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("resetConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { reset(); setResetOpen(false); jumpToToday(); }}>
              {t("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------- helpers --------------------------------------------------------

function statusLabel(s: AppointmentStatus, t: (k: never) => string): string {
  switch (s) {
    case "scheduled": return t("scheduled" as never);
    case "completed": return t("completed" as never);
    case "cancelled": return t("cancelled" as never);
    case "no_show":   return t("noShow" as never);
  }
}

// True only when the draft has a name, a date+time, and the chosen slot
// is currently free (not blocked, not booked by another appointment, not
// in a closed/break slot for that day).
function canSaveDraft(
  draft: Appointment | null,
  items: Appointment[],
  overrides: ClinicSlotOverride[],
  departments: Department[],
): boolean {
  if (!draft) return false;
  if (!draft.patient_name.trim()) return false;
  if (!draft.department_id) return false;
  const date = draft.scheduled_at.slice(0, 10);
  const time = draft.scheduled_at.slice(11, 16);
  if (!date || !time) return false;
  const dept = departments.find((d) => d.id === draft.department_id);
  if (!dept) return false;
  const day = (dept.working_hours ?? DEFAULT_WORKING_HOURS)[weekdayOf(date)];
  if (!day || !day.open) return false;
  if (isBreakSlot(time, day)) return false;
  // Must be within open window.
  const slotMin = timeToMinutes(time);
  const openMin = timeToMinutes(day.open_time);
  const closeMin = timeToMinutes(day.close_time);
  if (slotMin < openMin || slotMin >= closeMin) return false;
  // Not blocked.
  const blocked = overrides
    .filter((o) => o.department_id === draft.department_id && o.date === date)
    .flatMap((o) => o.blocked_slots);
  if (blocked.includes(time)) return false;
  // Not booked by a different appointment.
  const booked = bookedSlotsForDate(items, date, draft.department_id, draft.id);
  if (booked.has(time)) return false;
  return true;
}

// ---------- SlotPicker --------------------------------------------------
// Replaces the free-form datetime input. Shows every 30-min slot in the
// selected department's working hours for the picked date, colored by
// status (free / break / blocked / booked / past / selected). Only free
// slots are clickable.

function SlotPicker({
  date, departmentId, selectedTime, appointments, overrides, department,
  excludeAppointmentId, onPick,
}: {
  date: string;
  departmentId: string | null;
  selectedTime: string;
  appointments: Appointment[];
  overrides: ClinicSlotOverride[];
  department: Department | null;
  excludeAppointmentId: string | null;
  onPick: (time: string) => void;
}) {
  const { t } = useApp();

  if (!departmentId || !department) {
    return <SlotHint>{t("pickDepartmentFirst")}</SlotHint>;
  }
  if (!date) {
    return <SlotHint>{t("pickDateFirst")}</SlotHint>;
  }

  const day = (department.working_hours ?? DEFAULT_WORKING_HOURS)[weekdayOf(date)];
  if (!day || !day.open) {
    return <SlotHint>{t("closedThatDay")}</SlotHint>;
  }

  const slots = slotsForDay(day);
  const booked = bookedSlotsForDate(appointments, date, departmentId, excludeAppointmentId);
  const blocked = new Set(
    overrides
      .filter((o) => o.department_id === departmentId && o.date === date)
      .flatMap((o) => o.blocked_slots),
  );

  const todayYmd = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  })();
  const nowMin = (() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  })();

  const hasFree = slots.some((s) => {
    if (isBreakSlot(s, day)) return false;
    if (booked.has(s) || blocked.has(s)) return false;
    if (date < todayYmd) return false;
    if (date === todayYmd && timeToMinutes(s) < nowMin) return false;
    return true;
  });

  return (
    <div>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
        {slots.map((slot) => {
          const isBreak = isBreakSlot(slot, day);
          const isBooked = booked.has(slot);
          const isBlocked = blocked.has(slot);
          const isPast =
            date < todayYmd ||
            (date === todayYmd && timeToMinutes(slot) < nowMin);
          const isSelected = slot === selectedTime;
          const disabled = isBreak || isBooked || isBlocked || isPast;

          const base = "rounded-md px-2 py-1.5 text-xs font-mono text-center transition-colors border";
          let cls: string;
          let title: string;
          if (isSelected) {
            cls = `${base} border-primary bg-primary text-primary-foreground`;
            title = t("selected");
          } else if (isBreak) {
            cls = `${base} border-transparent bg-muted/40 text-muted-foreground cursor-not-allowed`;
            title = t("breakSlot");
          } else if (isBooked) {
            cls = `${base} border-transparent bg-sky-500/80 text-white cursor-not-allowed`;
            title = t("booked");
          } else if (isBlocked) {
            cls = `${base} border-transparent bg-destructive/80 text-destructive-foreground line-through cursor-not-allowed`;
            title = t("blocked");
          } else if (isPast) {
            cls = `${base} border-transparent bg-muted/30 text-muted-foreground cursor-not-allowed`;
            title = t("past");
          } else {
            cls = `${base} border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400 cursor-pointer`;
            title = t("available");
          }
          return (
            <button
              key={slot}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onPick(slot)}
              className={cls}
              title={title}
            >
              {slot}
            </button>
          );
        })}
      </div>
      {!hasFree && !selectedTime && (
        <SlotHint className="mt-2">{t("noFreeSlots")}</SlotHint>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span>{t("legend")}:</span>
        <SlotLegendChip cls="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40">{t("available")}</SlotLegendChip>
        <SlotLegendChip cls="bg-primary text-primary-foreground">{t("selected")}</SlotLegendChip>
        <SlotLegendChip cls="bg-sky-500/80 text-white">{t("bookedShort")}</SlotLegendChip>
        <SlotLegendChip cls="bg-destructive/80 text-destructive-foreground">{t("blockedShort")}</SlotLegendChip>
        <SlotLegendChip cls="bg-muted/40 text-muted-foreground">{t("breakShort")}</SlotLegendChip>
      </div>
    </div>
  );
}

function SlotHint({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-md border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground ${className}`}>
      {children}
    </div>
  );
}

function SlotLegendChip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 ${cls}`}>{children}</span>
  );
}

function FilterPill({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function SummaryCard({
  icon, label, value, accent,
}: { icon: React.ReactNode; label: string; value: number; accent: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5">
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <div className="mt-3 text-3xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function AppointmentStatusPill({ status }: { status: AppointmentStatus }) {
  const { t } = useApp();
  const cls: Record<AppointmentStatus, string> = {
    scheduled: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    cancelled: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    no_show:   "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls[status]}`}>
      {statusLabel(status, t as (k: never) => string)}
    </span>
  );
}

function Field({
  label, children, className = "",
}: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
