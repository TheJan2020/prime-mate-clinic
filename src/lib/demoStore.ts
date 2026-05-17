import { useEffect, useState, useCallback } from "react";
import type { Lang } from "@/lib/i18n";

const STORAGE_PREFIX = "pwdemo:clinic";
// Bump when a seed schema changes in a non-additive way (e.g. adding required
// fields). Old localStorage entries are then ignored and seeds re-applied.
const VERSION = 2;
const CHANGE_EVENT = "pwdemo:clinic:data-change";

const storageKey = (key: string) => `${STORAGE_PREFIX}:${key}:v${VERSION}`;

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function loadFromStorage<T>(key: string): T[] | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

function saveToStorage<T>(key: string, items: T[]) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(items));
  } catch {
    /* quota exceeded — silently skip */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { key } }));
}

function resolveSeed<T>(seed: T[] | (() => T[])): T[] {
  return typeof seed === "function" ? (seed as () => T[])() : seed.slice();
}

/**
 * useDemoCollection — single source of truth for a CRUD entity in the
 * clinic demo. All pages that touch the same key see the same data and
 * stay in sync via a window-level event (no Context provider needed).
 *
 * @param key   storage key, e.g. "departments" / "providers" / "appointments"
 * @param seed  static array OR factory function (use a function when the seed
 *              depends on `new Date()` — Appointments needs this so Reset
 *              always centres the window on "today").
 */
export function useDemoCollection<T>(
  key: string,
  seed: T[] | (() => T[]),
): {
  items: T[];
  setAll: (next: T[]) => void;
  reset: () => void;
} {
  const [items, setItems] = useState<T[]>(() => {
    const stored = loadFromStorage<T>(key);
    return stored ?? resolveSeed(seed);
  });

  // Cross-page sync: when another mounted page mutates the same key,
  // re-pull from localStorage.
  useEffect(() => {
    if (!isBrowser()) return;
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key?: string } | undefined;
      if (detail?.key && detail.key !== key) return;
      const stored = loadFromStorage<T>(key);
      if (stored) setItems(stored);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey(key)) return;
      const stored = loadFromStorage<T>(key);
      if (stored) setItems(stored);
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [key]);

  const setAll = useCallback(
    (next: T[]) => {
      setItems(next);
      saveToStorage(key, next);
    },
    [key],
  );

  const reset = useCallback(() => {
    const fresh = resolveSeed(seed);
    setItems(fresh);
    saveToStorage(key, fresh);
  }, [key, seed]);

  return { items, setAll, reset };
}

// ============================================================================
// Localization helper — fall through to the English value when the Arabic
// version isn't set (lets the user add new rows without forcing both).
// ============================================================================

export function localized(en: string, ar: string | undefined | null, lang: Lang): string {
  return lang === "ar" && ar && ar.trim() ? ar : en;
}

// ============================================================================
// Entity types
// ============================================================================

/** Per-day schedule. Slot granularity is fixed at 30 min for the demo. */
export type DayHours = {
  open: boolean;
  open_time: string;       // "HH:MM" — start of day's open window
  close_time: string;      // "HH:MM" — end of day's open window (exclusive of last slot start + 30 min)
  break_enabled: boolean;
  break_start: string;     // "HH:MM"
  break_end: string;       // "HH:MM"
};

/** 7-entry default schedule, indexed Sun..Sat. Mirrors a typical Saudi
 * clinic week: Sun-Thu 09:00-17:00 with a 13:00-14:00 break, Fri closed,
 * Sat half-day morning. */
export const DEFAULT_WORKING_HOURS: DayHours[] = [
  { open: true,  open_time: "09:00", close_time: "17:00", break_enabled: true,  break_start: "13:00", break_end: "14:00" }, // Sun
  { open: true,  open_time: "09:00", close_time: "17:00", break_enabled: true,  break_start: "13:00", break_end: "14:00" }, // Mon
  { open: true,  open_time: "09:00", close_time: "17:00", break_enabled: true,  break_start: "13:00", break_end: "14:00" }, // Tue
  { open: true,  open_time: "09:00", close_time: "17:00", break_enabled: true,  break_start: "13:00", break_end: "14:00" }, // Wed
  { open: true,  open_time: "09:00", close_time: "17:00", break_enabled: true,  break_start: "13:00", break_end: "14:00" }, // Thu
  { open: false, open_time: "09:00", close_time: "17:00", break_enabled: false, break_start: "13:00", break_end: "14:00" }, // Fri
  { open: true,  open_time: "09:00", close_time: "13:00", break_enabled: false, break_start: "12:00", break_end: "13:00" }, // Sat
];

