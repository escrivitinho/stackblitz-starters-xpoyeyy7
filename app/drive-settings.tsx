"use client";

import { useEffect, useRef, useState } from "react";

const CLIENT_ID = "268082285521-ibocgv8kmj8rsgvthd8svjlvp6cg8knm.apps.googleusercontent.com";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

type TokenResponse = { access_token?: string; expires_in?: number; error?: string; error_description?: string };
type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };
type GoogleIdentity = { accounts: { oauth2: { initTokenClient: (config: { client_id: string; scope: string; callback: (response: TokenResponse) => void; error_callback?: (error: { type: string }) => void }) => TokenClient; revoke: (token: string, callback: () => void) => void } } };
declare global { interface Window { google?: GoogleIdentity } }


const folders = [
  { label: "Extratos · Caixa", path: "FINANCEIRO / FINANCEIRO 2026 / EXTRATOS / CAIXA", format: "OFX" },
  { label: "Extratos · Inter", path: "FINANCEIRO / FINANCEIRO 2026 / EXTRATOS / INTER", format: "OFX" },
  { label: "Extratos · Nubank", path: "FINANCEIRO / FINANCEIRO 2026 / EXTRATOS / NUBANK", format: "OFX" },
  { label: "Faturas de cartões", path: "FINANCEIRO / FINANCEIRO 2026 / FATURAS", format: "CSV" },
];

export default function DriveSettings() {
  const [sdkReady, setSdkReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (window.google?.accounts.oauth2) { setSdkReady(true); return; }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => setSdkReady(Boolean(window.google?.accounts.oauth2));
    script.onerror = () => setError("Não foi possível carregar a autenticação Google.");
    document.head.appendChild(script);
    return () => { script.remove(); };
  }, []);

  function connect() {
    setError("");
    if (!window.google?.accounts.oauth2) { setError("Autenticação Google indisponível."); return; }
    setBusy(true);
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: (response) => {
          setBusy(false);
          if (response.error || !response.access_token) {
            setError(response.error_description || response.error || "Autorização não concluída.");
            return;
          }
          tokenRef.current = response.access_token;
          setConnected(true);
        },
        error_callback: (failure) => {
          setBusy(false);
          if (failure.type !== "popup_closed") setError("Falha na autorização: " + failure.type);
        },
      });
      client.requestAccessToken({ prompt: "consent" });
    } catch {
      setBusy(false);
      setError("Não foi possível iniciar a autenticação Google.");
    }
  }

  function disconnect() {
    const token = tokenRef.current;
    tokenRef.current = null;
    setConnected(false);
    if (token && window.google?.accounts.oauth2) window.google.accounts.oauth2.revoke(token, () => {});
  }

  return (
    <section className="mt-5 rounded-3xl border border-white/90 bg-white/65 p-6 shadow-sm backdrop-blur-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#26364D]">Google Drive</h2>
          <p className="mt-2 text-sm text-[#707780]">Preparação da sincronização manual de extratos e faturas.</p>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">{connected ? "Autorizado nesta sessão" : "Não conectado"}</span>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {connected ? (
          <button type="button" onClick={disconnect} className="rounded-xl border border-[#DCE5EF] bg-white/80 px-5 py-3 text-sm font-medium text-[#34383F]">Desconectar</button>
        ) : (
          <button type="button" disabled={!sdkReady || busy} onClick={connect} className="rounded-xl bg-[#34383F] px-5 py-3 text-sm font-medium text-white disabled:opacity-50">{busy ? "Aguardando autorização..." : "Conectar Google Drive"}</button>
        )}
        <p className="text-xs text-[#77879B]">A autorização permite leitura de todo o Drive, não apenas das pastas listadas. Nenhum arquivo será importado nesta etapa.</p>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
      {connected && <p role="status" className="mt-3 text-sm text-emerald-700">Autorização recebida nesta sessão. A sincronização ainda não está ativa.</p>}
      <div className="mt-5 rounded-2xl border border-[#E5EAF0] bg-white/70 p-4">
        <p className="text-sm font-semibold text-[#26364D]">Pastas planejadas</p>
        <p className="mt-1 text-xs text-[#77879B]">Estas pastas são apenas referências. Estas pastas ainda não foram verificadas; nenhum arquivo foi lido.</p>
        <div className="mt-3 space-y-3">
          {folders.map((folder) => (
            <div key={folder.path} className="flex flex-wrap items-start justify-between gap-2 border-t border-[#E5EAF0] pt-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#26364D]">{folder.label}</p>
                <p className="break-words text-xs text-[#77879B]">{folder.path}</p>
              </div>
              <span className="rounded-lg bg-[#F1F5F9] px-2 py-1 text-xs text-[#526F96]">{folder.format}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 rounded-2xl bg-[#F4F7FA] p-4">
        <p className="text-sm font-semibold text-[#26364D]">Próximas etapas</p>
        <p className="mt-2 text-sm leading-6 text-[#64748B]">Autorizar a conexão Google, localizar as pastas e conferir novos arquivos antes de importar. A autorização não ativa a sincronização.</p>
        <p className="mt-2 text-xs text-[#77879B]">A sincronização ainda não está ativa. Seus lançamentos continuam armazenados apenas neste navegador; mantenha backups JSON atualizados.</p>
      </div>
    </section>
  );
}
