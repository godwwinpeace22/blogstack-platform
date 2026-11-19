import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? "https://blogstack-app.hidden-silence-2d18.workers.dev",

  // Include the session cookie for local and same-origin production requests.
  fetchOptions: {
    credentials: "include",
  },
});

export const { signIn, signUp, signOut, useSession } = authClient;
