"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { ApiError, authenticatedRequest } from "@/services/api";
import type { CreditBalance } from "@/services/contracts";

type CreditContextValue = {
  balance: CreditBalance | null;
  loading: boolean;
  error: string;
  refresh: () => void;
};
const CreditContext = createContext<CreditContextValue | null>(null);

export function CreditProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [state, setState] = useState<{
    userId?: string; balance: CreditBalance | null; error: string; loading: boolean;
  }>({ userId, balance: null, error: "", loading: Boolean(userId) });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setState({ userId, balance: null, error: "", loading: Boolean(userId) });
      if (!userId) return;
      try {
        let balance: CreditBalance;
        try {
          balance = await authenticatedRequest<CreditBalance>("credits");
        } catch (failure) {
          if (
            !(failure instanceof ApiError) ||
            failure.code !== "ACCOUNT_NOT_FOUND"
          ) {
            throw failure;
          }
          // This idempotent fallback repairs accounts verified before the
          // UserVerified outbox event was delivered.
          balance = await authenticatedRequest<CreditBalance>("credits", {});
        }
        if (active) setState({ userId, balance, error: "", loading: false });
      } catch (failure) {
        if (!active) return;
        const error = failure instanceof Error ? failure.message : "Unable to load your credits.";
        setState({ userId, balance: null, error, loading: false });
      }
    });
    return () => { active = false; };
  }, [userId, attempt]);

  function refresh() {
    if (!userId) return;
    setState({ userId, balance: null, error: "", loading: true });
    setAttempt((current) => current + 1);
  }

  // Never show a previous identity's balance while a new session is loading.
  const current = state.userId === userId ? state : {
    balance: null, error: "", loading: Boolean(userId),
  };
  return <CreditContext.Provider value={{ ...current, refresh }}>{children}</CreditContext.Provider>;
}

export function useCredits() {
  const credits = useContext(CreditContext);
  if (!credits) throw new Error("CreditProvider is required.");
  return credits;
}