export const SLOT_MINUTES = 30;

export type Department = {
  id: string;
  name: string;
  name_ar: string;
  specialty: string;
  specialty_ar: string;
  location: string;
  location_ar: string;
  head_id: string | null; // → Provider.id
  active: boolean;
  /** Optional; when missing, the dialog falls back to DEFAULT_WORKING_HOURS. */
  working_hours?: DayHours[];
};

/** Date-keyed list of slot times to treat as blocked for one clinic on one
 * day. By tying overrides to absolute dates (not week numbers) they
 * naturally stop applying as soon as the date is in the past — next week
 * gets a fresh default schedule with no work to do. */
export type ClinicSlotOverride = {
  id: string;
  department_id: string;
  date: string;            // "YYYY-MM-DD"
  blocked_slots: string[]; // ["09:00", "09:30", ...]
};

export const SEED_SLOT_OVERRIDES: ClinicSlotOverride[] = [];

export type ProviderRole = "doctor" | "nurse" | "tech" | "admin";

export type Provider = {
  id: string;
  name: string;
  name_ar: string;
  role: ProviderRole;
  specialty: string;
  specialty_ar: string;
  email: string;
  phone: string;
  active: boolean;
};

export type AppointmentStatus =
  | "scheduled"
  | "completed"
  | "cancelled"
  | "no_show";

export type Appointment = {
  id: string;
  patient_id: string | null;       // → Patient.id (nullable for ad-hoc bookings)
  patient_name: string;
  patient_name_ar: string;
  patient_phone: string;
  department_id: string | null;
  provider_id: string | null;
  /** ISO datetime string (local) */
  scheduled_at: string;
  duration_min: number;
  status: AppointmentStatus;
  notes: string;
};

export type Gender = "male" | "female";

export type Patient = {
  id: string;
  /** Clinic file number — one letter A/B/C then six digits, first digit 1-9. */
  file_number: string;
  name: string;
  name_ar: string;
  gender: Gender;
  date_of_birth: string;   // YYYY-MM-DD
  phone: string;
  email: string;
  city: string;
  city_ar: string;
  notes: string;
};

export const FILE_NUMBER_PATTERN = /^[A-C][1-9][0-9]{5}$/;

export function isValidFileNumber(s: string): boolean {
  return FILE_NUMBER_PATTERN.test(s);
}

/** Generate a syntactically valid file number from a numeric seed. */
function fileNumberFor(seed: number): string {
  const r = mulberry32(seed ^ 0xfeed);
  const letter = ["A", "B", "C"][Math.floor(r() * 3)];
  const first = 1 + Math.floor(r() * 9);              // 1-9
  const rest  = Math.floor(r() * 100000).toString().padStart(5, "0");
  return `${letter}${first}${rest}`;
}

/** Build the next plausible file number for a brand-new patient — keeps the
 * letter cycling through A/B/C and avoids colliding with what's already in
 * the collection. */
export function suggestFileNumber(existing: Patient[]): string {
  const used = new Set(existing.map((p) => p.file_number));
  for (let attempt = 0; attempt < 10000; attempt++) {
    const candidate = fileNumberFor(Date.now() + attempt);
    if (!used.has(candidate)) return candidate;
  }
  return fileNumberFor(Date.now());
}

// ============================================================================
// Seed data
// ============================================================================

