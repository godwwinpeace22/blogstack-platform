import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AccessibleAccount } from "@blogstack/sdk";
import { api } from "./api";
interface AccountContextValue {
  accounts: AccessibleAccount[];
  activeId: string;
  select: (id: string) => Promise<void>;
}
const AccountContext = React.createContext<AccountContextValue | null>(null);
export function AccountProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = React.useState<{
    accounts: AccessibleAccount[];
    activeId: string;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let active = true;
    void (async () => {
      await queryClient.cancelQueries();
      if (!active) return;
      queryClient.clear();
      api.setSession(userId);
      api.setAccount(undefined);
      const accounts = await api.accounts.list();
      if (!active) return;
      let stored: string | null = null;
      try {
        stored = sessionStorage.getItem("blogstack.account." + userId);
      } catch {
        /* unavailable storage */
      }
      const id =
        accounts.find((a) => a.id === stored)?.id ??
        accounts.find((a) => a.ownerId === userId)?.id ??
        accounts[0]?.id;
      if (!id) throw new Error("No workspace is available");
      api.setAccount(id);
      setValue({ accounts, activeId: id });
    })().catch((cause) => {
      if (active)
        setError(
          cause instanceof Error
            ? cause.message
            : "Workspace could not be loaded",
        );
    });
    return () => {
      active = false;
    };
  }, [userId, queryClient]);
  async function select(id: string) {
    if (!value?.accounts.some((a) => a.id === id)) return;
    await queryClient.cancelQueries();
    queryClient.clear();
    api.setAccount(id);
    try {
      sessionStorage.setItem("blogstack.account." + userId, id);
    } catch {
      /* unavailable storage */
    }
    setValue({ ...value, activeId: id });
  }
  if (error)
    return (
      <div role="alert" className="p-8">
        <p>{error}</p>
        <button
          className="mt-4 underline"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </div>
    );
  if (!value)
    return (
      <p role="status" className="p-8">
        Loading workspace…
      </p>
    );
  return (
    <AccountContext.Provider value={{ ...value, select }}>
      {children}
    </AccountContext.Provider>
  );
}
export function useActiveAccount() {
  const context = React.useContext(AccountContext);
  if (!context) throw new Error("Workspace context is missing");
  return context;
}
