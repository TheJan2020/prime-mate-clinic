import { createFileRoute } from "@tanstack/react-router";
import { PromptEditor } from "@/components/PromptEditor";
import { DEFAULT_KB } from "@/lib/clinicLiveData";
import { useApp } from "@/lib/i18n";

export const Route = createFileRoute("/_app/call-center/knowledge-base")({
  component: KnowledgeBasePage,
});

function KnowledgeBasePage() {
  const { t } = useApp();
  return (
    <PromptEditor
      heading={t("kbHeading")}
      description={t("kbDesc")}
      storageKey="kb"
      defaultText={DEFAULT_KB}
    />
  );
}
