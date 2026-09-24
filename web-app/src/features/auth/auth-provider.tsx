"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ApiError,
  authenticatedRequest,
  request,
  sessionLock,
} from "@/services/api";
import type { Profile } from "@/services/contracts";

type AuthContextValue = {
  user: Profile | null;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  login: (email: string, password: string) => Promise<Profile>;
  logout: () => Promise<void>;
  updatePhoneNumber: (phoneNumber: string) => Promise<void>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

function broadcast() {
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("foc-auth");
    channel.postMessage("changed");
    channel.close();
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const revision = useRef(0);
  const reload = useCallback(async () => {
    const current = ++revision.current;
    try {
      const profile = await authenticatedRequest<Profile>("auth/session");
      if (current !== revision.current) return;
      setUser(profile);
      setError("");
    } catch (failure) {
      if (current !== revision.current) return;
      setUser(null);
      setError(
        failure instanceof ApiError && failure.status === 401
          ? ""
          : failure instanceof Error
            ? failure.message
            : "Unable to load your account.",
      );
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(reload);
    const onFocus = () => {
      void reload();
    };
    window.addEventListener("focus", onFocus);
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("foc-auth")
        : null;
    if (channel) channel.onmessage = onFocus;
    return () => {
      window.removeEventListener("focus", onFocus);
      channel?.close();
    };
  }, [reload]);

  async function login(email: string, password: string) {
    const profile = await sessionLock(async () => {
      await request("auth/login", { email, password });
      const profile = await request<Profile>("auth/session");
      revision.current++;
      setUser(profile);
      setLoading(false);
      setError("");
      return profile;
    });
    broadcast();
    return profile;
  }
  async function logout() {
    await sessionLock(async () => {
      await request("auth/logout", {});
      revision.current++;
      setUser(null);
      setLoading(false);
      setError("");
    });
    broadcast();
  }
  async function updatePhoneNumber(phoneNumber: string) {
    const profile = await authenticatedRequest<Profile>(
      "auth/phone-number",
      { phoneNumber },
      "PATCH",
    );
    revision.current++;
    setUser((current) => (current?.id === profile.id ? profile : current));
    broadcast();
  }
  async function changePassword(currentPassword: string, newPassword: string) {
    await authenticatedRequest(
      "auth/password",
      { currentPassword, newPassword },
      "PATCH",
    );
    revision.current++;
    setUser(null);
    setError("");
    broadcast();
  }
  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        reload,
        login,
        logout,
        updatePhoneNumber,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("AuthProvider is required.");
  return auth;
}
