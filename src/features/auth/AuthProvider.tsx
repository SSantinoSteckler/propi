"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";

import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
const AuthContext = createContext<{
  session: Session | null;
  loading: boolean;
}>({ session: null, loading: true });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) {
          setSession(data.session);
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
export function Protected({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);
  if (loading) return <div className="page skeleton">Cargando tu espacio…</div>;
  if (!session)
    return <div className="page skeleton">Abriendo el inicio de sesión…</div>;
  return children;
}
