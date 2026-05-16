import { createFileRoute } from "@tanstack/react-router";
import { Placeholder } from "@/components/Placeholder";
import { useApp } from "@/lib/i18n";

export const Route = createFileRoute("/_app/patients")({
  component: PageComponent,
});

function PageComponent() {
  const { t } = useApp();
  return <Placeholder title={t("patients")} />;
}
