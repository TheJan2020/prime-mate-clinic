import { createFileRoute } from "@tanstack/react-router";
import { PhoneCall, Bot, Clock, Users2, Activity, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/lib/i18n";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

const agents = [
  { id: "AI-01", name: "Mate · Triage AI", type: "ai", status: "inCall", duration: "02:14", patient: "Sara A.", clinic: "Al Noor Pediatrics" },
  { id: "AG-12", name: "Layla Hassan", type: "human", status: "inCall", duration: "05:48", patient: "Mohammed K.", clinic: "Smile Dental" },
  { id: "AI-02", name: "Mate · Booking AI", type: "ai", status: "inCall", duration: "00:42", patient: "Fatima R.", clinic: "Cairo Cardio Center" },
  { id: "AG-07", name: "James Carter", type: "human", status: "idle", duration: "—", patient: "—", clinic: "—" },
  { id: "AI-03", name: "Mate · Follow-up AI", type: "ai", status: "inCall", duration: "01:09", patient: "Omar S.", clinic: "Wellness Family Clinic" },
  { id: "AG-04", name: "Priya Nair", type: "human", status: "onBreak", duration: "—", patient: "—", clinic: "—" },
];

function Dashboard() {
  const { t, lang } = useApp();
  const stats = [
    { label: t("activeCalls"), value: "14", icon: PhoneCall, accent: "var(--brand-blue)" },
    { label: t("aiAgents"), value: "6 / 8", icon: Bot, accent: "var(--brand-purple)" },
    { label: t("waiting"), value: "23", icon: Users2, accent: "var(--brand-cyan)" },
    { label: t("avgWait"), value: lang === "ar" ? "١:٤٢" : "1:42", icon: Clock, accent: "var(--brand-blue)" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("liveAgents")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("overview")}</p>
        </div>
        <Badge variant="secondary" className="gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Live
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="relative overflow-hidden rounded-xl border border-border bg-card p-5">
            <div className="absolute inset-x-0 top-0 h-1" style={{ background: s.accent }} />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <s.icon className="h-4 w-4" style={{ color: s.accent }} />
            </div>
            <div className="mt-3 text-3xl font-semibold text-foreground">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-card-foreground">{t("liveQueue")}</h2>
            </div>
            <span className="text-xs text-muted-foreground">{agents.length} {t("agent").toLowerCase()}s</span>
          </div>
          <div className="divide-y divide-border">
            <div className="grid grid-cols-12 px-5 py-2 text-xs uppercase tracking-wide text-muted-foreground">
              <div className="col-span-4">{t("agent")}</div>
              <div className="col-span-2">{t("status")}</div>
              <div className="col-span-2">{t("duration")}</div>
              <div className="col-span-2">{t("patient")}</div>
              <div className="col-span-2">{t("clinic")}</div>
            </div>
            {agents.map((a) => (
              <div key={a.id} className="grid grid-cols-12 items-center px-5 py-3 text-sm">
                <div className="col-span-4 flex items-center gap-3">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-primary-foreground"
                    style={{ background: a.type === "ai" ? "var(--gradient-brand)" : "var(--brand-blue)" }}
                  >
                    {a.type === "ai" ? <Bot className="h-4 w-4" /> : a.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                  </div>
                  <div>
                    <div className="font-medium text-foreground">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{a.id}</div>
                  </div>
                </div>
                <div className="col-span-2">
                  <StatusBadge status={a.status as "inCall" | "idle" | "onBreak"} />
                </div>
                <div className="col-span-2 font-mono text-muted-foreground">{a.duration}</div>
                <div className="col-span-2 text-foreground">{a.patient}</div>
                <div className="col-span-2 text-muted-foreground">{a.clinic}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" style={{ color: "var(--brand-purple)" }} />
              <h3 className="text-sm font-semibold text-card-foreground">{t("todayBookings")}</h3>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <div className="text-3xl font-semibold text-foreground">128</div>
                <div className="text-xs text-muted-foreground">+18% vs yesterday</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold" style={{ color: "var(--brand-purple)" }}>72%</div>
                <div className="text-xs text-muted-foreground">{t("aiAssisted")}</div>
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full" style={{ width: "72%", background: "var(--gradient-brand)" }} />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-card-foreground">Channels</h3>
            <ul className="mt-4 space-y-3 text-sm">
              {[
                { name: "Voice", v: "62%", c: "var(--brand-blue)" },
                { name: "WhatsApp", v: "24%", c: "var(--brand-cyan)" },
                { name: "Web Chat", v: "14%", c: "var(--brand-purple)" },
              ].map((c) => (
                <li key={c.name}>
                  <div className="flex justify-between text-muted-foreground">
                    <span>{c.name}</span>
                    <span className="text-foreground">{c.v}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full" style={{ width: c.v, background: c.c }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "inCall" | "idle" | "onBreak" }) {
  const { t } = useApp();
  const map = {
    inCall: { label: t("inCall"), cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
    idle: { label: t("idle"), cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
    onBreak: { label: t("onBreak"), cls: "bg-muted text-muted-foreground" },
  } as const;
  const s = map[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}