import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/Placeholder";
import { useApp } from "@/lib/i18n";

export const Route = createFileRoute("/_app/call-center/knowledge-base")({
  component: KnowledgeBasePage,
});

function KnowledgeBasePage() {
  const { t } = useApp();
  return <Placeholder title={`${t("callCenter")} · ${t("knowledgeBase")}`} />;
}
