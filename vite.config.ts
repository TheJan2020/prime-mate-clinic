// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// SPA build: we ship this app as static files mounted at /demo/clinic/ inside
// the PWDemoMaster FastAPI server. Specifics:
//   - spa.enabled + prerender.outputPath = "index.html" so the build emits a
//     real index.html with TanStack hydration markers (without it the page
//     renders blank because hydrateRoot bails silently).
//   - base = "/demo/clinic/" so the built asset URLs (script src, css href,
//     manifest preloads) resolve under the mounted path.
//   - cloudflare = false because we don't deploy as a Workers app.
//
// Server entry override (server: { entry: "server" }) keeps our SSR error
// wrapper in src/server.ts in the loop even though we ultimately ship the
// dist/client folder.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
    spa: {
      enabled: true,
      prerender: { outputPath: "index.html" },
    },
  },
  cloudflare: false,
  vite: {
    base: "/demo/clinic/",
  },
});
