import { useEffect, useState, type ReactNode } from "react";
import { AppContext, translations, type Lang, type TKey } from "@/lib/i18n";

const AUTH_KEY = "pwmc_auth";
const LANG_KEY = "pwmc_lang";
const THEME_KEY = "pwmc_theme";

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const [theme, setThemeState] = useState<"light" | "dark">("light");
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    const a = localStorage.getItem(AUTH_KEY) === "1";
    const l = (localStorage.getItem(LANG_KEY) as Lang) || "en";
    const t = (localStorage.getItem(THEME_KEY) as "light" | "dark") || "light";
    setIsAuthed(a);
    setLangState(l);
    setThemeState(t);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    root.setAttribute("lang", lang);
  }, [theme, lang]);

  const setLang = (l: Lang) => {
    localStorage.setItem(LANG_KEY, l);
    setLangState(l);
  };
  const setTheme = (t: "light" | "dark") => {
    localStorage.setItem(THEME_KEY, t);
    setThemeState(t);
  };
  const login = (u: string, p: string) => {
    if (u === "admin" && p === "admin12345") {
      localStorage.setItem(AUTH_KEY, "1");
      setIsAuthed(true);
      return true;
    }
    return false;
  };
  const logout = () => {
    localStorage.removeItem(AUTH_KEY);
    setIsAuthed(false);
  };
  const t = (k: TKey) => translations[lang][k];

  return (
    <AppContext.Provider value={{ lang, setLang, theme, setTheme, isAuthed, login, logout, t }}>
      {children}
    </AppContext.Provider>
  );
}