export const SEED_PROVIDERS: Provider[] = [
  { id: "PRV-001", name: "Dr. Layla Hassan",     name_ar: "د. ليلى حسن",     role: "doctor", specialty: "Pediatrics",      specialty_ar: "طب الأطفال",       email: "l.hassan@primemate.clinic",   phone: "+966 50 111 0001", active: true },
  { id: "PRV-002", name: "Dr. Omar Saleh",       name_ar: "د. عمر صالح",     role: "doctor", specialty: "Cardiology",      specialty_ar: "طب القلب",          email: "o.saleh@primemate.clinic",    phone: "+966 50 111 0002", active: true },
  { id: "PRV-003", name: "Dr. Fatima Rizk",      name_ar: "د. فاطمة رزق",   role: "doctor", specialty: "Dermatology",     specialty_ar: "الأمراض الجلدية",  email: "f.rizk@primemate.clinic",     phone: "+966 50 111 0003", active: true },
  { id: "PRV-004", name: "Dr. James Carter",     name_ar: "د. جيمس كارتر",  role: "doctor", specialty: "Dentistry",       specialty_ar: "طب الأسنان",        email: "j.carter@primemate.clinic",   phone: "+966 50 111 0004", active: true },
  { id: "PRV-005", name: "Dr. Priya Nair",       name_ar: "د. بريا نائير",  role: "doctor", specialty: "Family Medicine", specialty_ar: "طب الأسرة",         email: "p.nair@primemate.clinic",     phone: "+966 50 111 0005", active: true },
  { id: "PRV-006", name: "Dr. Mohammed Khalil",  name_ar: "د. محمد خليل",   role: "doctor", specialty: "Orthopedics",     specialty_ar: "جراحة العظام",      email: "m.khalil@primemate.clinic",   phone: "+966 50 111 0006", active: true },
  { id: "PRV-007", name: "Nurse Sara Aoun",      name_ar: "الممرضة سارة عون", role: "nurse",  specialty: "Triage",          specialty_ar: "الفرز الطبي",       email: "s.aoun@primemate.clinic",     phone: "+966 50 111 0007", active: true },
  { id: "PRV-008", name: "Nurse Karim Daher",    name_ar: "الممرض كريم ضاهر", role: "nurse",  specialty: "Pediatrics",      specialty_ar: "طب الأطفال",       email: "k.daher@primemate.clinic",    phone: "+966 50 111 0008", active: true },
  { id: "PRV-009", name: "Tech Rana Mansour",    name_ar: "الفنية رنا منصور", role: "tech",   specialty: "Radiology",       specialty_ar: "الأشعة",            email: "r.mansour@primemate.clinic",  phone: "+966 50 111 0009", active: true },
  { id: "PRV-010", name: "Admin Hadi Tabet",     name_ar: "الإداري هادي ثابت", role: "admin",  specialty: "Front Desk",      specialty_ar: "الاستقبال",         email: "h.tabet@primemate.clinic",    phone: "+966 50 111 0010", active: true },
];

const SEED_DEPARTMENTS_RAW: Omit<Department, "working_hours">[] = [
  { id: "DEP-001", name: "Al Noor Pediatrics",       name_ar: "عيادة النور لطب الأطفال",    specialty: "Pediatrics",      specialty_ar: "طب الأطفال",      location: "Main Center - GF - 12", location_ar: "المركز الرئيسي - ط.أ - 12", head_id: "PRV-001", active: true },
  { id: "DEP-002", name: "Cairo Cardio Center",      name_ar: "مركز القاهرة للقلب",         specialty: "Cardiology",      specialty_ar: "طب القلب",         location: "Main Center - 1F - 28", location_ar: "المركز الرئيسي - ط.١ - 28", head_id: "PRV-002", active: true },
  { id: "DEP-003", name: "Smile Dental",             name_ar: "عيادة سمايل لطب الأسنان",    specialty: "Dentistry",       specialty_ar: "طب الأسنان",       location: "Main Center - GF - 45", location_ar: "المركز الرئيسي - ط.أ - 45", head_id: "PRV-004", active: true },
  { id: "DEP-004", name: "Wellness Family Clinic",   name_ar: "عيادة العافية للأسرة",       specialty: "Family Medicine", specialty_ar: "طب الأسرة",        location: "Main Center - 1F - 11", location_ar: "المركز الرئيسي - ط.١ - 11", head_id: "PRV-005", active: true },
  { id: "DEP-005", name: "SkinScience Dermatology",  name_ar: "سكين ساينس للأمراض الجلدية", specialty: "Dermatology",     specialty_ar: "الأمراض الجلدية",  location: "Main Center - 1F - 32", location_ar: "المركز الرئيسي - ط.١ - 32", head_id: "PRV-003", active: true },
  { id: "DEP-006", name: "BoneCare Orthopedics",     name_ar: "بون كير لجراحة العظام",      specialty: "Orthopedics",     specialty_ar: "جراحة العظام",     location: "Main Center - GF - 50", location_ar: "المركز الرئيسي - ط.أ - 50", head_id: "PRV-006", active: true },
];

