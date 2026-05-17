import { createFileRoute, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Stethoscope,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  Users,
  UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useApp } from "@/lib/i18n";
import {
  SEED_PROVIDERS, useDemoCollection, nextId,
  type Provider, type ProviderRole,
} from "@/lib/demoStore";

export const Route = createFileRoute("/_app/providers")({
  component: ProvidersPage,
});

const ROLE_ORDER: ProviderRole[] = ["doctor", "nurse", "tech", "admin"];

function ProvidersPage() {
  const { t } = useApp();
  const { items, setAll, reset } = useDemoCollection<Provider>(
    "providers",
    SEED_PROVIDERS,
  );
  const location = useLocation();
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // Hash-based scroll-into-view + ring highlight when arriving via FK link.
  useEffect(() => {
    const id = (location.hash || "").replace(/^#/, "");
    if (!id) return;
    const row = rowRefs.current[id];
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(id);
    const handle = window.setTimeout(() => setHighlightedId(null), 2000);
    return () => window.clearTimeout(handle);
  }, [location.hash, items.length]);

  const counts = useMemo(() => {
    const out: Record<ProviderRole, number> = {
      doctor: 0, nurse: 0, tech: 0, admin: 0,
    };
    for (const p of items) if (p.active) out[p.role]++;
    return out;
  }, [items]);

  const [editing, setEditing] = useState<Provider | null>(null);
  const [draft, setDraft] = useState<Provider | null>(null);
  const [deleting, setDeleting] = useState<Provider | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const openAdd = () => {
    const blank: Provider = {
      id: nextId("PRV", items),
      name: "",
      role: "doctor",
      specialty: "",
      email: "",
      phone: "",
      active: true,
    };
    setEditing(blank);
    setDraft(blank);
  };

  const openEdit = (p: Provider) => {
    setEditing(p);
    setDraft({ ...p });
  };

  const saveDraft = () => {
    if (!draft) return;
    const exists = items.some((x) => x.id === draft.id);
    if (exists) setAll(items.map((x) => (x.id === draft.id ? draft : x)));
    else setAll([...items, draft]);
    setEditing(null);
    setDraft(null);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    setAll(items.filter((x) => x.id !== deleting.id));
    setDeleting(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("providers")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("providersDesc")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setResetOpen(true)}>
            <RotateCcw className="me-2 h-4 w-4" />
            {t("resetData")}
          </Button>
          <Button onClick={openAdd}>
            <Plus className="me-2 h-4 w-4" />
            {t("addProvider")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={<Stethoscope className="h-4 w-4" />}
          label={t("doctor")}
          value={counts.doctor}
          accent="var(--brand-blue)"
        />
        <SummaryCard
          icon={<Users className="h-4 w-4" />}
          label={t("nurse")}
          value={counts.nurse}
          accent="var(--brand-cyan)"
        />
        <SummaryCard
          icon={<UserCog className="h-4 w-4" />}
          label={t("tech")}
          value={counts.tech}
          accent="var(--brand-purple)"
        />
        <SummaryCard
          icon={<UserCog className="h-4 w-4" />}
          label={t("admin")}
          value={counts.admin}
          accent="var(--brand-blue)"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-md"
              style={{ background: "color-mix(in srgb, var(--brand-blue) 18%, transparent)", color: "var(--brand-blue)" }}
            >
              <Stethoscope className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-semibold text-card-foreground">
              {t("providers")}
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {t("showingOf").replace("{filtered}", String(items.length)).replace("{total}", String(items.length))}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-start">ID</th>
                <th className="px-4 py-2 text-start">{t("name")}</th>
                <th className="px-4 py-2 text-start">{t("role")}</th>
                <th className="px-4 py-2 text-start">{t("specialty")}</th>
                <th className="px-4 py-2 text-start">{t("email")}</th>
                <th className="px-4 py-2 text-start">{t("phone")}</th>
                <th className="px-4 py-2 text-start">{t("status")}</th>
                <th className="px-4 py-2 text-end">{t("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">{t("noResults")}</td></tr>
              )}
              {ROLE_ORDER.flatMap((role) =>
                items
                  .filter((p) => p.role === role)
                  .map((p) => (
                    <tr
                      key={p.id}
                      ref={(el) => { rowRefs.current[p.id] = el; }}
                      className={`transition-shadow ${highlightedId === p.id ? "ring-2 ring-primary" : ""}`}
                    >
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{p.id}</td>
                      <td className="px-4 py-2 font-medium text-foreground">{p.name}</td>
                      <td className="px-4 py-2"><RolePill role={p.role} /></td>
                      <td className="px-4 py-2 text-muted-foreground">{p.specialty}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.email}</td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{p.phone}</td>
                      <td className="px-4 py-2"><StatusPill active={p.active} /></td>
                      <td className="px-4 py-2 text-end">
                        <div className="inline-flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(p)} aria-label={t("edit")}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleting(p)} aria-label={t("delete")}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) { setEditing(null); setDraft(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{items.some((x) => x.id === draft?.id) ? t("editProvider") : t("addProvider")}</DialogTitle>
            <DialogDescription>{t("providersDesc")}</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="ID">
                <Input value={draft.id} disabled />
              </Field>
              <Field label={t("role")}>
                <Select value={draft.role} onValueChange={(v: ProviderRole) => setDraft({ ...draft, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_ORDER.map((r) => (
                      <SelectItem key={r} value={r}>{t(r as never)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("name")} className="col-span-2">
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </Field>
              <Field label={t("specialty")}>
                <Input value={draft.specialty} onChange={(e) => setDraft({ ...draft, specialty: e.target.value })} />
              </Field>
              <Field label={t("phone")}>
                <Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
              </Field>
              <Field label={t("email")} className="col-span-2">
                <Input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              </Field>
              <Field label={t("active")} className="col-span-2">
                <div className="flex items-center gap-2">
                  <Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />
                  <span className="text-sm text-muted-foreground">{draft.active ? t("active") : t("inactive")}</span>
                </div>
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setEditing(null); setDraft(null); }}>{t("cancel")}</Button>
            <Button onClick={saveDraft} disabled={!draft || !draft.name.trim()}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("resetConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("resetConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { reset(); setResetOpen(false); }}>
              {t("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryCard({
  icon, label, value, accent,
}: { icon: React.ReactNode; label: string; value: number; accent: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5">
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <div className="mt-3 text-3xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function RolePill({ role }: { role: ProviderRole }) {
  const { t } = useApp();
  const cls: Record<ProviderRole, string> = {
    doctor: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    nurse:  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    tech:   "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    admin:  "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls[role]}`}>
      {t(role as never)}
    </span>
  );
}

function StatusPill({ active }: { active: boolean }) {
  const { t } = useApp();
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
      active
        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
        : "bg-muted text-muted-foreground"
    }`}>
      {active ? t("active") : t("inactive")}
    </span>
  );
}

function Field({
  label, children, className = "",
}: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
