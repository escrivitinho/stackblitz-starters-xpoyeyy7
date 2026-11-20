"use client";

import { useEffect, useState, type ReactNode } from "react";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

type AuthState = "loading" | "signed-out" | "authorized" | "unconfigured";

export default function MoneoAuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // A sessão é intencionalmente temporária nesta primeira etapa.
    // Nenhuma informação financeira é enviada ao Supabase ainda.
    setState(url && key ? "signed-out" : "unconfigured");
  }, []);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url || !key) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url + "/auth/v1/token?grant_type=password", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await response.json();
      if (!response.ok || !data.access_token) {
        const code = typeof data.code === "string" ? data.code : "";
        const message = typeof data.msg === "string" ? data.msg : typeof data.error_description === "string" ? data.error_description : typeof data.message === "string" ? data.message : "";
        if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) {
          throw new Error("O Supabase recusou as credenciais. Confira o e-mail e a senha cadastrados em Authentication → Users. Se necessário, redefina a senha desse usuário no Supabase.");
        }
        if (code === "email_not_confirmed" || /email not confirmed/i.test(message)) {
          throw new Error("O e-mail do usuário ainda não foi confirmado no Supabase. Confirme-o em Authentication → Users.");
        }
        if (response.status === 429) throw new Error("Muitas tentativas de login. Aguarde alguns minutos antes de tentar novamente.");
        throw new Error("O Supabase recusou o login (HTTP " + response.status + "). " + (code ? "Código: " + code + ". " : "") + (message ? "Detalhe: " + message.slice(0, 240) : "Confira a configuração de autenticação em Authentication → Users e Logs."));
      }
      // O usuário precisa estar explicitamente cadastrado em moneo_owner.
      const ownerResponse = await fetch(url + "/rest/v1/rpc/is_moneo_owner", {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: "Bearer " + data.access_token,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      if (!ownerResponse.ok) {
        throw new Error("Login aceito, mas não foi possível consultar a autorização de proprietário (HTTP " + ownerResponse.status + "). Verifique as permissões da função is_moneo_owner.");
      }
      if ((await ownerResponse.json()) !== true) {
        throw new Error("Login aceito, mas esta conta não está autorizada na tabela moneo_owner.");
      }
      setPassword("");
      setState("authorized");
    } catch (cause) {
      setError(cause instanceof TypeError ? "Não foi possível conectar ao Supabase. Confira a URL do projeto e a conexão de rede." : cause instanceof Error ? cause.message : "Não foi possível autenticar.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "authorized") {
    return <>{children}</>;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#EDF3FA] via-[#F8FAFD] to-[#E7EFF9] px-5 py-10 text-[#263D59]">
      <section className="w-full max-w-md rounded-[32px] border border-white/90 bg-white/75 p-8 shadow-[0_24px_80px_rgba(52,77,111,0.12)] backdrop-blur-2xl sm:p-10">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#263D59] text-2xl text-white">✧</div>
          <div><h1 className="text-2xl font-semibold tracking-tight">MONEO</h1><p className="text-xs text-[#8494A8]">FINANCE · Acesso privado</p></div>
        </div>
        {state === "loading" ? <p className="text-sm text-[#72839A]">Preparando acesso seguro…</p> :
         state === "unconfigured" ? <p role="alert" className="text-sm leading-6 text-rose-700">A conexão com o Supabase ainda não está configurada neste ambiente. Verifique as variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.</p> :
        <>
          <h2 className="mb-2 text-xl font-semibold">Bem-vindo de volta</h2>
          <p className="mb-7 text-sm text-[#72839A]">Entre com sua conta autorizada no Supabase.</p>
          <form onSubmit={login} className="space-y-4">
            <label className="block text-sm font-medium">E-mail<input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-[#DCE4EF] bg-white/80 px-4 py-3 outline-none focus:border-[#6E8BAF]" /></label>
            <label className="block text-sm font-medium">Senha<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-[#DCE4EF] bg-white/80 px-4 py-3 outline-none focus:border-[#6E8BAF]" /></label>
            {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
            <button disabled={busy} type="submit" className="w-full rounded-xl bg-[#263D59] px-4 py-3 font-semibold text-white transition hover:bg-[#1D3048] disabled:opacity-60">{busy ? "Verificando acesso…" : "Entrar no MONEO"}</button>
          </form>
          <p className="mt-6 text-center text-xs leading-5 text-[#8999AC]">Acesso exclusivo do proprietário. Nesta etapa, seus dados financeiros continuam somente no navegador.</p>
        </>}
      </section>
    </main>
  );
}
