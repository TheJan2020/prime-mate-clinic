import { useEffect, useMemo, useState } from "react";
import { Calendar, Ban, Sparkles, CalendarDays, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useApp } from "@/lib/i18n";
import {
  bookedSlotsForDate,
  DEFAULT_WORKING_HOURS, isBreakSlot, localized, slotsForDay,
  weekDates, weekdayOf,
  type Appointment, type ClinicSlotOverride, type DayHours,
  type Department,
} from "@/lib/demoStore";

interface Props {
  /** Department being edited, or null when closed. */
  department: Department | null;
  /** Snapshot of all overrides for this department (parent owns the array). */
  overrides: ClinicSlotOverride[];
  /** Full appointments list — used to mark already-booked slots as
   * non-blockable. */
  appointments: Appointment[];
  onClose: () => void;
  /** Called with the updated default hours + the new override list for *this
   * department's current week*. Parent merges with the global overrides
   * collection (preserving overrides for other departments / past weeks). */
  onSave: (
    nextHours: DayHours[],
    weekOverrides: { date: string; blocked_slots: string[] }[],
  ) => void;
}

const DAY_KEYS = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
] as const;

export function ScheduleDialog({ department, overrides, appointments, onClose, onSave }: Props) {
  const { t, lang } = useApp();
  const open = department !== null;

  // Local working copies — only flushed back on Save.
  const [hours, setHours] = useState<DayHours[]>(DEFAULT_WORKING_HOURS);
  // Map<date YYYY-MM-DD, Set<slot HH:MM>> for the week being edited.
  const [weekBlocks, setWeekBlocks] = useState<Map<string, Set<string>>>(new Map());

  // The week we're showing in the "This week" tab — always anchored on today.
  const weekYmds = useMemo(() => weekDates(new Date()), []);
  const todayYmd = useMemo(() => {
    const d = new Date();
    return weekYmds.find((y) => weekdayOf(y) === d.getDay()) ?? weekYmds[0];
  }, [weekYmds]);

  // Initialize from the department + overrides whenever the dialog opens.
  useEffect(() => {
    if (!department) return;
    setHours(
      department.working_hours?.map((h) => ({ ...h }))
        ?? DEFAULT_WORKING_HOURS.map((h) => ({ ...h })),
    );
    const next = new Map<string, Set<string>>();
    for (const d of weekYmds) next.set(d, new Set());
    for (const o of overrides) {
      if (o.department_id !== department.id) continue;
      if (!weekYmds.includes(o.date)) continue;
      next.set(o.date, new Set(o.blocked_slots));
    }
    setWeekBlocks(next);
  }, [department, overrides, weekYmds]);

  if (!department) return null;

  const updateDay = (idx: number, patch: Partial<DayHours>) => {
    setHours((prev) => prev.map((h, i) => (i === idx ? { ...h, ...patch } : h)));
  };

  const copyDayToAllOpen = (idx: number) => {
    const src = hours[idx];
    setHours((prev) => prev.map((h) => (h.open ? { ...src, open: true } : h)));
  };

  const toggleSlot = (date: string, slot: string) => {
    setWeekBlocks((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(date) ?? []);
      if (set.has(slot)) set.delete(slot);
      else set.add(slot);
      next.set(date, set);
      return next;
    });
  };

  const blockAllForDate = (date: string) => {
    if (!department) return;
    const day = hours[weekdayOf(date)];
    const slots = slotsForDay(day);
    const booked = bookedSlotsForDate(appointments, date, department.id);
    setWeekBlocks((prev) => {
      const next = new Map(prev);
      next.set(
        date,
        new Set(slots.filter((s) => !isBreakSlot(s, day) && !booked.has(s))),
      );
      return next;
    });
  };

  const clearBlocksForDate = (date: string) => {
    setWeekBlocks((prev) => {
      const next = new Map(prev);
      next.set(date, new Set());
      return next;
    });
  };

  const handleSave = () => {
    const out: { date: string; blocked_slots: string[] }[] = [];
    for (const [date, set] of weekBlocks.entries()) {
      out.push({ date, blocked_slots: Array.from(set).sort() });
    }
    onSave(hours, out);
  };

  const totalBlocked = Array.from(weekBlocks.values())
    .reduce((sum, set) => sum + set.size, 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t("manageSchedule")} — {localized(department.name, department.name_ar, lang)}
          </DialogTitle>
          <DialogDescription>
            {t("defaultScheduleHint")}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="default" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="default" className="gap-2">
              <CalendarDays className="h-4 w-4" />
              {t("defaultSchedule")}
            </TabsTrigger>
            <TabsTrigger value="week" className="gap-2">
              <Sparkles className="h-4 w-4" />
              {t("thisWeek")}
              {totalBlocked > 0 && (
                <span className="ms-1 inline-flex items-center rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-medium text-destructive">
                  {t("slotsBlockedShort").replace("{n}", String(totalBlocked))}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ----- Default schedule tab ------------------------------------ */}
          <TabsContent value="default" className="mt-4 space-y-2">
            {hours.map((day, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-border bg-card/50 p-3"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex w-28 items-center gap-2">
                    <Switch
                      checked={day.open}
                      onCheckedChange={(v) => updateDay(idx, { open: v })}
                    />
                    <span className="text-sm font-medium">{t(DAY_KEYS[idx])}</span>
                  </div>
                  {day.open ? (
                    <>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs uppercase text-muted-foreground">{t("openHours")}</Label>
                        <Input
                          type="time"
                          value={day.open_time}
                          onChange={(e) => updateDay(idx, { open_time: e.target.value })}
                          className="w-[110px]"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs uppercase text-muted-foreground">{t("closeHours")}</Label>
                        <Input
                          type="time"
                          value={day.close_time}
                          onChange={(e) => updateDay(idx, { close_time: e.target.value })}
                          className="w-[110px]"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={day.break_enabled}
                          onCheckedChange={(v) => updateDay(idx, { break_enabled: v })}
                        />
                        <span className="text-xs uppercase text-muted-foreground">{t("breakTime")}</span>
                        {day.break_enabled && (
                          <>
                            <Input
                              type="time"
                              value={day.break_start}
                              onChange={(e) => updateDay(idx, { break_start: e.target.value })}
                              className="w-[110px]"
                            />
                            <span className="text-muted-foreground">—</span>
                            <Input
                              type="time"
                              value={day.break_end}
                              onChange={(e) => updateDay(idx, { break_end: e.target.value })}
                              className="w-[110px]"
                            />
                          </>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ms-auto gap-1"
                        onClick={() => copyDayToAllOpen(idx)}
                        title={t("copyToAllOpen")}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        <span className="text-xs">{t("copyToAllOpen")}</span>
                      </Button>
                    </>
                  ) : (
                    <span className="text-sm italic text-muted-foreground">{t("closedAllDay")}</span>
                  )}
                </div>
              </div>
            ))}
          </TabsContent>

          {/* ----- This week tab ------------------------------------------- */}
          <TabsContent value="week" className="mt-4">
            <p className="mb-3 text-xs text-muted-foreground">{t("thisWeekHint")}</p>
            <div className="grid grid-cols-7 gap-2">
              {weekYmds.map((date) => {
                const idx = weekdayOf(date);
                const day = hours[idx];
                const slots = slotsForDay(day);
                const blocks = weekBlocks.get(date) ?? new Set();
                const booked = bookedSlotsForDate(appointments, date, department.id);
                const isPast = date < todayYmd;
                const isToday = date === todayYmd;
                return (
                  <div
                    key={date}
                    className={`rounded-lg border ${
                      isToday ? "border-primary" : "border-border"
                    } bg-card/40 p-2`}
                  >
                    <div className="mb-2 text-center">
                      <div className={`text-xs font-medium ${isToday ? "text-primary" : "text-foreground"}`}>
                        {t(DAY_KEYS[idx])}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {dateToShort(date, lang)}
                      </div>
                    </div>
                    {!day.open && (
                      <div className="rounded bg-muted/50 px-1 py-1 text-center text-[10px] text-muted-foreground">
                        {t("closedAllDay")}
                      </div>
                    )}
                    {day.open && (
                      <>
                        <div className="flex flex-col gap-0.5">
                          {slots.map((slot) => {
                            const isBreak = isBreakSlot(slot, day);
                            const isBooked = booked.has(slot);
                            const isBlocked = blocks.has(slot);
                            // Booked overrides Blocked visually — a real
                            // appointment is more important than an intent
                            // to block. Booked slots can never be toggled.
                            const disabled = isPast || isBreak || isBooked;
                            const base = "rounded px-1 py-0.5 text-[10px] font-mono text-center transition-colors";
                            let cls: string;
                            let title: string;
                            if (isBreak) {
                              cls = `${base} bg-muted/40 text-muted-foreground`;
                              title = t("breakSlot");
                            } else if (isBooked) {
                              cls = `${base} bg-sky-500/80 text-white cursor-not-allowed`;
                              title = t("booked");
                            } else if (isBlocked) {
                              cls = `${base} bg-destructive/80 text-destructive-foreground line-through`;
                              title = t("blocked");
                            } else if (isPast) {
                              cls = `${base} bg-muted/30 text-muted-foreground`;
                              title = t("available");
                            } else {
                              cls = `${base} bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-400 cursor-pointer`;
                              title = t("available");
                            }
                            return (
                              <button
                                key={slot}
                                disabled={disabled}
                                onClick={() => !disabled && toggleSlot(date, slot)}
                                className={cls}
                                title={title}
                              >
                                {slot}
                              </button>
                            );
                          })}
                        </div>
                        {!isPast && (
                          <div className="mt-2 flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 flex-1 px-1 text-[10px]"
                              onClick={() => blockAllForDate(date)}
                              title={t("blockAll")}
                            >
                              <Ban className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 flex-1 px-1 text-[10px]"
                              onClick={() => clearBlocksForDate(date)}
                              disabled={blocks.size === 0}
                              title={t("clearBlocks")}
                            >
                              {t("clearBlocks")}
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button onClick={handleSave}>{t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function dateToShort(ymd: string, lang: "en" | "ar"): string {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(lang === "ar" ? "ar-EG" : undefined, {
    month: "short", day: "numeric",
  });
}
