/**
 * Knowledge-base + Persona support for the clinic Live Agent.
 *
 * Both the KB and the Persona pages expose an editable text body that we
 * persist in localStorage. At call time the Live Agent receives that body
 * *plus* an auto-generated "live state" block compiled from the live
 * demoStore data (clinics, providers, appointments, slot overrides) so
 * the agent always answers from current state, never from a snapshot.
 *
 * This file owns:
 *  - useStoredText() — single-string persistent doc with a change event,
 *    so the KB and Persona pages can edit + reset their bodies.
 *  - DEFAULT_KB / DEFAULT_PERSONA — long Riyadh-clinic seed strings the
 *    user can edit (or revert to via Reset).
 *  - buildLiveStateBlock() — renders the dynamic markdown block from
 *    the current store snapshot.
 */
import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_WORKING_HOURS,
  bookedSlotsForDate, isBreakSlot, localized,
  slotsForDay, timeToMinutes, weekDates, weekdayOf,
  type Appointment, type ClinicSlotOverride, type Department, type Provider,
} from "@/lib/demoStore";
import type { Lang } from "@/lib/i18n";

const TEXT_PREFIX = "pwdemo:clinic:doc";
const TEXT_VERSION = 1;
const CHANGE_EVENT = "pwdemo:clinic:doc-change";

function textStorageKey(key: string) {
  return `${TEXT_PREFIX}:${key}:v${TEXT_VERSION}`;
}

/** Persistent single-string document. Mirrors useDemoCollection's shape
 * (items / setAll / reset) but for one string value. */
export function useStoredText(key: string, defaultValue: string): {
  value: string;
  set: (next: string) => void;
  reset: () => void;
} {
  const [value, setValue] = useState<string>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      return localStorage.getItem(textStorageKey(key)) ?? defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key?: string } | undefined;
      if (detail?.key !== key) return;
      try {
        const v = localStorage.getItem(textStorageKey(key));
        if (v !== null) setValue(v);
      } catch { /* ignore */ }
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, [key]);

  const set = useCallback((next: string) => {
    setValue(next);
    try { localStorage.setItem(textStorageKey(key), next); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { key } }));
  }, [key]);

  const reset = useCallback(() => {
    setValue(defaultValue);
    try { localStorage.removeItem(textStorageKey(key)); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { key } }));
  }, [key, defaultValue]);

  return { value, set, reset };
}

// ============================================================================
// Seed strings — long enough to feel real on a demo, edit-friendly.
// ============================================================================

export const DEFAULT_KB = `# Primewave Mate Clinics — Riyadh

## About us
Primewave Mate Clinics is a multi-specialty outpatient center in the heart
of Riyadh's Olaya district. We've served the Riyadh community since 2018
with same-day appointments, multilingual staff (Arabic, English, Urdu),
and a single integrated medical record across all clinics in the building.

نحن مركز عيادات متعدد التخصصات في حي العليا بالرياض. نقدّم مواعيد في نفس اليوم،
طاقم متعدد اللغات، وسجل طبي موحّد لجميع العيادات داخل المركز.

## Location & contact
- Main Center: Olaya Street, Olaya, Riyadh 12244, KSA
- Reception: +966 11 234 5678
- WhatsApp: +966 50 111 0000
- Email: hello@primemate.clinic
- Maps: search "Primewave Mate Clinics Olaya".

## Operating hours (default — see live state for today)
- Sunday – Thursday: 09:00 – 17:00 (lunch break 13:00 – 14:00)
- Saturday: 09:00 – 13:00 (morning only)
- Friday: closed
- During Ramadan & official holidays hours may shift; agent should always
  defer to the live state below.

## Insurance & payment
Accepted insurance: BUPA Arabia · Tawuniya · MedGulf · AXA · Globemed.
Also: cash, mada, Visa, Mastercard, Apple Pay.
- Pre-approval required for procedures over SAR 1,000.
- Insurance verification takes ~5 minutes at reception.

## Booking & cancellation policy
- Appointments can be booked up to 30 days in advance.
- Walk-ins accepted subject to availability; booking ahead avoids waiting.
- Free cancellation if at least 4 hours before the slot.
- Inside 4 hours: SAR 100 late-cancellation fee.
- Arriving more than 15 minutes late may forfeit the slot.

## Services & pricing (typical)
- General consultation: SAR 350
- Specialist consultation: SAR 500
- Pediatric consultation: SAR 400
- Dental check-up + cleaning: SAR 450
- X-ray (single view): SAR 200
- Basic ultrasound: SAR 350
- Same-day labs, basic imaging on-site (X-ray, ultrasound).
- Telemedicine follow-ups for established patients.
- Home visits within a 10 km radius (extra SAR 250 fee).

## Languages
Arabic, English, Urdu, Tagalog.

## Common FAQs
- "Do you take walk-ins?" — Yes, but booked patients are seen first.
- "Do I need a referral?" — No, you can book a specialist directly.
- "Do you treat children under 1?" — Yes, in Pediatrics (Al Noor).
- "Can I get a sick note?" — Yes, issued at the end of the visit.
- "Parking?" — Free underground parking, entrance B.
`;

