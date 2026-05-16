import { Moon, Sun, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/i18n";

export function BrandToggles() {
  const { lang, setLang, theme, setTheme } = useApp();
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setLang(lang === "en" ? "ar" : "en")}
        className="gap-2"
      >
        <Languages className="h-4 w-4" />
        {lang === "en" ? "العربية" : "English"}
      </Button>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        aria-label="Toggle theme"
      >
        {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </Button>
    </div>
  );
}