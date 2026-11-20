"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const AuthTokenContext = createContext("");
export function useMoneoToken() { return useContext(AuthTokenContext); }

type Session = { access_token: string; refresh_token: string; expires_at: number };
const sessionKey = "moneo-auth-session-v1";

type AuthState = "loading" | "signed-out" | "authorized" | "unconfigured";

async function verifyOwner(accessToken: string): Promise<void> {
  if (!url || !key) throw new Error("Conexão com Supabase não configurada.");
  const response = await fetch(url + "/rest/v1/rpc/is_moneo_owner", {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!response.ok) throw new Error("Não foi possível verificar a autorização de proprietário (HTTP " + response.status + ").");
  if ((await response.json()) !== true) throw new Error("Esta conta Google não está autorizada a acessar o MONEO. Confira o UID em Authentication → Users e moneo_owner.");
}

export default function MoneoAuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accessToken, setAccessToken] = useState("");

  const sessionRef = useRef<Session | null>(null);
  const refreshingRef = useRef<Promise<Session> | null>(null);
  const [sessionExpiry, setSessionExpiry] = useState(0);

  function acceptSession(session: Session) {
    sessionRef.current = session;
    window.localStorage.setItem(sessionKey, JSON.stringify(session));
    setAccessToken(session.access_token);
    setSessionExpiry(session.expires_at);
    setState("authorized");
    setError("");
  }

  function clearSession() {
    sessionRef.current = null;
    window.localStorage.removeItem(sessionKey);
    setAccessToken("");
    setSessionExpiry(0);
    setState("signed-out");
  }

  async function refreshSession(current: Session): Promise<Session> {
    if (refreshingRef.current) return refreshingRef.current;
    const pending = (async () => {
      const response = await fetch(url + "/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        headers: { apikey: key!, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: current.refresh_token }),
      });
      if (!response.ok) throw new Error("Sua sessão expirou. Entre novamente com Google.");
      const data = await response.json();
      const next: Session = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
      };
      await verifyOwner(next.access_token);
      acceptSession(next);
      return next;
    })();
    refreshingRef.current = pending;
    try { return await pending; } finally { refreshingRef.current = null; }
  }

  useEffect(() => {
    if (!url || !key) { setState("unconfigured"); return; }
    let cancelled = false;
    async function restore() {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const oauthToken = hash.get("access_token");
      const oauthRefresh = hash.get("refresh_token");
      const authError = hash.get("error_description") || hash.get("error");
      if (oauthToken || authError) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
      if (authError) {
        setError("Não foi possível concluir o login Google: " + authError.slice(0, 220));
        setState("signed-out");
        return;
      }
      try {
        if (oauthToken) {
          if (!oauthRefresh) throw new Error("O login não retornou uma sessão renovável. Entre novamente.");
          await verifyOwner(oauthToken);
          if (!cancelled) acceptSession({
            access_token: oauthToken,
            refresh_token: oauthRefresh,
            expires_at: Math.floor(Date.now()/1000) + Number(hash.get("expires_in") || 3600),
          });
          return;
        }
        const raw = window.localStorage.getItem(sessionKey);
        if (!raw) { if (!cancelled) setState("signed-out"); return; }
        const saved = JSON.parse(raw) as Session;
        if (!saved.access_token || !saved.refresh_token || !Number.isFinite(saved.expires_at))
          throw new Error("Sessão inválida.");
        if (saved.expires_at <= Date.now()/1000 + 90) {
          await refreshSession(saved);
        } else {
          await verifyOwner(saved.access_token);
          if (!cancelled) acceptSession(saved);
        }
      } catch (cause) {
        if (!cancelled) {
          clearSession();
          setError(cause instanceof Error ? cause.message : "Não foi possível restaurar sua sessão.");
        }
      }
    }
    void restore();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state !== "authorized" || !sessionExpiry) return;
    const delay = Math.max(1000, Math.min(2147483647, sessionExpiry * 1000 - Date.now() - 90000));
    const timer = window.setTimeout(() => {
      const current = sessionRef.current;
      if (current) void refreshSession(current).catch((cause: unknown) => {
        clearSession();
        setError(cause instanceof Error ? cause.message : "Sessão expirada.");
      });
    }, delay);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, sessionExpiry]);

  async function signOut() {
    const token = sessionRef.current?.access_token;
    clearSession();
    setError("");
    if (token && url && key) {
      try {
        await fetch(url + "/auth/v1/logout", {
          method: "POST",
          headers: { apikey: key, Authorization: "Bearer " + token },
        });
      } catch { /* O encerramento local já foi concluído. */ }
    }
  }

  function signInGoogle() {
    if (!url || !key) return;
    setBusy(true);
    setError("");
    // The redirect must be allowlisted in Supabase Authentication → URL Configuration.
    const redirectTo = window.location.origin + window.location.pathname;
    const destination = new URL(url + "/auth/v1/authorize");
    destination.searchParams.set("provider", "google");
    destination.searchParams.set("redirect_to", redirectTo);
    window.location.assign(destination.toString());
  }

  if (state === "authorized") return <AuthTokenContext.Provider value={accessToken}><div className="fixed right-3 top-3 z-[100]"><button type="button" onClick={() => void signOut()} className="rounded-xl border border-[#DCE4EF] bg-white/95 px-4 py-2 text-xs font-semibold text-[#263D59] shadow-md hover:bg-[#F5F8FC]">Sair</button></div>{children}</AuthTokenContext.Provider>;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#EDF3FA] via-[#F8FAFD] to-[#E7EFF9] px-5 py-10 text-[#263D59]">
      <section className="w-full max-w-md rounded-[32px] border border-white/90 bg-white/75 p-8 shadow-[0_24px_80px_rgba(52,77,111,0.12)] backdrop-blur-2xl sm:p-10">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#263D59] text-2xl text-white">✧</div>
          <div><h1 className="text-2xl font-semibold tracking-tight">MONEO</h1><p className="text-xs text-[#8494A8]">FINANCE · Acesso privado</p></div>
        </div>
        {state === "loading" ? <p className="text-sm text-[#72839A]">Verificando acesso seguro…</p> :
         state === "unconfigured" ? <p role="alert" className="text-sm leading-6 text-rose-700">Conexão com Supabase não configurada neste ambiente.</p> :
        <>
          <h2 className="mb-2 text-xl font-semibold">Bem-vindo de volta</h2>
          <p className="mb-7 text-sm text-[#72839A]">Entre com sua conta Google autorizada.</p>
          {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
          <button type="button" disabled={busy} onClick={signInGoogle} className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#DCE4EF] bg-white px-4 py-3 font-semibold text-[#263D59] shadow-sm transition hover:bg-[#F5F8FC] disabled:opacity-60">
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.27 5.48-4.81 7.18l7.73 6C44.37 38.03 46.98 31.88 46.98 24.55z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.2A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.92-2.13 15.89-5.8l-7.73-6c-2.14 1.44-4.88 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            {busy ? "Redirecionando…" : "Continuar com Google"}
          </button>
          <p className="mt-6 text-center text-xs leading-5 text-[#8999AC]">Acesso exclusivo do proprietário. Seus dados financeiros são armazenados no Supabase.</p>
        </>}
      </section>
    </main>
  );
}
