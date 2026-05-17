import { useEffect, useState, useCallback } from "react";

const STORAGE_PREFIX = "pwdemo:clinic";
const VERSION = 1;
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
// Entity types
// ============================================================================

export type Department = {
  id: string;
  name: string;
  specialty: string;
  location: string;
  head_id: string | null; // → Provider.id
  active: boolean;
};

export type ProviderRole = "doctor" | "nurse" | "tech" | "admin";

export type Provider = {
  id: string;
  name: string;
  role: ProviderRole;
  specialty: string;
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
  patient_name: string;
  patient_phone: string;
  department_id: string | null;
  provider_id: string | null;
  /** ISO datetime string (local) */
  scheduled_at: string;
  duration_min: number;
  status: AppointmentStatus;
  notes: string;
};

// ============================================================================
// Seed data
// ============================================================================

export const SEED_PROVIDERS: Provider[] = [
  { id: "PRV-001", name: "Dr. Layla Hassan",   role: "doctor", specialty: "Pediatrics",   email: "l.hassan@primemate.clinic",   phone: "+961 70 111 001", active: true },
  { id: "PRV-002", name: "Dr. Omar Saleh",     role: "doctor", specialty: "Cardiology",   email: "o.saleh@primemate.clinic",    phone: "+961 70 111 002", active: true },
  { id: "PRV-003", name: "Dr. Fatima Rizk",    role: "doctor", specialty: "Dermatology",  email: "f.rizk@primemate.clinic",     phone: "+961 70 111 003", active: true },
  { id: "PRV-004", name: "Dr. James Carter",   role: "doctor", specialty: "Dentistry",    email: "j.carter@primemate.clinic",   phone: "+961 70 111 004", active: true },
  { id: "PRV-005", name: "Dr. Priya Nair",     role: "doctor", specialty: "Family Medicine", email: "p.nair@primemate.clinic",  phone: "+961 70 111 005", active: true },
  { id: "PRV-006", name: "Dr. Mohammed Khalil", role: "doctor", specialty: "Orthopedics", email: "m.khalil@primemate.clinic",  phone: "+961 70 111 006", active: true },
  { id: "PRV-007", name: "Nurse Sara Aoun",    role: "nurse",  specialty: "Triage",       email: "s.aoun@primemate.clinic",     phone: "+961 70 111 007", active: true },
  { id: "PRV-008", name: "Nurse Karim Daher",  role: "nurse",  specialty: "Pediatrics",   email: "k.daher@primemate.clinic",    phone: "+961 70 111 008", active: true },
  { id: "PRV-009", name: "Tech Rana Mansour",  role: "tech",   specialty: "Radiology",    email: "r.mansour@primemate.clinic",  phone: "+961 70 111 009", active: true },
  { id: "PRV-010", name: "Admin Hadi Tabet",   role: "admin",  specialty: "Front Desk",   email: "h.tabet@primemate.clinic",    phone: "+961 70 111 010", active: true },
];

export const SEED_DEPARTMENTS: Department[] = [
  { id: "DEP-001", name: "Al Noor Pediatrics",       specialty: "Pediatrics",       location: "Beirut · Hamra",   head_id: "PRV-001", active: true },
  { id: "DEP-002", name: "Cairo Cardio Center",      specialty: "Cardiology",       location: "Beirut · Verdun",  head_id: "PRV-002", active: true },
  { id: "DEP-003", name: "Smile Dental",             specialty: "Dentistry",        location: "Jounieh",          head_id: "PRV-004", active: true },
  { id: "DEP-004", name: "Wellness Family Clinic",   specialty: "Family Medicine",  location: "Antelias",         head_id: "PRV-005", active: true },
  { id: "DEP-005", name: "SkinScience Dermatology",  specialty: "Dermatology",      location: "Beirut · Ashrafieh", head_id: "PRV-003", active: true },
  { id: "DEP-006", name: "BoneCare Orthopedics",     specialty: "Orthopedics",      location: "Sin El Fil",       head_id: "PRV-006", active: true },
];

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

