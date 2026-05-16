import { Construction } from "lucide-react";

export function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl text-primary-foreground"
        style={{ background: "var(--gradient-brand)" }}
      >
        <Construction className="h-7 w-7" />
      </div>
      <h1 className="mt-4 text-2xl font-semibold text-foreground">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        This section is coming soon. The dashboard and login are wired up — let us know which module to build next.
      </p>
    </div>
  );
}