export const SEED_DEPARTMENTS: Department[] = SEED_DEPARTMENTS_RAW.map((d) => ({
  ...d,
  // Deep copy so a per-clinic edit doesn't accidentally mutate the prototype.
  working_hours: DEFAULT_WORKING_HOURS.map((h) => ({ ...h })),
}));

// ----- Patients seed --------------------------------------------------------
// 50 patients spread across Saudi cities, with Saudi mobile numbers.

const SAUDI_CITIES: Array<{ en: string; ar: string }> = [
  { en: "Riyadh",       ar: "الرياض" },
  { en: "Jeddah",       ar: "جدة" },
  { en: "Dammam",       ar: "الدمام" },
  { en: "Mecca",        ar: "مكة المكرمة" },
  { en: "Medina",       ar: "المدينة المنورة" },
  { en: "Khobar",       ar: "الخبر" },
  { en: "Tabuk",        ar: "تبوك" },
  { en: "Abha",         ar: "أبها" },
  { en: "Taif",         ar: "الطائف" },
  { en: "Buraydah",     ar: "بريدة" },
];

const PATIENT_NAMES: Array<{ en: string; ar: string; gender: Gender }> = [
  { en: "Sara Al-Otaibi",    ar: "سارة العتيبي",     gender: "female" },
  { en: "Mohammed Al-Qahtani", ar: "محمد القحطاني",  gender: "male"   },
  { en: "Fatima Al-Harbi",   ar: "فاطمة الحربي",     gender: "female" },
  { en: "Omar Al-Ghamdi",    ar: "عمر الغامدي",      gender: "male"   },
  { en: "Layla Al-Shehri",   ar: "ليلى الشهري",      gender: "female" },
  { en: "Ahmad Al-Dosari",   ar: "أحمد الدوسري",     gender: "male"   },
  { en: "Nour Al-Anzi",      ar: "نور العنزي",       gender: "female" },
  { en: "Karim Al-Mutairi",  ar: "كريم المطيري",     gender: "male"   },
  { en: "Rana Al-Subaie",    ar: "رنا السبيعي",      gender: "female" },
  { en: "Hadi Al-Zahrani",   ar: "هادي الزهراني",    gender: "male"   },
  { en: "Yara Al-Saadi",     ar: "يارا السعدي",      gender: "female" },
  { en: "Ziad Al-Faraj",     ar: "زياد الفرج",       gender: "male"   },
  { en: "Mira Al-Khaldi",    ar: "ميرا الخالدي",     gender: "female" },
  { en: "Tarek Al-Maliki",   ar: "طارق المالكي",     gender: "male"   },
  { en: "Salim Al-Asiri",    ar: "سالم العسيري",     gender: "male"   },
  { en: "Dana Al-Rashidi",   ar: "دانة الرشيدي",     gender: "female" },
  { en: "Bilal Al-Juhani",   ar: "بلال الجهني",      gender: "male"   },
  { en: "Maya Al-Sahli",     ar: "مايا السهلي",      gender: "female" },
  { en: "Jamil Al-Balawi",   ar: "جميل البلوي",      gender: "male"   },
  { en: "Hala Al-Najjar",    ar: "هالة النجار",      gender: "female" },
  { en: "Khalid Al-Amri",    ar: "خالد العامري",     gender: "male"   },
  { en: "Reem Al-Khaled",    ar: "ريم الخالد",       gender: "female" },
  { en: "Faisal Al-Hajri",   ar: "فيصل الهاجري",     gender: "male"   },
  { en: "Aisha Al-Mansour",  ar: "عائشة المنصور",    gender: "female" },
  { en: "Hassan Al-Sayed",   ar: "حسن السيد",        gender: "male"   },
  { en: "Ghada Al-Nasser",   ar: "غادة الناصر",      gender: "female" },
  { en: "Sultan Al-Faisal",  ar: "سلطان الفيصل",     gender: "male"   },
  { en: "Lina Al-Saleh",     ar: "لينا الصالح",      gender: "female" },
  { en: "Rashid Al-Thani",   ar: "راشد الثاني",      gender: "male"   },
  { en: "Nadia Al-Marri",    ar: "نادية المري",      gender: "female" },
  { en: "Bandar Al-Sudairi", ar: "بندر السديري",     gender: "male"   },
  { en: "Hessa Al-Romaihi",  ar: "حصة الرميحي",      gender: "female" },
  { en: "Talal Al-Dossari",  ar: "طلال الدوسري",     gender: "male"   },
  { en: "Munira Al-Saud",    ar: "منيرة السعود",     gender: "female" },
  { en: "Adel Al-Suwaidi",   ar: "عادل السويدي",     gender: "male"   },
  { en: "Wafa Al-Kuwari",    ar: "وفاء الكواري",     gender: "female" },
  { en: "Naif Al-Ajmi",      ar: "نايف العجمي",      gender: "male"   },
  { en: "Sahar Al-Kindi",    ar: "سحر الكندي",       gender: "female" },
  { en: "Majed Al-Khalifa",  ar: "ماجد آل خليفة",    gender: "male"   },
  { en: "Lulwa Al-Sabah",    ar: "لولوة الصباح",     gender: "female" },
  { en: "Saud Al-Otaibi",    ar: "سعود العتيبي",     gender: "male"   },
  { en: "Norah Al-Harbi",    ar: "نورة الحربي",      gender: "female" },
  { en: "Yousef Al-Ghamdi",  ar: "يوسف الغامدي",     gender: "male"   },
  { en: "Asma Al-Shehri",    ar: "أسماء الشهري",     gender: "female" },
  { en: "Ibrahim Al-Dosari", ar: "إبراهيم الدوسري",  gender: "male"   },
  { en: "Rawan Al-Mutairi",  ar: "روان المطيري",     gender: "female" },
  { en: "Mansour Al-Subaie", ar: "منصور السبيعي",    gender: "male"   },
  { en: "Bushra Al-Zahrani", ar: "بشرى الزهراني",    gender: "female" },
  { en: "Tareq Al-Saadi",    ar: "طارق السعدي",      gender: "male"   },
  { en: "Hind Al-Faraj",     ar: "هند الفرج",        gender: "female" },
];

