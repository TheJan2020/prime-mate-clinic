import { createFileRoute, redirect } from "@tanstack/react-router";

// Visiting /call-center directly should land on the first sub-page. The
// sidebar shows the Call Center group as a collapsible parent (not a link),
// so this redirect just covers manual URL entry or stale bookmarks.
export const Route = createFileRoute("/_app/call-center")({
  beforeLoad: () => {
    throw redirect({ to: "/call-center/knowledge-base" });
  },
});
