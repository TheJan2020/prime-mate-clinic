import { createFileRoute } from "@tanstack/react-router";
import { PromptEditor } from "@/components/PromptEditor";
import { DEFAULT_PERSONA } from "@/lib/clinicLiveData";
import { useApp } from "@/lib/i18n";

export const Route = createFileRoute("/_app/call-center/persona")({
  component: PersonaPage,
});

function PersonaPage() {
  const { t } = useApp();
  return (
    <PromptEditor
      heading={t("personaHeading")}
      description={t("personaDesc")}
      storageKey="persona"
      defaultText={DEFAULT_PERSONA}
      showLivePreview={false}
    />
  );
}