function saudiMobile(seed: number): string {
  // +9665X XXX XXXX — 5 is the mobile prefix; X is a digit.
  const r = mulberry32(seed);
  const second = Math.floor(r() * 10);
  const block1 = Math.floor(r() * 1000).toString().padStart(3, "0");
  const block2 = Math.floor(r() * 10000).toString().padStart(4, "0");
  return `+9665${second} ${block1} ${block2}`;
}

function dobFor(age: number, seed: number): string {
  // Pick a day-of-year that's stable for a given (age, seed).
  const r = mulberry32(seed ^ age);
  const today = new Date();
  const year = today.getFullYear() - age;
  const doy = Math.floor(r() * 365);
  const d = new Date(year, 0, 1 + doy);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export const SEED_PATIENTS: Patient[] = PATIENT_NAMES.slice(0, 50).map((p, i) => {
  const seed = 1000 + i * 7;
  const r = mulberry32(seed);
  const city = SAUDI_CITIES[Math.floor(r() * SAUDI_CITIES.length)];
  const age = 4 + Math.floor(r() * 70); // 4–73 years old
  const handle = p.en.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.+|\.+$/g, "");
  return {
    id: `PAT-${String(i + 1).padStart(4, "0")}`,
    file_number: fileNumberFor(seed + i),
    name: p.en,
    name_ar: p.ar,
    gender: p.gender,
    date_of_birth: dobFor(age, seed),
    phone: saudiMobile(seed),
    email: `${handle}@example.sa`,
    city: city.en,
    city_ar: city.ar,
    notes: "",
  };
});

