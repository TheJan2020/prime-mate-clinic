import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Building2, Plus, Pencil, Trash2, RotateCcw, MapPin, BadgeCheck,
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
  SEED_DEPARTMENTS, SEED_PROVIDERS, useDemoCollection, nextId,
  type Department, type Provider,
} from "@/lib/demoStore";

export const Route = createFileRoute("/_app/clinics")({
  component: ClinicsPage,
});

function ClinicsPage() {
  const { t } = useApp();
  const { items, setAll, reset } =
    useDemoCollection<Department>("departments", SEED_DEPARTMENTS);
  const { items: providers } =
    useDemoCollection<Provider>("providers", SEED_PROVIDERS);

  const providerById = useMemo(() => {
    const map = new Map<string, Provider>();
    for (const p of providers) map.set(p.id, p);
    return map;
  }, [providers]);

  const stats = useMemo(() => {
    const active = items.filter((d) => d.active).length;
    const specialties = new Set(items.map((d) => d.specialty)).size;
    const locations = new Set(items.map((d) => d.location)).size;
    return { total: items.length, active, specialties, locations };
  }, [items]);

  const [editing, setEditing] = useState<Department | null>(null);
  const [draft, setDraft] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState<Department | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const openAdd = () => {
    const blank: Department = {
      id: nextId("DEP", items),
      name: "",
      specialty: "",
      location: "",
      head_id: null,
      active: true,
    };
    setEditing(blank);
    setDraft(blank);
  };

  const openEdit = (d: Department) => {
    setEditing(d);
    setDraft({ ...d });
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

  // Eligible "head" pool — doctors first, then everyone active.
  const headOptions = useMemo(() => {
    const doctors = providers.filter((p) => p.active && p.role === "doctor");
    const others  = providers.filter((p) => p.active && p.role !== "doctor");
    return [...doctors, ...others];
  }, [providers]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("clinics")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("clinicsDesc")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setResetOpen(true)}>
            <RotateCcw className="me-2 h-4 w-4" />
            {t("resetData")}
          </Button>
          <Button onClick={openAdd}>
            <Plus className="me-2 h-4 w-4" />
            {t("addClinic")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={<Building2 className="h-4 w-4" />} label={t("clinics")} value={stats.total} accent="var(--brand-blue)" />
        <SummaryCard icon={<BadgeCheck className="h-4 w-4" />} label={t("active")} value={stats.active} accent="var(--brand-cyan)" />
        <SummaryCard icon={<Building2 className="h-4 w-4" />} label={t("specialty")} value={stats.specialties} accent="var(--brand-purple)" />
        <SummaryCard icon={<MapPin className="h-4 w-4" />} label={t("location")} value={stats.locations} accent="var(--brand-blue)" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-md"
              style={{
                background: "color-mix(in srgb, var(--brand-purple) 18%, transparent)",
                color: "var(--brand-purple)",
              }}
            >
              <Building2 className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-semibold text-card-foreground">{t("clinics")}</h2>
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
                <th className="px-4 py-2 text-start">{t("specialty")}</th>
                <th className="px-4 py-2 text-start">{t("location")}</th>
                <th className="px-4 py-2 text-start">{t("head")}</th>
                <th className="px-4 py-2 text-start">{t("status")}</th>
                <th className="px-4 py-2 text-end">{t("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">{t("noResults")}</td></tr>
              )}
              {items.map((d) => {
                const head = d.head_id ? providerById.get(d.head_id) : null;
                return (
                  <tr key={d.id}>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{d.id}</td>
                    <td className="px-4 py-2 font-medium text-foreground">{d.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{d.specialty}</td>
                    <td className="px-4 py-2 text-muted-foreground">{d.location}</td>
                    <td className="px-4 py-2">
                      {head ? (
                        <Link
                          to="/providers"
                          hash={head.id}
                          className="font-medium text-primary hover:underline"
                        >
                          {head.name}
                        </Link>
                      ) : (
                        <span className="text-xs italic text-muted-foreground">{t("unassigned")}</span>
                      )}
                    </td>
                    <td className="px-4 py-2"><StatusPill active={d.active} /></td>
                    <td className="px-4 py-2 text-end">
                      <div className="inline-flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(d)} aria-label={t("edit")}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleting(d)} aria-label={t("delete")}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) { setEditing(null); setDraft(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{items.some((x) => x.id === draft?.id) ? t("editClinic") : t("addClinic")}</DialogTitle>
            <DialogDescription>{t("clinicsDesc")}</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="ID">
                <Input value={draft.id} disabled />
              </Field>
              <Field label={t("active")}>
                <div className="flex items-center gap-2">
                  <Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />
                  <span className="text-sm text-muted-foreground">{draft.active ? t("active") : t("inactive")}</span>
                </div>
              </Field>
              <Field label={t("name")} className="col-span-2">
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </Field>
              <Field label={t("specialty")}>
                <Input value={draft.specialty} onChange={(e) => setDraft({ ...draft, specialty: e.target.value })} />
              </Field>
              <Field label={t("location")}>
                <Input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
              </Field>
              <Field label={t("head")} className="col-span-2">
                <Select
                  value={draft.head_id ?? "__none__"}
                  onValueChange={(v) => setDraft({ ...draft, head_id: v === "__none__" ? null : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("none")}</SelectItem>
                    {headOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} <span className="text-muted-foreground">· {p.specialty}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
