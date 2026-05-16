import { createContext, useContext } from "react";

export type Lang = "en" | "ar";

export const translations = {
  en: {
    appName: "Primewave Mate Clinics",
    tagline: "Scheduling & LIVE AI Agent for Clinics",
    signIn: "Sign in",
    welcome: "Welcome back",
    welcomeSub: "Sign in to access your clinic command center",
    username: "Username",
    password: "Password",
    rememberMe: "Remember me",
    forgot: "Forgot password?",
    invalid: "Invalid username or password",
    signOut: "Sign out",
    home: "Home",
    clinics: "Clinics",
    providers: "Health Providers",
    appointments: "Appointments",
    patients: "Patients",
    callCenter: "Call Center",
    settings: "Settings",
    liveAgents: "Live Call-Center / Agents",
    overview: "Real-time view of active calls, AI agents, and queue health",
    activeCalls: "Active Calls",
    aiAgents: "AI Agents Online",
    waiting: "Patients Waiting",
    avgWait: "Avg. Wait",
    liveQueue: "Live Queue",
    agent: "Agent",
    status: "Status",
    duration: "Duration",
    patient: "Patient",
    clinic: "Clinic",
    inCall: "In call",
    idle: "Idle",
    onBreak: "On break",
    todayBookings: "Today's Bookings",
    aiAssisted: "AI-assisted",
    language: "Language",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
  },
  ar: {
    appName: "بريم​ويف ميت للعيادات",
    tagline: "جدولة وعميل ذكاء اصطناعي مباشر للعيادات",
    signIn: "تسجيل الدخول",
    welcome: "مرحباً بعودتك",
    welcomeSub: "سجّل الدخول للوصول إلى مركز إدارة عيادتك",
    username: "اسم المستخدم",
    password: "كلمة المرور",
    rememberMe: "تذكرني",
    forgot: "نسيت كلمة المرور؟",
    invalid: "اسم المستخدم أو كلمة المرور غير صحيحة",
    signOut: "تسجيل الخروج",
    home: "الرئيسية",
    clinics: "العيادات",
    providers: "مزودو الرعاية الصحية",
    appointments: "المواعيد",
    patients: "المرضى",
    callCenter: "مركز الاتصال",
    settings: "الإعدادات",
    liveAgents: "مركز الاتصال المباشر / الوكلاء",
    overview: "عرض مباشر للمكالمات النشطة ووكلاء الذكاء الاصطناعي وحالة الانتظار",
    activeCalls: "المكالمات النشطة",
    aiAgents: "وكلاء الذكاء الاصطناعي",
    waiting: "المرضى في الانتظار",
    avgWait: "متوسط الانتظار",
    liveQueue: "قائمة الانتظار المباشرة",
    agent: "الوكيل",
    status: "الحالة",
    duration: "المدة",
    patient: "المريض",
    clinic: "العيادة",
    inCall: "في مكالمة",
    idle: "خامل",
    onBreak: "في استراحة",
    todayBookings: "حجوزات اليوم",
    aiAssisted: "بمساعدة الذكاء الاصطناعي",
    language: "اللغة",
    theme: "السمة",
    light: "فاتح",
    dark: "داكن",
  },
} as const;

export type TKey = keyof typeof translations.en;

interface AppCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
  isAuthed: boolean;
  login: (u: string, p: string) => boolean;
  logout: () => void;
  t: (k: TKey) => string;
}

export const AppContext = createContext<AppCtx | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}