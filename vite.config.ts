import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Expose the dev server on the LAN (phone testing) — http://<lan-ip>:5174
  server: { host: true, port: 5174, strictPort: true },
  build: {
    // Keep Meteocons weather SVGs as real files (not inlined data-URIs) so their
    // SMIL <animate> reliably plays inside <img> and they get precached for offline.
    assetsInlineLimit: (file) => (file.includes("@meteocons") ? false : undefined),
  },
  plugins: [
    react(),
    tailwindcss(),
    cloudflare(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "โซลาร์บ้านคุณนิก",
        short_name: "โซลาร์",
        description: "ดูข้อมูลระบบโซลาร์เซลล์แบบเรียลไทม์",
        lang: "th",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#f5f5f6",
        theme_color: "#f5f5f6",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: {
        // Precache everything needed to render fully offline — including the bundled
        // Meteocons weather SVGs and any fonts/images (default only globs js/css/html).
        globPatterns: ["**/*.{js,css,html,svg,webp,png,ico,woff,woff2}"],
        // Never serve the SPA shell for API calls; let them hit the Worker.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: { cacheName: "google-fonts", expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: { cacheName: "gstatic-fonts", expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
