import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useApp } from "@/lib/i18n";
import { BrandToggles } from "@/components/BrandToggles";
import logoLight from "@/assets/primewave-light.png";
import logoDark from "@/assets/primewave-dark.png";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { login, isAuthed, t, theme } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthed) navigate({ to: "/dashboard" });
  }, [isAuthed, navigate]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      const ok = login(username.trim(), password);
      setLoading(false);
      if (ok) {
        toast.success(t("welcome"));
        navigate({ to: "/dashboard" });
      } else {
        toast.error(t("invalid"));
      }
    }, 400);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-40 h-[420px] w-[420px] rounded-full opacity-40 blur-3xl"
             style={{ background: "var(--gradient-brand)" }} />
        <div className="absolute -bottom-32 -right-24 h-[480px] w-[480px] rounded-full opacity-30 blur-3xl"
             style={{ background: "var(--gradient-brand)" }} />
      </div>

      <header className="flex items-center justify-between px-6 py-5 md:px-10">
        <img
          src={theme === "dark" ? logoLight : logoDark}
          alt="Primewave"
          className="h-9 w-auto"
        />
        <BrandToggles />
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-6xl items-center justify-center px-6 py-10">
        <div className="grid w-full gap-10 md:grid-cols-2 md:items-center">
          <div className="hidden md:block">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight text-foreground">
              {t("appName")}
            </h1>
            <p className="mt-4 max-w-md text-lg text-muted-foreground">
              {t("tagline")}
            </p>
            <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
              <li className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--brand-purple)" }} />
                Live AI call agents for patient intake
              </li>
              <li className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--brand-blue)" }} />
                Multi-clinic scheduling & provider rosters
              </li>
              <li className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--brand-cyan)" }} />
                Bilingual EN / AR — built for the region
              </li>
            </ul>
          </div>

          <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-brand)] backdrop-blur">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-card-foreground">{t("welcome")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("welcomeSub")}</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">{t("username")}</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("password")}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-muted-foreground">
                  <Checkbox id="remember" />
                  <span>{t("rememberMe")}</span>
                </label>
                <button type="button" className="text-primary hover:underline">
                  {t("forgot")}
                </button>
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full text-base font-medium text-primary-foreground shadow-[var(--shadow-brand)] transition-transform hover:scale-[1.01]"
                style={{ background: "var(--gradient-brand)" }}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("signIn")}
              </Button>
            </form>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              Demo credentials: <span className="font-mono">admin / admin12345</span>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}