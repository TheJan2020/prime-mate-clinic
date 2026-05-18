import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileText, Save, RotateCcw, Loader2, CheckCircle2, AlertTriangle,
  Eye, ChevronRight, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/lib/i18n";

export const Route = createFileRoute("/_app/call-center/whatsapp-templates")({
  component: WhatsAppTemplatesPage,
});

// Shape returned by GET /api/demo/clinic/whatsapp/templates.
type TemplateBody = {
  name:        string;
  description: string;
  variables:   string[];
  en:          string;
  ar:          string;
};

type TemplatesResponse = {
  ok:        boolean;
  order:     string[];
  templates: Record<string, TemplateBody>;
};

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "ok"; ts: number }
  | { kind: "err"; message: string };

function WhatsAppTemplatesPage() {
  const { t, lang } = useApp();
  const [data, setData]       = useState<TemplatesResponse | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [save, setSave]       = useState<SaveState>({ kind: "idle" });
  // Per-template draft text — keyed as "<id>:en" / "<id>:ar". Only
  // entries that diverge from the server copy get sent on Save.
  const [drafts, setDrafts]   = useState<Record<string, string>>({});
  // Which template cards are expanded.
  const [open, setOpen]       = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/demo/clinic/whatsapp/templates");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d: TemplatesResponse = await r.json();
      setData(d);
      setLoadErr(null);
    } catch (e: any) {
      setLoadErr(e?.message || "Failed to load templates");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // First load: open the first template by default so the user sees
  // *something* without having to click.
  useEffect(() => {
    if (data && Object.keys(open).length === 0) {
      const firstId = data.order?.[0];
      if (firstId) setOpen({ [firstId]: true });
    }
  }, [data, open]);

  const draftValue = (id: string, locale: "en" | "ar"): string => {
    const key = `${id}:${locale}`;
    if (key in drafts) return drafts[key];
    return data?.templates?.[id]?.[locale] ?? "";
  };

  const setDraft = (id: string, locale: "en" | "ar", value: string) => {
    setDrafts((prev) => ({ ...prev, [`${id}:${locale}`]: value }));
    if (save.kind !== "saving") setSave({ kind: "idle" });
  };

  const isDirty = (id: string, locale: "en" | "ar"): boolean => {
    const key = `${id}:${locale}`;
    if (!(key in drafts)) return false;
    return drafts[key] !== (data?.templates?.[id]?.[locale] ?? "");
  };

  const dirtyCount = useMemo(() => {
    if (!data) return 0;
    let n = 0;
    for (const tid of data.order || []) {
      if (isDirty(tid, "en")) n++;
      if (isDirty(tid, "ar")) n++;
    }
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, drafts]);

  const onSaveAll = async () => {
    if (!data || dirtyCount === 0 || save.kind === "saving") return;
    // Build the patch: only changed locales per id.
    const patch: Record<string, { en?: string; ar?: string }> = {};
    for (const tid of data.order || []) {
      const entry: { en?: string; ar?: string } = {};
      if (isDirty(tid, "en")) entry.en = drafts[`${tid}:en`];
      if (isDirty(tid, "ar")) entry.ar = drafts[`${tid}:ar`];
      if (Object.keys(entry).length) patch[tid] = entry;
    }
    setSave({ kind: "saving" });
    try {
      const r = await fetch("/api/demo/clinic/whatsapp/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ templates: patch }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (!d?.ok) throw new Error(d?.error || "save failed");
      // Server returns the merged view — adopt it and clear local drafts
      // for the keys we just saved.
      setData((prev) => prev ? { ...prev, templates: d.templates } : prev);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const tid of Object.keys(patch)) {
          if ("en" in patch[tid]) delete next[`${tid}:en`];
          if ("ar" in patch[tid]) delete next[`${tid}:ar`];
        }
        return next;
      });
      setSave({ kind: "ok", ts: Date.now() });
    } catch (e: any) {
      setSave({ kind: "err", message: e?.message || "save failed" });
    }
  };

  const onRevertOne = (id: string) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[`${id}:en`];
      delete next[`${id}:ar`];
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("callCenter")} · {t("whatsappTemplates" as never)}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Pre-canned WhatsApp messages the Live Agent fires during a call —
            booking confirmations, file numbers, clinic location. Each
            template has an English and an Arabic body; the agent picks
            the language based on the caller's language. <span
            className="font-mono text-xs">{`{variable}`}</span> placeholders
            are filled in from the tool result on the call.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {save.kind === "saving" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving…
            </span>
          )}
          {save.kind === "ok" && Date.now() - save.ts < 3000 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> Saved
            </span>
          )}
          {save.kind === "err" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs text-destructive">
              <AlertTriangle className="h-3 w-3" /> {save.message}
            </span>
          )}
          <Button
            variant="default" size="sm"
            disabled={dirtyCount === 0 || save.kind === "saving"}
            onClick={onSaveAll}
          >
            <Save className="me-1.5 h-3.5 w-3.5" />
            Save {dirtyCount > 0 ? `(${dirtyCount})` : ""}
          </Button>
        </div>
      </div>

      {loadErr && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadErr}
        </div>
      )}

      {!data ? (
        <div className="rounded-xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          Loading templates…
        </div>
      ) : (
        <div className="space-y-4">
          {(data.order || []).map((id) => {
            const tpl = data.templates[id];
            if (!tpl) return null;
            const isOpen = !!open[id];
            const dirtyEn = isDirty(id, "en");
            const dirtyAr = isDirty(id, "ar");
            return (
              <div key={id} className="rounded-xl border border-border bg-card">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-5 py-3 text-start"
                  onClick={() => setOpen((p) => ({ ...p, [id]: !p[id] }))}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {isOpen
                      ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate text-sm font-semibold text-foreground">
                      {tpl.name}
                    </span>
                    <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                      — {tpl.description}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-[11px]">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground">
                      {id}
                    </span>
                    {(dirtyEn || dirtyAr) && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
                        unsaved
                      </span>
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="space-y-4 border-t border-border px-5 py-4">
                    <VariableHints variables={tpl.variables} />

                    <div className="grid gap-4 lg:grid-cols-2">
                      <TemplateEditor
                        label="English"
                        dir="ltr"
                        value={draftValue(id, "en")}
                        onChange={(v) => setDraft(id, "en", v)}
                        dirty={dirtyEn}
                        previewVariables={SAMPLE_VARIABLES}
                      />
                      <TemplateEditor
                        label="العربية"
                        dir="rtl"
                        value={draftValue(id, "ar")}
                        onChange={(v) => setDraft(id, "ar", v)}
                        dirty={dirtyAr}
                        previewVariables={SAMPLE_VARIABLES}
                      />
                    </div>

                    {(dirtyEn || dirtyAr) && (
                      <div className="flex justify-end">
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => onRevertOne(id)}
                        >
                          <RotateCcw className="me-1.5 h-3.5 w-3.5" />
                          Revert this template
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Sample values used in the live preview so the operator can see what a
// rendered message looks like without having to send a test call. Stays
// in sync with the template defaults' {variables} list.
const SAMPLE_VARIABLES: Record<string, string> = {
  patient_name:        "Fahad Al-Otaibi",
  patient_name_ar:     "فهد العتيبي",
  file_number:         "A123456",
  appointment_id:      "APT-042",
  appointment_date:    "2026-05-19",
  appointment_time:    "14:30",
  previous_date:       "2026-05-19",
  previous_time:       "10:00",
  clinic_name:         "Cairo Cardio Center",
  clinic_name_ar:      "مركز القاهرة للقلب",
  clinic_location:     "Main Center - 1F - 28",
  clinic_location_ar:  "المركز الرئيسي - ط.١ - 28",
  maps_link:           "https://maps.app.goo.gl/example",
};


function interpolate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, key) =>
    (vars[key] ?? "").toString(),
  );
}


function TemplateEditor({
  label, dir, value, onChange, dirty, previewVariables,
}: {
  label: string;
  dir: "ltr" | "rtl";
  value: string;
  onChange: (v: string) => void;
  dirty: boolean;
  previewVariables: Record<string, string>;
}) {
  const [showPreview, setShowPreview] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
              unsaved
            </span>
          )}
          <Button
            type="button" variant="ghost" size="sm"
            onClick={() => setShowPreview((p) => !p)}
          >
            <Eye className="me-1.5 h-3.5 w-3.5" />
            {showPreview ? "Edit" : "Preview"}
          </Button>
        </div>
      </div>

      {showPreview ? (
        <div
          dir={dir}
          className="min-h-[12rem] whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground"
        >
          {interpolate(value, previewVariables) || (
            <span className="italic text-muted-foreground">(empty)</span>
          )}
        </div>
      ) : (
        <Textarea
          dir={dir}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={10}
          className="font-mono text-sm"
        />
      )}
    </div>
  );
}


function VariableHints({ variables }: { variables: string[] }) {
  if (!variables || variables.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Available placeholders
      </div>
      <div className="flex flex-wrap gap-1.5">
        {variables.map((v) => (
          <span
            key={v}
            className="rounded bg-card px-1.5 py-0.5 font-mono text-[10px] text-foreground border border-border"
          >
            {`{${v}}`}
          </span>
        ))}
      </div>
    </div>
  );
}
