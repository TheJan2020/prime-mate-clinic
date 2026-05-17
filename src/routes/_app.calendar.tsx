import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CalendarRange, ChevronLeft, ChevronRight, Stethoscope,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/lib/i18n";
import {
  SEED_DEPARTMENTS, SEED_PROVIDERS, SEED_SLOT_OVERRIDES,
  DEFAULT_WORKING_HOURS, SLOT_MINUTES,
  bookedSlotsForDate, getSeedAppointments, isBreakSlot, localized,
  minutesToTime, timeToMinutes,
  useDemoCollection, weekDates, weekdayOf,
  type Appointment, type ClinicSlotOverride, type Department, type Provider,
} from "@/lib/demoStore";

export const Route = createFileRoute("/_app/calendar")({
  component: CalendarPage,
});

const DAY_KEYS = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
] as const;

function CalendarPage() {
  const { t, lang } = useApp();
  const { items: appointments } =
    useDemoCollection<Appointment>("appointments", getSeedAppointments);
  const { items: departments } =
    useDemoCollection<Department>("departments", SEED_DEPARTMENTS);
  const { items: providers } =
    useDemoCollection<Provider>("providers", SEED_PROVIDERS);
  const { items: overrides } =
    useDemoCollection<ClinicSlotOverride>("slot_overrides", SEED_SLOT_OVERRIDES);

  const [selectedDeptId, setSelectedDeptId] = useState<string>(departments[0]?.id ?? "");
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });

  const dept = useMemo(
    () => departments.find((d) => d.id === selectedDeptId) ?? null,
    [departments, selectedDeptId],
  );

  const providerById = useMemo(() => {
    const map = new Map<string, Provider>();
    for (const p of providers) map.set(p.id, p);
    return map;
  }, [providers]);

  const weekYmds = useMemo(() => weekDates(weekAnchor), [weekAnchor]);
  const todayYmd = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }, []);

  // Compute the time range to render: smallest open across the week →
  // largest close. If clinic is closed every day in the week, fall back
  // to 09:00–17:00 so we still draw a grid.
  const { firstMin, lastMin } = useMemo(() => {
    if (!dept) return { firstMin: 9 * 60, lastMin: 17 * 60 };
    let lo = Infinity, hi = -Infinity;
    for (const ymd of weekYmds) {
      const day = (dept.working_hours ?? DEFAULT_WORKING_HOURS)[weekdayOf(ymd)];
      if (!day.open) continue;
      lo = Math.min(lo, timeToMinutes(day.open_time));
      hi = Math.max(hi, timeToMinutes(day.close_time));
    }
    return {
      firstMin: lo === Infinity ? 9 * 60 : lo,
      lastMin:  hi === -Infinity ? 17 * 60 : hi,
    };
  }, [dept, weekYmds]);

  const slotRows = useMemo(() => {
    const rows: string[] = [];
    for (let m = firstMin; m + SLOT_MINUTES <= lastMin; m += SLOT_MINUTES) {
      rows.push(minutesToTime(m));
    }
    return rows;
  }, [firstMin, lastMin]);

  // For each booked slot, look up the appointment that owns the *start* of
  // that occupancy so we can show patient name on the leading cell only
  // (subsequent cells of a multi-slot appointment render as plain "booked").
  const apptStartByCell = useMemo(() => {
    const map = new Map<string, Appointment>(); // key = `${ymd}|${HH:MM}`
    for (const a of appointments) {
      if (!dept || a.department_id !== dept.id) continue;
      const ymd = a.scheduled_at.slice(0, 10);
      if (!weekYmds.includes(ymd)) continue;
      // Snap to the slot the start time falls in.
      const startMin = timeToMinutes(a.scheduled_at.slice(11, 16));
      const snapped = Math.floor(startMin / SLOT_MINUTES) * SLOT_MINUTES;
      map.set(`${ymd}|${minutesToTime(snapped)}`, a);
    }
    return map;
  }, [appointments, dept, weekYmds]);

  // Pre-compute, per day, the (booked / blocked / break / past) state of each
  // slot — saves doing the lookup in the render loop's tight cell pass.
  const dayState = useMemo(() => {
    const out = new Map<string, {
      open: boolean;
      openMin: number;
      closeMin: number;
      booked: Set<string>;
      blocked: Set<string>;
    }>();
    if (!dept) return out;
    for (const ymd of weekYmds) {
      const day = (dept.working_hours ?? DEFAULT_WORKING_HOURS)[weekdayOf(ymd)];
      const booked = bookedSlotsForDate(appointments, ymd, dept.id);
      const blocked = new Set(
        overrides
          .filter((o) => o.department_id === dept.id && o.date === ymd)
          .flatMap((o) => o.blocked_slots),
      );
      out.set(ymd, {
        open: day.open,
        openMin: timeToMinutes(day.open_time),
        closeMin: timeToMinutes(day.close_time),
        booked,
        blocked,
      });
    }
    return out;
  }, [dept, weekYmds, appointments, overrides]);

  const shiftWeek = (delta: number) => {
    const next = new Date(weekAnchor);
    next.setDate(weekAnchor.getDate() + delta * 7);
    setWeekAnchor(next);
  };

  const counts = useMemo(() => {
    let booked = 0, blocked = 0;
    for (const ymd of weekYmds) {
      const s = dayState.get(ymd);
      if (!s) continue;
      booked += s.booked.size;
      blocked += s.blocked.size;
    }
    return { booked, blocked };
  }, [dayState, weekYmds]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("calendar")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("calendarDesc")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedDeptId} onValueChange={setSelectedDeptId}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder={t("selectClinic")} />
            </SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {localized(d.name, d.name_ar, lang)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" onClick={() => shiftWeek(-1)} aria-label={t("prevWeek")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => setWeekAnchor(new Date())}
              className="h-9"
            >
              {t("today")}
            </Button>
            <Button size="icon" variant="outline" onClick={() => shiftWeek(1)} aria-label={t("nextWeek")}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {dept && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Stethoscope className="h-4 w-4" />
            {localized(dept.name, dept.name_ar, lang)}
          </span>
          <span>·</span>
          <span>{localized(dept.location, dept.location_ar, lang)}</span>
          <span>·</span>
          <span>
            {counts.booked} {t("booked").toLowerCase()}
            {counts.blocked > 0 ? ` · ${counts.blocked} ${t("blockedShort").toLowerCase()}` : ""}
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-xs">
            <thead className="bg-muted/30">
              <tr>
                <th className="w-16 px-2 py-2 text-start font-medium text-muted-foreground" />
                {weekYmds.map((ymd) => {
                  const isToday = ymd === todayYmd;
                  return (
                    <th
                      key={ymd}
                      className={`border-s border-border px-2 py-2 text-center font-medium ${
                        isToday ? "bg-primary/10 text-primary" : "text-foreground"
                      }`}
                    >
                      <div>{t(DAY_KEYS[weekdayOf(ymd)])}</div>
                      <div className={`text-[10px] ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                        {dateToShort(ymd, lang)}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {slotRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    {t("closedThatDay")}
                  </td>
                </tr>
              )}
              {slotRows.map((slot) => (
                <tr key={slot} className="h-9">
                  <td className="px-2 py-1 text-end font-mono text-[11px] text-muted-foreground">
                    {slot}
                  </td>
                  {weekYmds.map((ymd) => {
                    const s = dayState.get(ymd);
                    if (!s || !s.open) {
                      return <td key={ymd} className="border-s border-border bg-muted/20" />;
                    }
                    const slotMin = timeToMinutes(slot);
                    // Outside this day's open window? Render as closed-tinted.
                    if (slotMin < s.openMin || slotMin >= s.closeMin) {
                      return <td key={ymd} className="border-s border-border bg-muted/30" />;
                    }
                    const day = (dept!.working_hours ?? DEFAULT_WORKING_HOURS)[weekdayOf(ymd)];
                    if (isBreakSlot(slot, day)) {
                      return (
                        <td key={ymd} className="border-s border-border bg-amber-500/15 text-center align-middle text-[10px] text-amber-700 dark:text-amber-300">
                          {t("breakShort")}
                        </td>
                      );
                    }
                    if (s.blocked.has(slot)) {
                      return (
                        <td key={ymd} className="border-s border-border bg-destructive/20 text-center align-middle text-[10px] text-destructive">
                          {t("blockedShort")}
                        </td>
                      );
                    }
                    const startAppt = apptStartByCell.get(`${ymd}|${slot}`);
                    if (startAppt) {
                      const provider = startAppt.provider_id
                        ? providerById.get(startAppt.provider_id) : null;
                      return (
                        <td
                          key={ymd}
                          className="border-s border-border bg-sky-500/15 align-top p-1.5"
                          title={`${localized(startAppt.patient_name, startAppt.patient_name_ar, lang)} · ${startAppt.patient_phone}`}
                        >
                          <div className="line-clamp-1 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                            {localized(startAppt.patient_name, startAppt.patient_name_ar, lang)}
                          </div>
                          {provider && (
                            <div className="line-clamp-1 text-[10px] text-sky-600/80 dark:text-sky-400/80">
                              {localized(provider.name, provider.name_ar, lang)}
                            </div>
                          )}
                        </td>
                      );
                    }
                    if (s.booked.has(slot)) {
                      // Continuation cell of a multi-slot appointment.
                      return (
                        <td key={ymd} className="border-s border-border bg-sky-500/15" />
                      );
                    }
                    return (
                      <td key={ymd} className="border-s border-border" />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span>{t("legend")}:</span>
        <LegendChip cls="bg-sky-500/15 text-sky-700 dark:text-sky-300">{t("bookedShort")}</LegendChip>
        <LegendChip cls="bg-destructive/20 text-destructive">{t("blockedShort")}</LegendChip>
        <LegendChip cls="bg-amber-500/15 text-amber-700 dark:text-amber-300">{t("breakShort")}</LegendChip>
        <LegendChip cls="bg-muted/30 text-muted-foreground">{t("closed")}</LegendChip>
      </div>
    </div>
  );
}

function dateToShort(ymd: string, lang: "en" | "ar"): string {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(lang === "ar" ? "ar-EG" : undefined, {
    month: "short", day: "numeric",
  });
}

function LegendChip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 ${cls}`}>{children}</span>
  );
}