// ----- Appointments seed factory --------------------------------------------
// 31-day window (today − 20 … today + 10). Per-day deterministic RNG so rows
// stay stable within a day, but the window slides with new Date() so a Reset
// tomorrow gives a fresh window around the new "today".

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dateKeyToSeed(yyyymmdd: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < yyyymmdd.length; i++) {
    h ^= yyyymmdd.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getSeedAppointments(): Appointment[] {
  const items: Appointment[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Provider routing — appointments prefer a doctor whose specialty matches
  // the clinic's specialty; falls back to any doctor.
  const providersBySpecialty: Record<string, string[]> = {};
  for (const p of SEED_PROVIDERS) {
    if (!providersBySpecialty[p.specialty]) providersBySpecialty[p.specialty] = [];
    providersBySpecialty[p.specialty].push(p.id);
  }
  const fallbackDoctors = SEED_PROVIDERS.filter((p) => p.role === "doctor").map((p) => p.id);

  /** Window centred on today where each clinic-day fills almost every slot
   * (leaving only 2-3 free). Outside this window the volume drops back
   * down to a handful of appointments per clinic-day so historical scroll
   * stays usable. */
  const FOCAL_RADIUS = 7;
  const FREE_SLOTS_MIN = 2;
  const FREE_SLOTS_MAX = 3;

  let serial = 0;
  for (let dayOffset = -20; dayOffset <= 10; dayOffset++) {
    const day = new Date(today);
    day.setDate(today.getDate() + dayOffset);
    const dateKey = ymd(day);
    const dayRng = mulberry32(dateKeyToSeed(dateKey));
    const inFocal = Math.abs(dayOffset) <= FOCAL_RADIUS;

    for (const department of SEED_DEPARTMENTS) {
      // Per-clinic per-day RNG, deterministic across reloads.
      const rng = mulberry32(dateKeyToSeed(dateKey + ":" + department.id));
      // Ride the day-level rng once to keep some date-only randomness.
      dayRng();

      const dayHours = (department.working_hours ?? DEFAULT_WORKING_HOURS)[day.getDay()];
      if (!dayHours.open) continue;
      const allSlots = slotsForDay(dayHours).filter((s) => !isBreakSlot(s, dayHours));
      if (allSlots.length === 0) continue;

      // Decide which slots to fill.
      const candidates = providersBySpecialty[department.specialty] ?? fallbackDoctors;
      let slotsToFill: string[];
      if (inFocal) {
        // Pick 2-3 to leave FREE, then fill everything else.
        const freeCount = Math.min(
          allSlots.length,
          FREE_SLOTS_MIN + Math.floor(rng() * (FREE_SLOTS_MAX - FREE_SLOTS_MIN + 1)),
        );
        const freeIdx = new Set<number>();
        while (freeIdx.size < freeCount) {
          freeIdx.add(Math.floor(rng() * allSlots.length));
        }
        slotsToFill = allSlots.filter((_, i) => !freeIdx.has(i));
      } else {
        // Sparse: 1-3 slots filled, the rest free.
        const fillCount = 1 + Math.floor(rng() * 3);
        const fillIdx = new Set<number>();
        while (fillIdx.size < Math.min(fillCount, allSlots.length)) {
          fillIdx.add(Math.floor(rng() * allSlots.length));
        }
        slotsToFill = allSlots.filter((_, i) => fillIdx.has(i));
      }

      for (const slot of slotsToFill) {
        serial++;
        const [hh, mm] = slot.split(":").map((n) => parseInt(n, 10));
        const scheduled = new Date(day);
        scheduled.setHours(hh, mm, 0, 0);

        let status: AppointmentStatus;
        if (dayOffset < 0) {
          const r = rng();
          if (r < 0.85) status = "completed";
          else if (r < 0.95) status = "cancelled";
          else status = "no_show";
        } else if (dayOffset === 0) {
          // Today: split by clock time vs now (with a 15-min grace).
          if (scheduled.getTime() < Date.now() - 15 * 60 * 1000) {
            status = rng() < 0.85 ? "completed" : "no_show";
          } else {
            status = "scheduled";
          }
        } else {
          status = "scheduled";
        }

        const providerId =
          candidates[Math.floor(rng() * candidates.length)]
            ?? fallbackDoctors[0];
        const patient = SEED_PATIENTS[Math.floor(rng() * SEED_PATIENTS.length)];

        items.push({
          id: `APT-${String(serial).padStart(4, "0")}`,
          patient_id: patient.id,
          patient_name: patient.name,
          patient_name_ar: patient.name_ar,
          patient_phone: patient.phone,
          department_id: department.id,
          provider_id: providerId,
          scheduled_at: scheduled.toISOString(),
          // Single-slot appointments — clean 1:1 with the 30-min grid so the
          // "free slots" count stays exact in the picker.
          duration_min: SLOT_MINUTES,
          status,
          notes: "",
        });
      }
    }
  }

  // Sort by time of day → newest at the top of the table's default Today view.
  items.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  return items;
}

// ----- Helpers used by the CRUD pages ---------------------------------------

export function nextId(
  prefix: "DEP" | "PRV" | "APT" | "PAT" | "OVR",
  items: { id: string }[],
): string {
  const max = items.reduce((m, it) => {
    const match = it.id.match(/^(?:DEP|PRV|APT|PAT|OVR)-(\d+)$/);
    if (!match) return m;
    const n = parseInt(match[1], 10);
    return n > m ? n : m;
  }, 0);
  const width = prefix === "PAT" ? 4 : 3;
  return `${prefix}-${String(max + 1).padStart(width, "0")}`;
}

// ============================================================================
// Time / slot helpers (used by the Schedule dialog)
// ============================================================================

/** "HH:MM" → minutes since midnight. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** minutes since midnight → "HH:MM". */
export function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** All slot start times for a given day's hours, at SLOT_MINUTES granularity. */
export function slotsForDay(hours: DayHours): string[] {
  if (!hours.open) return [];
  const start = timeToMinutes(hours.open_time);
  const end = timeToMinutes(hours.close_time);
  const out: string[] = [];
  for (let m = start; m + SLOT_MINUTES <= end; m += SLOT_MINUTES) {
    out.push(minutesToTime(m));
  }
  return out;
}

/** True when this slot lies within the day's break window. */
export function isBreakSlot(slot: string, hours: DayHours): boolean {
  if (!hours.break_enabled) return false;
  const s = timeToMinutes(slot);
  return s >= timeToMinutes(hours.break_start) && s < timeToMinutes(hours.break_end);
}

/** Return the YYYY-MM-DD strings for Sunday..Saturday of the week
 * containing `anchor` (defaults to today). Sunday is index 0 to match
 * DayHours indexing. */
export function weekDates(anchor: Date = new Date()): string[] {
  const a = new Date(anchor);
  a.setHours(0, 0, 0, 0);
  const sunday = new Date(a);
  sunday.setDate(a.getDate() - a.getDay()); // a.getDay() = 0 for Sun
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  });
}

