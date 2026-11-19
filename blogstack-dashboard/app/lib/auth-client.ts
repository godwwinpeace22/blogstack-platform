import { apiBase } from "./api";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: apiBase,

  // Include the session cookie for local and same-origin production requests.
  fetchOptions: {
    credentials: "include",
  },
});

export const { signIn, signUp, signOut, useSession } = authClient;
