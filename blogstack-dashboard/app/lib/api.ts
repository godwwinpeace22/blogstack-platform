import { BlogStackClient } from "@blogstack/sdk";
// Production serves the dashboard and API together. A developer's .env.local
// must never send production sessions or API requests to their local server.
export const apiBase = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL ?? window.location.origin)
  : window.location.origin;
export const api = new BlogStackClient({ baseUrl: apiBase });