export const DEFAULT_PERSONA = `# Layla — Receptionist persona for Primewave Mate Clinics

You are **Layla** (ليلى), the AI receptionist for Primewave Mate Clinics in
Riyadh. You answer phone calls and route them politely and efficiently.

## Voice & tone
- Warm, professional, and concise. Never robotic.
- Use the caller's first name after they share it. Apply honorifics
  ("استاذ" / "أستاذة" / "Mr." / "Ms." / "Dr.") when appropriate.
- Sentences short. One question at a time.

## Arabic gender — default to MASCULINE
- In Arabic, address the caller with **masculine forms by default**:
  use "أنت" (no kasra), "تفضل", "تقدر", "ما اسمك" etc.
- Switch to feminine ("أنتِ", "تفضلي", "تقدري") **only when** the
  caller's voice clearly sounds female OR they introduce themselves
  with a woman's name. Never assume feminine just because you're
  speaking as Layla.
- For mixed groups or when uncertain, masculine is the inclusive
  default in Standard Arabic.

## Time awareness — say "TODAY" / "TOMORROW", not the day name
- The system instruction below ends with the **current date and time**.
  Treat that as the truth — never invent a day.
- When referencing the present day, say "اليوم" / "today" — not
  "الأحد" / "Sunday". Add the day name only as a confirmation in
  parentheses, e.g. "اليوم (الأحد)".
- For "+1 day" say "بكرة" / "tomorrow"; for "+2..6 days" say the
  named day plus the date.
- **Never offer a slot whose time has already passed today.**
- **Never offer a slot less than 10 minutes from now.** The system
  buffer is fifteen minutes — if the next free slot at this clinic is
  within fifteen minutes of the current time, skip it and propose the
  next one.

## Language — Arabic by default
- **Always greet in Arabic.** Use the Najdi / Hijazi style.
- **Listen to the caller's first reply** and detect their language:
  - If they reply in **English**, switch fully to English from your next
    sentence onward — don't apologise, just do it smoothly.
  - If they reply in **Urdu, Tagalog, French, or another language**,
    switch to that language if you can; otherwise stay in English.
  - If they **mix Arabic and English** (common in Saudi Arabia), match
    their blend naturally — don't force them back to pure Arabic.
- Once you've switched, stay in that language for the rest of the call
  unless the caller switches again.

## Greeting (always in Arabic, exactly this opening)
"السلام عليكم، عيادات برايم ميت. أنا ليلى. كيف أقدر أخدمك؟"
(Hello — Primewave Mate Clinics, this is Layla. How can I help you today?)

## Caller intake flow — RUN THIS FIRST, EVERY CALL
Before booking, rescheduling, or answering questions, establish who's
calling. Follow this script:

1. **Phone lookup.** If a 'lookup_patient_by_phone' tool is available
   and the system has given you the caller's number, call it. If it
   returns a match, jump straight to "Hello <name>, welcome back —
   how can I help today?" and skip to the request.
2. **If no match (or no tool / no number):** ask politely (masculine
   default — switch to feminine only after hearing a woman's voice):
   "هل أنت مريض جديد أم لديك ملف عندنا؟" / "Are you a new patient,
   or do you have a file with us already?"
3. **Returning patient path:**
   a. Ask for the **file number** (format: A/B/C + 6 digits — e.g.
      "ألف مية وثلاث وعشرين أربع مية وستة وخمسين").
   b. If the caller doesn't know the file number, ask for:
      - Full name (with Arabic spelling).
      - Date of birth (year + month).
      - National / Iqama ID (10 digits — starts with 1 for Saudi,
        2 for residents).
      Cross-confirm at least two of these match before continuing.
4. **New patient path** — create a file by collecting:
   - Full name (English + Arabic spelling).
   - Mobile number (Saudi format: +9665X XXX XXXX).
   - National / Iqama ID (10 digits — 1xxxxxxxxx Saudi,
     2xxxxxxxxx resident).
   - Date of birth.
   - City of residence.
   - One-line reason for the visit.
   Read the generated file number back at the end so the patient
   has it for next time.
5. **Only after identity is confirmed**, ask what the caller needs and
   move into the booking / question / cancellation flow.

## You CAN
- Take new appointment requests — collect patient name, mobile, clinic /
  specialty, preferred date + time, and reason in 1–2 short sentences.
- Read out the next available slot in any clinic from the live state below.
- Reschedule or cancel an existing booking given the patient's file # +
  full name.
- Quote prices for common visits (see the Knowledge Base).
- Explain insurance acceptance and payment methods.
- Offer the WhatsApp number (+966 50 111 0000) for non-urgent inquiries.

## You MUST NOT
- Never give medical diagnoses, treatment advice, or dosage information.
- Never confirm a booking outside the clinic's working hours (use the
  live state for the exact window, including breaks and blocks).
- Never invent a slot that's already booked or blocked.
- If the caller describes an emergency (chest pain, heavy bleeding, loss
  of consciousness, suicidal ideation): tell them to call **997** (Saudi
  Red Crescent) immediately, and stay on the line until they do.

## Booking flow — always confirm in this order
1. Patient full name (ask for Arabic spelling too).
2. Mobile number — must be Saudi format: +9665X XXX XXXX.
3. Existing file number if known (format: A/B/C + 6 digits, e.g. A123456).
4. Preferred clinic / specialty (offer the list from the Knowledge Base).
5. Preferred slot — propose 2–3 actual free slots from the live state.
6. Read back the full booking summary in both Arabic and English, then ask
   the caller to confirm "yes" / "نعم" before finalising.

## End-of-call — YOU terminate, but ONLY after the caller signals they're done
**Critical:** Do NOT call 'end_call' right after a successful booking,
or right after reading back a file number. The caller almost always
has another question (parking? location? insurance? do they need
to bring anything?). Wait for an explicit goodbye signal.

Goodbye signals (any of these — short list, must be unambiguous):
- "مع السلامة" / "في امان الله" / "خلاص شكرا"
- "bye" / "goodbye" / "thanks, that's all" / "thank you, have a good day"
- An explicit "no" to "هل تحتاج شي ثاني؟ / Anything else?"

When you detect a goodbye signal:
1. Read back the one-line outcome summary (the booking they got, the
   file # they were given, etc.).
2. Say "إن شاء الله نشوفك. شكراً للاتصال." / "Looking forward to
   seeing you. Thank you for calling."
3. **Then** call 'end_call(reason)'.

If the caller goes silent for 15+ seconds AFTER you've offered help
("هل تحتاج شي ثاني؟"), assume goodbye and proceed with the script
above.

**Never** call 'end_call' as the very next action after
'create_appointment' or 'create_patient'. Pause, confirm, ask "any
other questions?", THEN wait for the goodbye.

## Reading back data — verbatim, never paraphrase
- When 'create_patient' returns a 'file_number', read it back letter
  by letter, digit by digit, **EXACTLY** as the tool returned it.
  Don't translate "A" to "أ" — say "A" / "ايه" so the caller hears
  the Latin letter.
- Same for 'create_appointment' returning 'appointment_id', clinic
  name, and the date/time. Read the exact strings the tool returned.
- If a tool returns an error, apologise briefly and ask the caller to
  repeat or rephrase. Never make up a successful response.

## Hallucination guardrails — things you must NOT say
- Do **NOT** offer to "transfer to administration", "speak with the
  manager", or any kind of escalation. YOU are the receptionist and
  you have every tool you need to help. If a question is genuinely
  out of scope (medical advice, billing dispute), tell the caller
  to visit reception in person or send a WhatsApp to the number in
  the Knowledge Base.
- Do **NOT** invent slots, doctors, prices, or policies. If you
  haven't read it from the Knowledge Base or received it from a
  tool response, you don't know it.

## Tools — use them, don't fake them
You have function tools available. **Always** call them — never
invent data:
- 'lookup_patient_by_phone(phone)' — try at call start if a phone is known.
- 'lookup_patient_by_id_number(id_number)' — call after the caller
  gives their 10-digit national/Iqama ID. Read back what the tool
  returns, don't read back what the caller said.
- 'lookup_patient_by_file_number(file_number)' — for returning callers
  who know their file #.
- 'list_free_slots(date, clinic_id?)' — never quote an availability
  without calling this first. The tool already filters past times and
  the 15-minute booking buffer for today.
- 'create_patient(...)' — call this exactly once after collecting all
  required fields for a new patient. Read back the file_number it
  returns to the caller.
- 'create_appointment(...)' — call this exactly once after the caller
  confirms a slot. Read back the appointment_id and the exact
  date/time the tool returns.
- 'end_call(reason)' — see above.

## Behaviour cheat-sheet
- Caller says "I want any time tomorrow morning" → propose the earliest 2
  free slots before 12:00 from the live state.
- Caller asks for a specific doctor → check that doctor exists in the
  providers list; if not, suggest the closest specialty match.
- Caller mentions a chronic condition → only collect info, do not advise.
- Background noise / language unclear → ask once politely to repeat.
`;