const PATIENT_FIRST = [
  "Sara", "Mohammed", "Fatima", "Omar", "Layla", "Ahmad", "Nour", "Karim",
  "Rana", "Hadi", "Yara", "Ziad", "Mira", "Tarek", "Salim", "Dana",
  "Bilal", "Maya", "Jamil", "Hala",
];
const PATIENT_LAST = [
  "A.", "K.", "R.", "S.", "M.", "H.", "T.", "D.", "B.", "N.", "J.", "F.",
];

export function getSeedAppointments(): Appointment[] {
  const items: Appointment[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const depIds = SEED_DEPARTMENTS.map((d) => d.id);
  // Build a quick map: department.id → list of provider IDs that match
  // its specialty (so an appointment's provider is plausibly in that dept).
  const providersBySpecialty: Record<string, string[]> = {};
  for (const p of SEED_PROVIDERS) {
    if (!providersBySpecialty[p.specialty]) providersBySpecialty[p.specialty] = [];
    providersBySpecialty[p.specialty].push(p.id);
  }
  const fallbackDoctors = SEED_PROVIDERS.filter((p) => p.role === "doctor").map((p) => p.id);

  let serial = 0;
  for (let dayOffset = -20; dayOffset <= 10; dayOffset++) {
    const day = new Date(today);
    day.setDate(today.getDate() + dayOffset);
    const key = ymd(day);
    const rng = mulberry32(dateKeyToSeed(key));
    // 3–8 appointments per day, weighted slightly higher mid-week.
    const dow = day.getDay();
    const baseCount = 4 + Math.floor(rng() * 4);
    const count = dow === 0 || dow === 6 ? Math.max(2, baseCount - 2) : baseCount;

    for (let i = 0; i < count; i++) {
      serial++;
      const departmentId = depIds[Math.floor(rng() * depIds.length)];
      const department = SEED_DEPARTMENTS.find((d) => d.id === departmentId)!;
      const candidates = providersBySpecialty[department.specialty] ?? fallbackDoctors;
      const providerId = candidates[Math.floor(rng() * candidates.length)] ?? fallbackDoctors[0];

      // Spread across business hours 09:00–17:00.
      const hour = 9 + Math.floor(rng() * 8);
      const minute = Math.floor(rng() * 4) * 15;
      const scheduled = new Date(day);
      scheduled.setHours(hour, minute, 0, 0);

      let status: AppointmentStatus;
      if (dayOffset < 0) {
        // Past: mostly completed, some cancellations / no-shows.
        const r = rng();
        if (r < 0.75) status = "completed";
        else if (r < 0.9) status = "cancelled";
        else status = "no_show";
      } else if (dayOffset === 0) {
        // Today: split by clock time vs now.
        const now = new Date();
        if (scheduled.getTime() < now.getTime() - 15 * 60 * 1000) {
          status = rng() < 0.85 ? "completed" : "no_show";
        } else {
          status = "scheduled";
        }
      } else {
        status = "scheduled";
      }

      const firstName = PATIENT_FIRST[Math.floor(rng() * PATIENT_FIRST.length)];
      const lastInitial = PATIENT_LAST[Math.floor(rng() * PATIENT_LAST.length)];

      items.push({
        id: `APT-${String(serial).padStart(4, "0")}`,
        patient_name: `${firstName} ${lastInitial}`,
        patient_phone: `+961 7${Math.floor(rng() * 9)} ${String(Math.floor(rng() * 900) + 100)} ${String(Math.floor(rng() * 900) + 100)}`,
        department_id: departmentId,
        provider_id: providerId,
        scheduled_at: scheduled.toISOString(),
        duration_min: [15, 20, 30, 30, 45, 60][Math.floor(rng() * 6)],
        status,
        notes: "",
      });
    }
  }

  // Newest first within the window, then by time of day for stable sorting.
  items.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  return items;
}

// ----- Helpers used by the CRUD pages ---------------------------------------

export function nextId(prefix: "DEP" | "PRV" | "APT", items: { id: string }[]): string {
  const max = items.reduce((m, it) => {
    const match = it.id.match(/^(?:DEP|PRV|APT)-(\d+)$/);
    if (!match) return m;
    const n = parseInt(match[1], 10);
    return n > m ? n : m;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}