/** Map weekday index (0=Sun..6=Sat) for a YYYY-MM-DD string. */
export function weekdayOf(ymd: string): number {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d).getDay();
}

/** Returns the set of slot start-times (HH:MM) that are already occupied by
 * scheduled/completed appointments for one department on one date. Cancelled
 * and no-show appointments don't reserve the slot. Multi-slot appointments
 * (duration_min > SLOT_MINUTES) mark every slot they cover.
 *
 * @param excludeId  if set, the appointment with this id is not counted as
 *                   booking itself — used when editing an existing appointment
 *                   so its own current slot remains selectable.
 */
export function bookedSlotsForDate(
  appointments: Appointment[],
  date: string,
  departmentId: string | null,
  excludeId?: string | null,
): Set<string> {
  const out = new Set<string>();
  for (const a of appointments) {
    if (excludeId && a.id === excludeId) continue;
    if (a.status === "cancelled" || a.status === "no_show") continue;
    if (departmentId && a.department_id !== departmentId) continue;
    if (!a.scheduled_at || a.scheduled_at.slice(0, 10) !== date) continue;
    const startMin = timeToMinutes(a.scheduled_at.slice(11, 16));
    const duration = a.duration_min || SLOT_MINUTES;
    const endMin = startMin + duration;
    const firstSlotStart = Math.floor(startMin / SLOT_MINUTES) * SLOT_MINUTES;
    for (let m = firstSlotStart; m < endMin; m += SLOT_MINUTES) {
      out.add(minutesToTime(m));
    }
  }
  return out;
}