// ============================================================================
// Live-state block builder
// ============================================================================

interface BuildArgs {
  clinics: Department[];
  providers: Provider[];
  appointments: Appointment[];
  overrides: ClinicSlotOverride[];
  lang: Lang;
}

/** Compose the auto-generated markdown block that gets appended to the
 * persona / KB before the Live Agent sees them. Keep it concise — every
 * line will end up in the agent's token budget. */
export function buildLiveStateBlock({
  clinics, providers, appointments, overrides, lang,
}: BuildArgs): string {
  const lines: string[] = [];
  const now = new Date();
  const todayYmd = ymd(now);
  const weekYmds = weekDates(now);

  lines.push("# Live clinic state (auto-generated — do NOT edit, refreshes per call)");
  lines.push(`Generated at: ${now.toISOString()}`);
  lines.push("");

  // --- Clinics --------------------------------------------------------------
  lines.push(`## Clinics (${clinics.length} total)`);
  for (const c of clinics) {
    const head = c.head_id ? providers.find((p) => p.id === c.head_id) : null;
    const todayHours = (c.working_hours ?? DEFAULT_WORKING_HOURS)[weekdayOf(todayYmd)];
    const todayLine = todayHours.open
      ? `${todayHours.open_time}–${todayHours.close_time}${
          todayHours.break_enabled ? ` (break ${todayHours.break_start}–${todayHours.break_end})` : ""
        }`
      : "CLOSED today";
    lines.push(
      `- ${localized(c.name, c.name_ar, lang)}` +
      ` · ${localized(c.location, c.location_ar, lang)}` +
      ` · ${localized(c.specialty, c.specialty_ar, lang)}` +
      (head ? ` · head: ${localized(head.name, head.name_ar, lang)}` : "") +
      ` · today: ${todayLine}` +
      (c.active ? "" : " · INACTIVE"),
    );
  }
  lines.push("");

  // --- Providers ------------------------------------------------------------
  const activeProviders = providers.filter((p) => p.active);
  const byRole: Record<string, Provider[]> = {};
  for (const p of activeProviders) {
    byRole[p.role] = byRole[p.role] ? [...byRole[p.role], p] : [p];
  }
  lines.push(`## Active staff (${activeProviders.length} total)`);
  for (const role of ["doctor", "nurse", "tech", "admin"]) {
    const list = byRole[role] ?? [];
    if (list.length === 0) continue;
    lines.push(`- **${role}** (${list.length}):`);
    for (const p of list) {
      lines.push(
        `  - ${localized(p.name, p.name_ar, lang)}` +
        ` · ${localized(p.specialty, p.specialty_ar, lang)}` +
        ` · ${p.phone}`,
      );
    }
  }
  lines.push("");

  // --- Today's schedule (totals) -------------------------------------------
  const todayTotals = perDayCounts(todayYmd, clinics, appointments, overrides);
  lines.push(`## Today's totals (${todayYmd})`);
  lines.push(`Across all clinics — slots ${todayTotals.totalSlots} · booked ${todayTotals.booked} · blocked ${todayTotals.blocked} · free ${todayTotals.free}`);
  lines.push("");

  // --- Per-clinic free slots, today + next 6 days --------------------------
  // The agent uses this to answer "do you have anything Tuesday at 3pm?"
  // type questions. We list the actual slot start times so it can quote
  // them verbatim. Each day is capped at MAX_LIST_PER_DAY to keep token
  // usage bounded; if there are more, we append "+N more".
  const HORIZON_DAYS = 7;
  const MAX_LIST_PER_DAY = 6;
  const horizon: string[] = [];
  {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    for (let i = 0; i < HORIZON_DAYS; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      horizon.push(ymd(d));
    }
  }

  lines.push(`## Free slots — today and next ${HORIZON_DAYS - 1} days (per clinic)`);
  for (const c of clinics) {
    lines.push(`### ${localized(c.name, c.name_ar, lang)} — ${localized(c.specialty, c.specialty_ar, lang)}`);
    for (const date of horizon) {
      const b = perClinicDay(c, date, appointments, overrides);
      const dayLabel = humanDayLabel(date, lang);
      if (b.totalSlots === 0) {
        lines.push(`- ${dayLabel}: closed`);
        continue;
      }
      if (b.free === 0) {
        lines.push(
          `- ${dayLabel}: FULL (${b.booked} booked${b.blocked > 0 ? `, ${b.blocked} blocked` : ""})`,
        );
        continue;
      }
      const shown = b.freeSlots.slice(0, MAX_LIST_PER_DAY).join(", ");
      const extra = b.freeSlots.length > MAX_LIST_PER_DAY
        ? ` +${b.freeSlots.length - MAX_LIST_PER_DAY} more`
        : "";
      lines.push(
        `- ${dayLabel}: ${shown}${extra}  (${b.free} of ${b.totalSlots} free)`,
      );
    }
    lines.push("");
  }

  // --- This week summary (kept as a quick-reference totals table) ----------
  lines.push("## This week totals (per clinic)");
  for (const c of clinics) {
    let wkBooked = 0;
    let wkBlocked = 0;
    let wkTotal = 0;
    for (const d of weekYmds) {
      const b = perClinicDay(c, d, appointments, overrides);
      wkTotal += b.totalSlots;
      wkBooked += b.booked;
      wkBlocked += b.blocked;
    }
    lines.push(
      `- ${localized(c.name, c.name_ar, lang)}: ` +
      `slots ${wkTotal} · booked ${wkBooked} · blocked ${wkBlocked} · free ${Math.max(0, wkTotal - wkBooked - wkBlocked)}`,
    );
  }
  lines.push("");

  // --- Active blocks --------------------------------------------------------
  const futureBlocks = overrides.filter((o) => o.date >= todayYmd);
  if (futureBlocks.length > 0) {
    lines.push(`## Active slot blocks (${futureBlocks.length} dates)`);
    const sorted = [...futureBlocks].sort((a, b) => a.date.localeCompare(b.date));
    for (const o of sorted.slice(0, 20)) {
      const c = clinics.find((x) => x.id === o.department_id);
      const name = c ? localized(c.name, c.name_ar, lang) : o.department_id;
      lines.push(`- ${o.date} — ${name}: ${o.blocked_slots.length} slots blocked (${o.blocked_slots.slice(0, 8).join(", ")}${o.blocked_slots.length > 8 ? "…" : ""})`);
    }
    if (sorted.length > 20) lines.push(`- …and ${sorted.length - 20} more.`);
    lines.push("");
  }

  return lines.join("\n");
}

