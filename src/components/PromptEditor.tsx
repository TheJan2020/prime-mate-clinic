import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RotateCcw, Save, Copy, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/lib/i18n";
import {
  useStoredText, buildLiveStateBlock,
} from "@/lib/clinicLiveData";
import {
  SEED_DEPARTMENTS, SEED_PROVIDERS, SEED_SLOT_OVERRIDES,
  getSeedAppointments, useDemoCollection,
  type Appointment, type ClinicSlotOverride, type Department, type Provider,
} from "@/lib/demoStore";

interface Props {
  heading: string;
  description: string;
  storageKey: string;
  defaultText: string;
}

export function PromptEditor({ heading, description, storageKey, defaultText }: Props) {
  const { t, lang } = useApp();
  const { value: saved, set: save, reset } = useStoredText(storageKey, defaultText);
  // Local draft so the textarea is responsive without flushing to storage on every keystroke.
  const [draft, setDraft] = useState<string>(saved);
  useEffect(() => { setDraft(saved); }, [saved]);
  const dirty = draft !== saved;

  // Live data feeds the auto-generated block.
  const { items: clinics }      = useDemoCollection<Department>("departments", SEED_DEPARTMENTS);
  const { items: providers }    = useDemoCollection<Provider>("providers", SEED_PROVIDERS);
  const { items: appointments } = useDemoCollection<Appointment>("appointments", getSeedAppointments);
  const { items: overrides }    = useDemoCollection<ClinicSlotOverride>("slot_overrides", SEED_SLOT_OVERRIDES);

  const liveBlock = useMemo(
    () => buildLiveStateBlock({ clinics, providers, appointments, overrides, lang }),
    [clinics, providers, appointments, overrides, lang],
  );

  const compiled = `${saved.trim()}\n\n${liveBlock}`.trim();
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(compiled);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked — ignore */ }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{heading}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty
            ? <span className="text-xs text-amber-600 dark:text-amber-400">● {t("unsavedChanges")}</span>
            : <span className="text-xs text-muted-foreground">{t("saved")}</span>}
          <Button variant="outline" onClick={reset}>
            <RotateCcw className="me-2 h-4 w-4" />
            {t("resetToDefault")}
          </Button>
          <Button onClick={() => save(draft)} disabled={!dirty}>
            <Save className="me-2 h-4 w-4" />
            {t("save")}
          </Button>
        </div>
      </div>

      {/* Editable section */}
      <Collapsible
        title={t("editableSection")}
        meta={`${draft.length.toLocaleString()} chars`}
      >
        <div className="p-4">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={18}
            dir="auto"
            className="resize-y font-mono text-[12.5px] leading-relaxed"
          />
        </div>
      </Collapsible>

      {/* Live state preview */}
      <Collapsible
        title={t("liveStatePreview")}
        meta={`${liveBlock.length.toLocaleString()} chars · auto`}
      >
        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap p-4 font-mono text-[12px] leading-relaxed text-muted-foreground" dir="auto">
{liveBlock}
        </pre>
      </Collapsible>

      {/* Full compiled prompt */}
      <Collapsible
        title={t("compiledPrompt")}
        meta={`${compiled.length.toLocaleString()} chars`}
        headerExtra={
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onCopy(); }}>
            {copied ? <Check className="me-1.5 h-3.5 w-3.5" /> : <Copy className="me-1.5 h-3.5 w-3.5" />}
            {copied ? t("copied") : t("copyPrompt")}
          </Button>
        }
      >
        <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap p-4 font-mono text-[12px] leading-relaxed text-foreground" dir="auto">
{compiled}
        </pre>
      </Collapsible>
    </div>
  );
}

/** Card with a clickable header that expands/collapses the body. Closed
 * by default so all three sections start tidy and the page is short. */
function Collapsible({
  title, meta, headerExtra, children,
}: {
  title: string;
  meta?: string;
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 border-b border-border bg-card px-5 py-3 text-start hover:bg-accent/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
          />
          <h2 className="text-sm font-semibold text-card-foreground">{title}</h2>
        </div>
        <div className="flex items-center gap-3">
          {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
          {headerExtra}
        </div>
      </button>
      {open && children}
    </div>
  );
}
