import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./index.css";

// autoUpdate reloads the page once a new service worker takes over — but a phone only
// LOOKS for one on a fresh navigation. An installed app is mostly resumed from the
// background, so also check whenever it comes back to the foreground and every 30 min.
const UPDATE_EVERY_MS = 30 * 60 * 1000;
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const check = () => { if (navigator.onLine) reg.update().catch(() => {}); };
    document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
    setInterval(check, UPDATE_EVERY_MS);
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