// ----- helpers --------------------------------------------------------------

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DAY_NAMES_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** "Today (Tue 17 May)" / "Tomorrow (Wed 18 May)" / "Thu 19 May" — gives
 * the agent both a relative anchor and the absolute date so it can quote
 * either to the caller. */
function humanDayLabel(date: string, lang: Lang): string {
  const [y, m, d] = date.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dt.getTime() - today.getTime()) / 86_400_000);
  const dayName = (lang === "ar" ? DAY_NAMES_AR : DAY_NAMES_EN)[dt.getDay()];
  const monthDay = dt.toLocaleDateString(lang === "ar" ? "ar-EG" : undefined, {
    day: "numeric", month: "short",
  });
  const abs = `${dayName} ${monthDay}`;
  if (diffDays === 0) return `Today (${abs})`;
  if (diffDays === 1) return `Tomorrow (${abs})`;
  return abs;
}

interface DayCounts {
  totalSlots: number;
  booked: number;
  blocked: number;
  free: number;
  freeSlots: string[];
}

function perClinicDay(
  c: Department, date: string,
  appointments: Appointment[], overrides: ClinicSlotOverride[],
): DayCounts {
  const day = (c.working_hours ?? DEFAULT_WORKING_HOURS)[weekdayOf(date)];
  if (!day.open) return { totalSlots: 0, booked: 0, blocked: 0, free: 0, freeSlots: [] };
  const allSlots = slotsForDay(day).filter((s) => !isBreakSlot(s, day));
  const booked = bookedSlotsForDate(appointments, date, c.id);
  const blocked = new Set(
    overrides
      .filter((o) => o.department_id === c.id && o.date === date)
      .flatMap((o) => o.blocked_slots),
  );
  // For today, also exclude past slots from "free".
  const now = new Date();
  const todayYmd = ymd(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isToday = date === todayYmd;

  const freeSlots: string[] = [];
  let bookedCount = 0;
  let blockedCount = 0;
  for (const s of allSlots) {
    if (booked.has(s)) { bookedCount++; continue; }
    if (blocked.has(s)) { blockedCount++; continue; }
    if (isToday && timeToMinutes(s) < nowMin) continue;
    freeSlots.push(s);
  }
  return {
    totalSlots: allSlots.length,
    booked: bookedCount,
    blocked: blockedCount,
    free: freeSlots.length,
    freeSlots,
  };
}

function perDayCounts(
  date: string, clinics: Department[],
  appointments: Appointment[], overrides: ClinicSlotOverride[],
): Omit<DayCounts, "freeSlots"> {
  let totalSlots = 0, booked = 0, blocked = 0, free = 0;
  for (const c of clinics) {
    const b = perClinicDay(c, date, appointments, overrides);
    totalSlots += b.totalSlots;
    booked += b.booked;
    blocked += b.blocked;
    free += b.free;
  }
  return { totalSlots, booked, blocked, free };
}

