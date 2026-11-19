import { BlogStackClient } from "@blogstack/sdk";

export const api = new BlogStackClient({
  baseUrl: import.meta.env.VITE_API_URL ?? "https://blogstack-app.hidden-silence-2d18.workers.dev",
});
