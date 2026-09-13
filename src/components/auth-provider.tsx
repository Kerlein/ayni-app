"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isConfigured, api } from "@/lib/supabase-browser";
import type { Profile } from "@/lib/types";
type Auth = {
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++revision.current;
    if (!isConfigured()) {
      setLoading(false);
      return;
    }
    try {
      const {
        data: { session: s },
      } = await supabase().auth.getSession();
      if (current !== revision.current) return;
      setSession(s);
      if (s) {
        const p = await api<Profile>("/api/me");
        if (current === revision.current) {
          setProfile(p);
          setError("");
        }
      } else {
        setProfile(null);
        setError("");
      }
    } catch (e) {
      if (current === revision.current) {
        setProfile(null);
        setError(
          e instanceof Error ? e.message : "No se pudo cargar tu perfil.",
        );
      }
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    void refresh();
    if (!isConfigured()) return;
    const {
      data: { subscription },
    } = supabase().auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        revision.current++;
        setProfile(null);
        setLoading(false);
      } else {
        clearTimeout(timer);
        timer = setTimeout(() => void refresh(), 0);
      }
    });
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  const logout = async () => {
    const { error: e } = await supabase().auth.signOut({ scope: "local" });
    if (e) throw e;
    revision.current++;
    setProfile(null);
    setSession(null);
    window.location.assign("/login");
  };
  return (
    <Context.Provider
      value={{ profile, session, loading, error, refresh, logout }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("AuthProvider requerido");
  return value;
}
