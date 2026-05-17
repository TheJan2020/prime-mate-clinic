import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Users, Plus, Pencil, Trash2, RotateCcw, Search,
  UserRound, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useApp } from "@/lib/i18n";
import {
  SEED_PATIENTS, useDemoCollection, nextId, localized,
  isValidFileNumber, suggestFileNumber,
  type Patient, type Gender,
} from "@/lib/demoStore";

export const Route = createFileRoute("/_app/patients")({
  component: PatientsPage,
});

function ageFromDob(dob: string): number {
  if (!dob) return 0;
  const [y, m, d] = dob.split("-").map((n) => parseInt(n, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return 0;
  const today = new Date();
  let age = today.getFullYear() - y;
  const mm = today.getMonth() + 1;
  if (mm < m || (mm === m && today.getDate() < d)) age--;
  return Math.max(0, age);
}

function PatientsPage() {
  const { t, lang } = useApp();
  const { items, setAll, reset } = useDemoCollection<Patient>("patients", SEED_PATIENTS);

  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState<"all" | Gender>("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((p) => {
      if (genderFilter !== "all" && p.gender !== genderFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.name_ar.includes(search.trim()) ||
        p.id.toLowerCase().includes(q) ||
        (p.file_number ?? "").toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.city_ar.includes(search.trim())
      );
    });
  }, [items, search, genderFilter]);

  const stats = useMemo(() => {
    const total = items.length;
    const males = items.filter((p) => p.gender === "male").length;
    const females = total - males;
    const cities = new Set(items.map((p) => p.city)).size;
    return { total, males, females, cities };
  }, [items]);

  const [editing, setEditing] = useState<Patient | null>(null);
  const [draft, setDraft] = useState<Patient | null>(null);
  const [deleting, setDeleting] = useState<Patient | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const openAdd = () => {
    const blank: Patient = {
      id: nextId("PAT", items),
      file_number: suggestFileNumber(items),
      name: "",
      name_ar: "",
      gender: "male",
      date_of_birth: "",
      phone: "",
      email: "",
      city: "",
      city_ar: "",
      notes: "",
    };
    setEditing(blank);
    setDraft(blank);
  };

  const openEdit = (p: Patient) => {
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
            {t("patients")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("patientsDesc")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setResetOpen(true)}>
            <RotateCcw className="me-2 h-4 w-4" />
            {t("resetData")}
          </Button>
          <Button onClick={openAdd}>
            <Plus className="me-2 h-4 w-4" />
            {t("addPatient")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={<Users className="h-4 w-4" />}      label={t("patients")} value={stats.total}   accent="var(--brand-blue)" />
        <SummaryCard icon={<UserRound className="h-4 w-4" />} label={t("male")}     value={stats.males}   accent="var(--brand-cyan)" />
        <SummaryCard icon={<UserRound className="h-4 w-4" />} label={t("female")}   value={stats.females} accent="var(--brand-purple)" />
        <SummaryCard icon={<MapPin className="h-4 w-4" />}    label={t("city")}     value={stats.cities}  accent="var(--brand-blue)" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-md"
              style={{
                background: "color-mix(in srgb, var(--brand-blue) 18%, transparent)",
                color: "var(--brand-blue)",
              }}
            >
              <Users className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-semibold text-card-foreground">{t("patients")}</h2>
            <span className="ms-2 text-xs text-muted-foreground">
              {t("showingOf").replace("{filtered}", String(filtered.length)).replace("{total}", String(items.length))}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute start-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("name") + " / " + t("phone") + " / " + t("city")}
                className="ps-8 w-[280px]"
              />
            </div>
            <Select value={genderFilter} onValueChange={(v: "all" | Gender) => setGenderFilter(v)}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder={t("gender")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all")}</SelectItem>
                <SelectItem value="male">{t("male")}</SelectItem>
                <SelectItem value="female">{t("female")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-start">ID</th>
                <th className="px-4 py-2 text-start">{t("fileNumber")}</th>
                <th className="px-4 py-2 text-start">{t("name")}</th>
                <th className="px-4 py-2 text-start">{t("gender")}</th>
                <th className="px-4 py-2 text-start">{t("age")}</th>
                <th className="px-4 py-2 text-start">{t("phone")}</th>
                <th className="px-4 py-2 text-start">{t("city")}</th>
                <th className="px-4 py-2 text-start">{t("email")}</th>
                <th className="px-4 py-2 text-end">{t("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">{t("noResults")}</td></tr>
              )}
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{p.id}</td>
                  <td className="px-4 py-2 font-mono text-xs font-medium text-foreground" dir="ltr">{p.file_number || "—"}</td>
                  <td className="px-4 py-2 font-medium text-foreground">{localized(p.name, p.name_ar, lang)}</td>
                  <td className="px-4 py-2"><GenderPill gender={p.gender} /></td>
                  <td className="px-4 py-2 text-muted-foreground">{ageFromDob(p.date_of_birth)}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground" dir="ltr">{p.phone}</td>
                  <td className="px-4 py-2 text-muted-foreground">{localized(p.city, p.city_ar, lang)}</td>
                  <td className="px-4 py-2 text-muted-foreground" dir="ltr">{p.email}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) { setEditing(null); setDraft(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{items.some((x) => x.id === draft?.id) ? t("editPatient") : t("addPatient")}</DialogTitle>
            <DialogDescription>{t("patientsDesc")}</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="ID">
                <Input value={draft.id} disabled />
              </Field>
              <Field label={t("gender")}>
                <Select value={draft.gender} onValueChange={(v: Gender) => setDraft({ ...draft, gender: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">{t("male")}</SelectItem>
                    <SelectItem value="female">{t("female")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("fileNumber")} className="col-span-2">
                <Input
                  dir="ltr"
                  value={draft.file_number ?? ""}
                  onChange={(e) => setDraft({ ...draft, file_number: e.target.value.toUpperCase() })}
                  placeholder="A123456"
                  maxLength={7}
                  className={
                    draft.file_number && !isValidFileNumber(draft.file_number)
                      ? "border-destructive focus-visible:ring-destructive"
                      : ""
                  }
                />
                <p className={`mt-1 text-[11px] ${
                  draft.file_number && !isValidFileNumber(draft.file_number)
                    ? "text-destructive" : "text-muted-foreground"
                }`}>
                  {draft.file_number && !isValidFileNumber(draft.file_number)
                    ? t("fileNumberInvalid")
                    : t("fileNumberFormat")}
                </p>
              </Field>
              <Field label={t("name")}>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </Field>
              <Field label={t("nameAr")}>
                <Input dir="rtl" value={draft.name_ar} onChange={(e) => setDraft({ ...draft, name_ar: e.target.value })} />
              </Field>
              <Field label={t("dob")}>
                <Input type="date" value={draft.date_of_birth} onChange={(e) => setDraft({ ...draft, date_of_birth: e.target.value })} />
              </Field>
              <Field label={t("phone")}>
                <Input dir="ltr" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="+9665X XXX XXXX" />
              </Field>
              <Field label={t("city")}>
                <Input value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
              </Field>
              <Field label={t("cityAr")}>
                <Input dir="rtl" value={draft.city_ar} onChange={(e) => setDraft({ ...draft, city_ar: e.target.value })} />
              </Field>
              <Field label={t("email")} className="col-span-2">
                <Input dir="ltr" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              </Field>
              <Field label={t("notes")} className="col-span-2">
                <Textarea value={draft.notes} rows={3} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setEditing(null); setDraft(null); }}>{t("cancel")}</Button>
            <Button
              onClick={saveDraft}
              disabled={!draft || !draft.name.trim() || !isValidFileNumber(draft.file_number ?? "")}
            >
              {t("save")}
            </Button>
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

function GenderPill({ gender }: { gender: Gender }) {
  const { t } = useApp();
  const cls = gender === "male"
    ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
    : "bg-pink-500/15 text-pink-600 dark:text-pink-400";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {gender === "male" ? t("male") : t("female")}
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
