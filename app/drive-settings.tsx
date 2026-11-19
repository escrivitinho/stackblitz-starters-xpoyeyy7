"use client";

import { useEffect, useRef, useState } from "react";
import type { Category } from "./categories-manager";
import type { Transaction } from "./transactions";

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


type FolderResult = { path: string; status: "found" | "missing" | "ambiguous"; id?: string };
type FileResult = { id: string; name: string; size?: string; modifiedTime?: string; folderPath: string };
type DriveItem = { id: string; name: string };

async function findFolder(token: string, parent: string, name: string): Promise<DriveItem[]> {
  const matches: DriveItem[] = [];
  let pageToken: string | undefined;
  do {
    const escaped = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const query = "'" + parent + "' in parents and name = '" + escaped + "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
    const params = new URLSearchParams({ q: query, fields: "nextPageToken,files(id,name)", pageSize: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch("https://www.googleapis.com/drive/v3/files?" + params.toString(), {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(response.status === 401 ? "A sessão expirou. Desconecte e conecte novamente." : "Erro ao consultar o Drive (" + response.status + ").");
    const data = await response.json() as { files?: DriveItem[]; nextPageToken?: string };
    matches.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return matches;
}


type OfxEntry = { date: string; description: string; amount: number; fitid: string };
function parseOfx(raw: string): OfxEntry[] {
  const entries: OfxEntry[] = [];
  const blocks = raw.match(/<STMTTRN\b[^>]*>[\s\S]*?(?:<\/STMTTRN>|(?=<STMTTRN\b)|$)/gi) || [];
  const field = (block: string, tag: string) => {
    const match = block.match(new RegExp("<" + tag + ">\\s*([^<\\r\\n]+)", "i"));
    return match?.[1]?.trim() || "";
  };
  for (const block of blocks) {
    const rawDate = field(block, "DTPOSTED");
    const rawAmount = field(block, "TRNAMT").replace(",", ".");
    const amount = Number(rawAmount);
    const date = rawDate.slice(0, 8);
    if (!/^\d{8}$/.test(date) || !Number.isFinite(amount) || !rawAmount) continue;
    const description = field(block, "MEMO") || field(block, "NAME") || field(block, "TRNTYPE") || "Sem descrição";
    entries.push({ date: date.slice(6, 8) + "/" + date.slice(4, 6) + "/" + date.slice(0, 4), description, amount, fitid: field(block, "FITID") });
  }
  return entries;
}

export default function DriveSettings({ transactions, accounts, categories, onImport }: { transactions: Transaction[]; accounts: Array<{ id: number; name: string }>; categories: Category[]; onImport: (items: Transaction[]) => void }) {
  const [sdkReady, setSdkReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tokenRef = useRef<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<FolderResult[] | null>(null);
  const [files, setFiles] = useState<FileResult[] | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [preview, setPreview] = useState<{ fileId: string; fileName: string; folderPath: string; entries: OfxEntry[]; skipped: number } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [importNotice, setImportNotice] = useState("");

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
    setFiles(null);
    setPreview(null);
    setSelectedRows([]);
    setImportNotice("");
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
    setResults(null);
    setFiles(null);
    if (token && window.google?.accounts.oauth2) window.google.accounts.oauth2.revoke(token, () => {});
  }


  async function checkFolders() {
    const token = tokenRef.current;
    if (!token) return;
    setChecking(true);
    setError("");
    setResults(null);
    setFiles(null);
    try {
      const cache = new Map<string, DriveItem[]>();
      const output: FolderResult[] = [];
      for (const folder of folders) {
        let parent = "root";
        let status: FolderResult["status"] = "found";
        for (const name of folder.path.split(" / ")) {
          const key = parent + "/" + name;
          let matches = cache.get(key);
          if (!matches) {
            matches = await findFolder(token, parent, name);
            cache.set(key, matches);
          }
          if (matches.length === 0) { status = "missing"; break; }
          if (matches.length > 1) { status = "ambiguous"; break; }
          parent = matches[0].id;
        }
        output.push({ path: folder.path, status, id: status === "found" ? parent : undefined });
      }
      setResults(output);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao localizar pastas.");
    } finally {
      setChecking(false);
    }
  }


  async function checkFiles() {
    const token = tokenRef.current;
    if (!token || !results) return;
    setLoadingFiles(true);
    setError("");
    setFiles(null);
    try {
      const output: FileResult[] = [];
      for (const folder of folders) {
        const found = results.find((item) => item.path === folder.path);
        if (!found?.id || found.status !== "found") continue;
        let pageToken: string | undefined;
        do {
          const params = new URLSearchParams({
            q: "'" + found.id + "' in parents and trashed = false",
            fields: "nextPageToken,files(id,name,size,modifiedTime,mimeType)",
            pageSize: "100",
          });
          if (pageToken) params.set("pageToken", pageToken);
          const response = await fetch("https://www.googleapis.com/drive/v3/files?" + params.toString(), {
            headers: { Authorization: "Bearer " + token },
            cache: "no-store",
          });
          if (!response.ok) throw new Error(response.status === 401 ? "Sua autorização expirou. Reconecte o Google Drive." : "Erro ao listar arquivos (" + response.status + ").");
          const data = await response.json() as { nextPageToken?: string; files?: Array<{ id: string; name: string; size?: string; modifiedTime?: string; mimeType?: string }> };
          for (const file of data.files || []) {
            if (file.mimeType === "application/vnd.google-apps.folder") continue;
            if (!file.name.toLowerCase().endsWith("." + folder.format.toLowerCase())) continue;
            output.push({ id: file.id, name: file.name, size: file.size, modifiedTime: file.modifiedTime, folderPath: folder.path });
          }
          pageToken = data.nextPageToken;
        } while (pageToken);
      }
      output.sort((a, b) => (b.modifiedTime || "").localeCompare(a.modifiedTime || ""));
      setFiles(output);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível listar os arquivos.");
    } finally {
      setLoadingFiles(false);
    }
  }


  async function previewOfx(file: FileResult) {
    const token = tokenRef.current;
    if (!token) return;
    setLoadingPreview(true);
    setPreview(null);
    setError("");
    try {
      const response = await fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(file.id) + "?alt=media", {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(response.status === 401 ? "Sua autorização expirou. Reconecte o Google Drive." : "Erro ao ler OFX (" + response.status + ").");
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > 5 * 1024 * 1024) throw new Error("Arquivo acima de 5 MB. Prévia não disponível.");
      const bytes = new Uint8Array(buffer);
      const utf8 = new TextDecoder("utf-8").decode(bytes);
      const raw = utf8.includes("\uFFFD") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
      if (!/<OFX>/i.test(raw)) throw new Error("O arquivo não parece ser um OFX válido.");
      const entries = parseOfx(raw);
      if (!entries.length) throw new Error("Não foram encontradas transações STMTTRN válidas neste OFX.");
      const blocks = raw.match(/<STMTTRN>/gi) || [];
      setPreview({ fileId: file.id, fileName: file.name, folderPath: file.folderPath, entries, skipped: blocks.length - entries.length });
      setSelectedRows([]);
      setImportNotice("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar prévia OFX.");
    } finally {
      setLoadingPreview(false);
    }
  }

  const previewAccount = preview ? accounts.find((account) =>
    preview.folderPath.split(" / ").pop()?.toLocaleUpperCase("pt-BR") === account.name.toLocaleUpperCase("pt-BR")
  ) : undefined;
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const classified = preview?.entries.map((entry) => {
    const date = entry.date.slice(6, 10) + "-" + entry.date.slice(3, 5) + "-" + entry.date.slice(0, 2);
    const cents = Math.round(Math.abs(entry.amount) * 100);
    const type = entry.amount >= 0 ? "income" : "expense";
    const sameAccount = transactions.filter((t) =>
      t.type !== "transfer" && t.accountId === previewAccount?.id
    );
    const exact = Boolean(entry.fitid && sameAccount.some((t) => t.source === "ofx" && t.externalId === entry.fitid));
    const similar = sameAccount.some((t) => t.date === date && t.amountCents === cents &&
      t.type === type && normalize(t.description) === normalize(entry.description));
    return { ...entry, status: exact ? "duplicate" : similar ? "possible" : "new" };
  }) || [];
  const countStatus = (status: string) => classified.filter((entry) => entry.status === status).length;

  const safeRows = classified.map((entry, index) => {
    if (entry.status !== "new") return false;
    const earlier = classified.slice(0, index);
    return !earlier.some((other) => (entry.fitid && other.fitid && entry.fitid === other.fitid) ||
      (other.date === entry.date && other.amount === entry.amount && normalize(other.description) === normalize(entry.description)));
  });
  function importSelected() {
    if (!preview || !previewAccount || selectedRows.length === 0) return;
    const chosen = selectedRows.filter((index) => safeRows[index] && classified[index]?.status === "new");
    if (!chosen.length) return;
    const confirmed = window.confirm("Importar " + chosen.length + " movimentações para " + previewAccount.name + "? Esta ação altera seus lançamentos locais.");
    if (!confirmed) return;
    const baseId = Math.max(Date.now(), ...transactions.map((t) => t.id + 1));
    const items: Transaction[] = chosen.map((index, offset) => {
      const entry = classified[index];
      const type = entry.amount >= 0 ? "income" : "expense";
      const category = categories.find((c) => c.type === type && c.name === "Outros") || categories.find((c) => c.type === type);
      return {
        id: baseId + offset,
        type,
        accountId: previewAccount.id,
        date: entry.date.slice(6, 10) + "-" + entry.date.slice(3, 5) + "-" + entry.date.slice(0, 2),
        amountCents: Math.round(Math.abs(entry.amount) * 100),
        description: entry.description,
        group: category?.name || "Outros",
        subcategory: category?.subcategories[0]?.name || "Outros",
        categoryId: category?.id,
        subcategoryId: category?.subcategories[0]?.id,
        source: "ofx",
        externalId: entry.fitid || undefined,
        importHash: preview.fileId + ":" + index,
      };
    });
    onImport(items);
    setSelectedRows([]);
    setImportNotice(items.length + " movimentações importadas. Revise as categorias em Lançamentos.");
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
      {connected && <div className="mt-4"><button type="button" disabled={checking} onClick={() => void checkFolders()} className="rounded-xl bg-[#34383F] px-5 py-3 text-sm font-medium text-white disabled:opacity-50">{checking ? "Procurando pastas..." : "Localizar pastas no Drive"}</button><p className="mt-2 text-xs text-[#77879B]">Consulta apenas nomes e identificadores de pastas. Não lê nem importa arquivos financeiros.</p></div>}
      {results?.some((item) => item.status === "found") && <div className="mt-4"><button type="button" disabled={checking || loadingFiles} onClick={() => void checkFiles()} className="rounded-xl border border-[#DCE5EF] bg-white/80 px-5 py-3 text-sm font-medium text-[#34383F] disabled:opacity-50">{loadingFiles ? "Verificando arquivos..." : "Verificar arquivos"}</button><p className="mt-2 text-xs text-[#77879B]">Exibe somente metadados de OFX e CSV nas pastas encontradas, sem baixar o conteúdo.</p></div>}
      {files && <div className="mt-5 rounded-2xl border border-[#E5EAF0] bg-white/70 p-4"><h3 className="text-sm font-semibold text-[#26364D]">Arquivos encontrados ({files.length})</h3>{files.length === 0 ? <p className="mt-3 text-sm text-[#77879B]">Nenhum arquivo OFX ou CSV encontrado nas pastas correspondentes.</p> : <div className="mt-3 max-h-96 space-y-2 overflow-y-auto">{files.map((file) => <div key={file.id} className="border-t border-[#E5EAF0] pt-2"><div className="flex flex-wrap items-center justify-between gap-2"><p className="break-all text-sm font-medium text-[#26364D]">{file.name}</p>{file.name.toLowerCase().endsWith(".ofx") && <button type="button" disabled={loadingPreview} onClick={() => void previewOfx(file)} className="rounded-lg border border-[#DCE5EF] px-3 py-1 text-xs font-medium text-[#34383F] disabled:opacity-50">{loadingPreview ? "Lendo..." : "Prévia OFX"}</button>}</div><p className="text-xs text-[#77879B]">{folders.find((folder) => folder.path === file.folderPath)?.label} · {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString("pt-BR") : "Data indisponível"} · {file.size ? (Number(file.size) / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " KB" : "Tamanho indisponível"}</p></div>)}</div>}</div>}
      {preview && <div className="mt-4 rounded-2xl border border-[#DCE5EF] bg-white/90 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-[#26364D]">Prévia: {preview.fileName}</h3><button type="button" onClick={() => (setPreview(null), setSelectedRows([]), setImportNotice(""))} className="text-xs text-[#526F96]">Fechar prévia</button></div><p className="mt-2 text-xs text-[#77879B]">{preview.entries.length} movimentações reconhecidas{preview.skipped > 0 ? " · " + preview.skipped + " ignoradas por dados inválidos" : ""}. Apenas leitura: nenhuma movimentação foi importada.</p><p className="mt-2 text-xs font-medium text-[#526F96]">{previewAccount ? "Conta: " + previewAccount.name + " · " + countStatus("new") + " novas · " + countStatus("possible") + " possíveis duplicidades · " + countStatus("duplicate") + " já importadas" : "Conta não identificada: comparação indisponível."}</p><div className="mt-3 max-h-80 overflow-auto"><table className="w-full min-w-[420px] text-left text-xs"><thead><tr className="border-b border-[#E5EAF0] text-[#64748B]"><th className="py-2">Selecionar</th><th className="py-2">Data</th><th>Descrição</th><th className="text-right">Valor</th><th className="pl-3">Situação</th></tr></thead><tbody>{classified.slice(0, 100).map((entry, index) => <tr key={index} className="border-b border-[#EEF2F6]"><td className="py-2"><input type="checkbox" aria-label={"Selecionar movimentação " + (index + 1)} disabled={!previewAccount || !safeRows[index]} checked={selectedRows.includes(index)} onChange={(event) => setSelectedRows((current) => event.target.checked ? [...current, index] : current.filter((n) => n !== index))} /></td><td className="py-2 whitespace-nowrap">{entry.date}</td><td className="py-2">{entry.description}</td><td className="py-2 text-right whitespace-nowrap">{entry.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td><td className="py-2 pl-3 whitespace-nowrap">{!previewAccount ? "Não verificado" : entry.status === "duplicate" ? "Já importada" : entry.status === "possible" ? "Possível duplicidade" : "Nova"}</td></tr>)}</tbody></table></div>{preview.entries.length > 100 && <p className="mt-2 text-xs text-[#77879B]">Exibindo as primeiras 100 movimentações.</p>}<div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" disabled={!previewAccount} onClick={() => setSelectedRows(classified.map((_, i) => i).filter((i) => safeRows[i]))} className="rounded-lg border border-[#DCE5EF] px-3 py-2 text-xs disabled:opacity-50">Selecionar novas</button><button type="button" onClick={() => setSelectedRows([])} className="text-xs text-[#526F96]">Limpar seleção</button><button type="button" disabled={selectedRows.length === 0 || !previewAccount} onClick={importSelected} className="rounded-lg bg-[#34383F] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Importar selecionadas ({selectedRows.length})</button></div><p className="mt-2 text-xs text-[#77879B]">Possíveis duplicidades e movimentações já importadas ficam bloqueadas. A classificação inicial é Outros e pode ser revisada depois.</p>{importNotice && <p role="status" className="mt-2 text-sm text-emerald-700">{importNotice}</p>}</div>}
      {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
      {connected && <p role="status" className="mt-3 text-sm text-emerald-700">Autorização recebida nesta sessão. A sincronização ainda não está ativa.</p>}
      <div className="mt-5 rounded-2xl border border-[#E5EAF0] bg-white/70 p-4">
        <p className="text-sm font-semibold text-[#26364D]">Pastas planejadas</p>
        <p className="mt-1 text-xs text-[#77879B]">As pastas serão verificadas quando você clicar em Localizar pastas. Nenhum arquivo financeiro será lido.</p>
        <div className="mt-3 space-y-3">
          {folders.map((folder) => (
            <div key={folder.path} className="flex flex-wrap items-start justify-between gap-2 border-t border-[#E5EAF0] pt-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#26364D]">{folder.label}</p>
                <p className="break-words text-xs text-[#77879B]">{folder.path}</p>
              </div>
              <div className="flex items-center gap-2">
                {results && <span className="text-xs font-medium text-[#526F96]">{results.find((item) => item.path === folder.path)?.status === "found" ? "Localizada" : results.find((item) => item.path === folder.path)?.status === "ambiguous" ? "Nome duplicado" : "Não localizada"}</span>}
                <span className="rounded-lg bg-[#F1F5F9] px-2 py-1 text-xs text-[#526F96]">{folder.format}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 rounded-2xl bg-[#F4F7FA] p-4">
        <p className="text-sm font-semibold text-[#26364D]">Próximas etapas</p>
        <p className="mt-2 text-sm leading-6 text-[#64748B]">Localizar as pastas no Drive e depois conferir novos arquivos antes de importar. A sincronização ainda não está ativa.</p>
        <p className="mt-2 text-xs text-[#77879B]">A sincronização ainda não está ativa. Seus lançamentos continuam armazenados apenas neste navegador; mantenha backups JSON atualizados.</p>
      </div>
    </section>
  );
}
