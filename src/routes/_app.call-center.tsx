import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

// Parent layout for /call-center/* — must render an <Outlet/> so the
// sub-routes (knowledge-base, persona) actually appear. The redirect only
// fires when the URL is EXACTLY /call-center (no sub-path), otherwise it
// would loop indefinitely on every child navigation.
export const Route = createFileRoute("/_app/call-center")({
  beforeLoad: ({ location }) => {
    const p = location.pathname.replace(/\/+$/, "");
    if (p === "/call-center") {
      throw redirect({ to: "/call-center/dashboard" });
    }
  },
  component: () => <Outlet />,
});
