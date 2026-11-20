"use client";

import { useEffect, useRef, useState } from "react";
import type { Category } from "./categories-manager";
import type { Transaction } from "./transactions";
import { parseNubankCsv, type CardEntry } from "./cards-manager";

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
function bankForPath(path: string): string {
  const parts = path.split(" / ");
  const bank = folders.find((folder) => folder.format === "OFX" && (path === folder.path || path.startsWith(folder.path + " / ")));
  return bank?.path.split(" / ").pop() || parts[parts.length - 1];
}
function isBankOfx(file: FileResult): boolean {
  return file.name.toLowerCase().endsWith(".ofx") && folders.some((folder) => folder.format === "OFX" && (file.folderPath === folder.path || file.folderPath.startsWith(folder.path + " / ")));
}

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
    const rawAmount = field(block, "TRNAMT").replace(/\s/g, "");
    // Alguns OFX da Caixa usam ponto tanto para milhar quanto para decimal: 1.683.00.
    // Aceitar apenas formatos numéricos conhecidos, sem arredondar valores ambíguos.
    let normalizedAmount = rawAmount;
    if (/^[+-]?\d{1,3}(?:\.\d{3})+\.\d{2}$/.test(rawAmount)) normalizedAmount = rawAmount.replace(/\./g, "").replace(/(\d{2})$/, ".$1");
    else if (/^[+-]?\d{1,3}(?:\.\d{3})+,\d{2}$/.test(rawAmount)) normalizedAmount = rawAmount.replace(/\./g, "").replace(",", ".");
    else if (/^[+-]?\d+,\d{1,2}$/.test(rawAmount)) normalizedAmount = rawAmount.replace(",", ".");
    const amount = /^[+-]?\d+(?:\.\d{1,2})?$/.test(normalizedAmount) ? Number(normalizedAmount) : NaN;
    const date = rawDate.slice(0, 8);
    if (!/^\d{8}$/.test(date) || !Number.isFinite(amount) || !rawAmount) continue;
    const description = field(block, "MEMO") || field(block, "NAME") || field(block, "TRNTYPE") || "Sem descrição";
    entries.push({ date: date.slice(6, 8) + "/" + date.slice(4, 6) + "/" + date.slice(0, 4), description, amount, fitid: field(block, "FITID") });
  }
  return entries;
}

export default function DriveSettings({ transactions, accounts, categories, onImport, onPending, onCardCsv, cardEntries, onCardImport }: { transactions: Transaction[]; accounts: Array<{ id: number; name: string }>; categories: Category[]; onImport: (items: Transaction[]) => void; onPending: (items: Transaction[]) => void; onCardCsv: (file: File) => void; cardEntries: CardEntry[]; onCardImport: (items: CardEntry[]) => void }) {
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
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");
  const [syncSummary, setSyncSummary] = useState("");
  const [syncSkippedFiles, setSyncSkippedFiles] = useState<string[]>([]);
  const [syncEmptyFiles, setSyncEmptyFiles] = useState<string[]>([]);
  const [auditing, setAuditing] = useState(false);
  const [auditProgress, setAuditProgress] = useState("");
  const [auditResults, setAuditResults] = useState<Array<{ id: string; name: string; bank: string; total: number; pending: number; existing: number; review: number; empty?: boolean; error?: string }> | null>(null);
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
    setAuditResults(null);
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
          void runAutomaticImport(response.access_token);
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


  async function runAutomaticImport(token: string) {
    setSyncProgress("Autorização concluída. Localizando pastas...");
    const located = await checkFolders(token);
    if (!located) { setSyncProgress(""); return; }
    const missing = folders.filter(folder => folder.format === "OFX" && !located.some(result => result.path === folder.path && result.status === "found"));
    if (missing.length) { setError("Não foi possível localizar todas as pastas bancárias: " + missing.map(folder => folder.label).join(", ") + ". Nenhuma importação automática foi iniciada."); setSyncProgress(""); return; }
    setSyncProgress("Pastas localizadas. Procurando extratos...");
    const discovered = await checkFiles(located, token);
    if (!discovered) { setSyncProgress(""); return; }
    await syncAllOfx(located, discovered, token);
    await syncCardInvoices(discovered, token);
  }

  async function checkFolders(authorizedToken?: string): Promise<FolderResult[] | null> {
    const token = authorizedToken ?? tokenRef.current;
    if (!token) return null;
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
      return output;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao localizar pastas.");
      return null;
    } finally {
      setChecking(false);
    }
  }


  async function checkFiles(folderResults?: FolderResult[], authorizedToken?: string): Promise<FileResult[] | null> {
    const token = authorizedToken ?? tokenRef.current;
    const resolvedFolders = folderResults ?? results;
    if (!token || !resolvedFolders) return null;
    setLoadingFiles(true);
    setError("");
    setFiles(null);
    setAuditResults(null);
    try {
      const output: FileResult[] = [];
      const collectFiles = async (folderId: string, folderPath: string, format: string, depth: number): Promise<void> => {
        let pageToken: string | undefined;
        do {
          const params = new URLSearchParams({
            q: "'" + folderId + "' in parents and trashed = false",
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
            if (file.mimeType === "application/vnd.google-apps.folder") {
              // Somente subpastas de ano, evitando ler documentos de outras organizações.
              if (depth === 0 && /^20\d{2}$/.test(file.name)) {
                await collectFiles(file.id, folderPath + " / " + file.name, format, depth + 1);
              }
              continue;
            }
            if (!file.name.toLowerCase().endsWith("." + format.toLowerCase())) continue;
            output.push({ id: file.id, name: file.name, size: file.size, modifiedTime: file.modifiedTime, folderPath });
          }
          pageToken = data.nextPageToken;
        } while (pageToken);
      };
      for (const folder of folders) {
        const found = resolvedFolders.find((item) => item.path === folder.path);
        if (!found?.id || found.status !== "found") continue;
        await collectFiles(found.id, folder.path, folder.format, 0);
      }
      output.sort((a, b) => (b.modifiedTime || "").localeCompare(a.modifiedTime || ""));
      setFiles(output);
      return output;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível listar os arquivos.");
      return null;
    } finally {
      setLoadingFiles(false);
    }
  }


  async function openCardCsv(file: FileResult) {
    const token=tokenRef.current;
    if(!token)return;
    setLoadingPreview(true);setError("");
    try {
      if(!/^nubank[_ -]/i.test(file.name))throw new Error("Formato do cartão ainda não reconhecido. Por enquanto, apenas CSV Nubank é suportado.");
      const response=await fetch("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(file.id)+"?alt=media",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
      if(!response.ok)throw new Error("Não foi possível ler a fatura do Drive (HTTP "+response.status+").");
      const blob=await response.blob();
      if(blob.size>3*1024*1024)throw new Error("A fatura excede 3 MB.");
      onCardCsv(new File([blob],file.name,{type:"text/csv"}));
    }catch(e){setError(e instanceof Error?e.message:"Erro ao carregar fatura.");}
    finally{setLoadingPreview(false);}
  }

  async function syncCardInvoices(discovered: FileResult[], token: string) {
    const invoices=discovered.filter(file=>file.name.toLowerCase().endsWith(".csv") && file.folderPath.includes(" / FATURAS"));
    const known=new Set(cardEntries.map(entry=>entry.importKey));
    const additions:CardEntry[]=[];
    let duplicates=0;
    const skipped:string[]=[];
    for(let i=0;i<invoices.length;i++){
      const file=invoices[i];
      setSyncProgress("Lendo fatura "+(i+1)+" de "+invoices.length+": "+file.name);
      if(!/^nubank[_ -]/i.test(file.name)){skipped.push(file.name+" (cartão não reconhecido)");continue;}
      try{
        if(file.size && Number(file.size)>3*1024*1024)throw new Error("Arquivo acima de 3 MB");
        const response=await fetch("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(file.id)+"?alt=media",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
        if(!response.ok)throw new Error("HTTP "+response.status);
        const raw=await response.text();
        if(raw.length>3*1024*1024)throw new Error("Arquivo acima de 3 MB");
        for(const item of parseNubankCsv(raw)){
          if(known.has(item.importKey)){duplicates++;continue;}
          known.add(item.importKey);
          additions.push({...item,id:crypto.randomUUID()});
        }
      }catch(e){skipped.push(file.name+" ("+(e instanceof Error?e.message:"erro de leitura")+")");}
    }
    if(additions.length)onCardImport(additions);
    setSyncSummary(previous=>previous+" Faturas: "+additions.length+" movimentações novas · "+duplicates+" já importadas · "+skipped.length+" arquivos não processados.");
    if(skipped.length)setSyncSkippedFiles(previous=>[...previous,...skipped]);
    setSyncProgress("");
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
      if (!entries.length) throw new Error("Este OFX não contém movimentações STMTTRN para importar. Pode ser um extrato sem lançamentos.");
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

  async function auditOfxFiles() {
    const token = tokenRef.current;
    if (!token || !files || auditing || syncing) return;
    const bankFiles = files.filter((file) => isBankOfx(file));
    setAuditing(true);
    setError("");
    setAuditResults(null);
    const output: Array<{ id: string; name: string; bank: string; total: number; pending: number; existing: number; review: number; empty?: boolean; error?: string }> = [];
    const norm = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
    const seenIds = new Set<string>();
    const seenDetails = new Set<string>();
    for (const transaction of transactions) {
      if (transaction.type === "transfer") continue;
      if (transaction.source === "ofx" && transaction.externalId) seenIds.add(transaction.accountId + "|" + transaction.externalId);
      seenDetails.add([transaction.accountId, transaction.date, transaction.type, transaction.amountCents, norm(transaction.description)].join("|"));
    }
    try {
      for (let i = 0; i < bankFiles.length; i++) {
        const file = bankFiles[i];
        const bank = bankForPath(file.folderPath);
        setAuditProgress("Analisando " + (i + 1) + "/" + bankFiles.length + ": " + file.name);
        const account = accounts.find((item) => item.name.toLocaleUpperCase("pt-BR") === bank.toLocaleUpperCase("pt-BR"));
        try {
          if (!account) throw new Error("Conta não identificada");
          if (file.size && Number(file.size) > 5 * 1024 * 1024) throw new Error("Arquivo acima de 5 MB");
          const response = await fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(file.id) + "?alt=media", {
            headers: { Authorization: "Bearer " + token }, cache: "no-store",
          });
          if (!response.ok) throw new Error("Falha ao ler arquivo (HTTP " + response.status + ")");
          const buffer = await response.arrayBuffer();
          if (buffer.byteLength > 5 * 1024 * 1024) throw new Error("Arquivo acima de 5 MB");
          const bytes = new Uint8Array(buffer);
          const utf8 = new TextDecoder("utf-8").decode(bytes);
          const raw = utf8.includes("\uFFFD") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
          if (!/<OFX>/i.test(raw)) throw new Error("Formato OFX inválido");
          const entries = parseOfx(raw);
          const blocks = (raw.match(/<STMTTRN\b/gi) || []).length;
          if (blocks === 0) { output.push({ id: file.id, name: file.name, bank, total: 0, pending: 0, existing: 0, review: 0, empty: true }); continue; }
          if (entries.length !== blocks) throw new Error("Leitura incompleta: " + entries.length + " de " + blocks + " movimentações reconhecidas");
          let pending = 0, existing = 0, review = 0;
          for (const entry of entries) {
            const date = entry.date.slice(6, 10) + "-" + entry.date.slice(3, 5) + "-" + entry.date.slice(0, 2);
            const type = entry.amount >= 0 ? "income" : "expense";
            const cents = Math.round(Math.abs(entry.amount) * 100);
            const idKey = account.id + "|" + entry.fitid;
            const detailKey = [account.id, date, type, cents, norm(entry.description)].join("|");
            if (entry.fitid && seenIds.has(idKey)) existing++;
            else if (seenDetails.has(detailKey) || !entry.fitid) review++;
            else pending++;
            if (entry.fitid) seenIds.add(idKey);
            seenDetails.add(detailKey);
          }
          output.push({ id: file.id, name: file.name, bank, total: entries.length, pending, existing, review });
        } catch (cause) {
          output.push({ id: file.id, name: file.name, bank, total: 0, pending: 0, existing: 0, review: 0, error: cause instanceof Error ? cause.message : "Erro desconhecido" });
        }
      }
      setAuditResults(output);
    } finally {
      setAuditing(false);
      setAuditProgress("");
    }
  }

  async function syncAllOfx(folderResults?: FolderResult[], discoveredFiles?: FileResult[], authorizedToken?: string) {
    const token = authorizedToken ?? tokenRef.current;
    const resolvedFolders = folderResults ?? results;
    const resolvedFiles = discoveredFiles ?? files;
    const bankFolders = folders.filter((folder) => folder.format === "OFX");
    if (!token || !resolvedFiles || !resolvedFolders || syncing) return;
    if (!bankFolders.every((folder) => resolvedFolders.some((result) => result.path === folder.path && result.status === "found"))) {
      setError("Localize as três pastas bancárias antes de sincronizar.");
      return;
    }
    const bankFiles = resolvedFiles.filter((file) => isBankOfx(file));
    if (!bankFiles.length) { setError("Nenhum extrato OFX disponível."); return; }
    setSyncing(true);
    setError("");
    setSyncSummary("");
    setSyncSkippedFiles([]);
    setSyncEmptyFiles([]);
    let ignored = 0;
    let reviewed = 0;
    const staged: Transaction[] = [];
    const pending: Transaction[] = [];
    const skippedFiles: string[] = [];
    const emptyFiles: string[] = [];
    const normalizeText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
    const keyFor = (date: string, type: string, amountCents: number, description: string, accountId: number) =>
      [accountId, date, type, amountCents, normalizeText(description)].join("|");
    const knownIds = new Set<string>();
    const knownDetails = new Set<string>();
    for (const transaction of transactions) {
      if (transaction.type === "transfer") continue;
      if (transaction.source === "ofx" && transaction.externalId) knownIds.add(transaction.accountId + "|" + transaction.externalId);
      knownDetails.add(keyFor(transaction.date, transaction.type, transaction.amountCents, transaction.description, transaction.accountId));
    }
    try {
      for (let index = 0; index < bankFiles.length; index++) {
        const file = bankFiles[index];
        setSyncProgress("Lendo extrato " + (index + 1) + " de " + bankFiles.length + ": " + file.name);
        const accountName = bankForPath(file.folderPath);
        const account = accounts.find((item) => item.name.toLocaleUpperCase("pt-BR") === accountName?.toLocaleUpperCase("pt-BR"));
        if (!account) throw new Error("Conta bancária não identificada para " + file.name + ". Nada foi importado.");
        if (file.size && Number(file.size) > 5 * 1024 * 1024) throw new Error("Arquivo acima de 5 MB: " + file.name + ". Nada foi importado.");
        const response = await fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(file.id) + "?alt=media", {
          headers: { Authorization: "Bearer " + token }, cache: "no-store",
        });
        if (!response.ok) throw new Error("Erro ao ler " + file.name + " (" + response.status + "). Nada foi importado.");
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > 5 * 1024 * 1024) throw new Error("Arquivo acima de 5 MB: " + file.name + ". Nada foi importado.");
        const bytes = new Uint8Array(buffer);
        const utf8 = new TextDecoder("utf-8").decode(bytes);
        const raw = utf8.includes("\uFFFD") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
        if (!/<OFX>/i.test(raw)) throw new Error("OFX inválido: " + file.name + ". Nada foi importado.");
        const entries = parseOfx(raw);
        const blockCount = (raw.match(/<STMTTRN\b/gi) || []).length;
        if (blockCount === 0) { emptyFiles.push(account.name + " / " + file.name); continue; }
        if (entries.length !== blockCount) { skippedFiles.push(account.name + " / " + file.name + ": leitura incompleta (" + entries.length + "/" + blockCount + ")"); continue; }
        for (const entry of entries) {
          const date = entry.date.slice(6, 10) + "-" + entry.date.slice(3, 5) + "-" + entry.date.slice(0, 2);
          const amountCents = Math.round(Math.abs(entry.amount) * 100);
          const type = entry.amount >= 0 ? "income" : "expense";
          const idKey = entry.fitid ? account.id + "|" + entry.fitid : "";
          const detailKey = keyFor(date, type, amountCents, entry.description, account.id);
          if (idKey && knownIds.has(idKey)) { ignored++; continue; }
          const possibleDuplicate = knownDetails.has(detailKey);
          const missingFitid = !entry.fitid;
          const category = categories.find((item) => item.type === type && item.name === "Outros") || categories.find((item) => item.type === type);
          if (possibleDuplicate || missingFitid) {
            reviewed++;
            pending.push({ id: 0, date, type, accountId: account.id, amountCents, description: entry.description, group: category?.name || "Outros", subcategory: category?.subcategories[0]?.name || "Outros", categoryId: category?.id, subcategoryId: category?.subcategories[0]?.id, source: "ofx", externalId: entry.fitid || undefined, importHash: file.id + ":" + (entry.fitid || detailKey) });
            continue;
          }
          staged.push({
            id: 0, date, type, accountId: account.id, amountCents,
            description: entry.description, group: category?.name || "Outros",
            subcategory: category?.subcategories[0]?.name || "Outros",
            categoryId: category?.id, subcategoryId: category?.subcategories[0]?.id,
            source: "ofx", externalId: entry.fitid, importHash: file.id + ":" + entry.fitid,
          });
          knownIds.add(idKey);
          knownDetails.add(detailKey);
        }
      }
      if (staged.length) {
        const firstId = Math.max(Date.now(), ...transactions.map((item) => item.id + 1));
        onImport(staged.map((item, index) => ({ ...item, id: firstId + index })));
      }
      if (pending.length) onPending(pending.map((item, index) => ({ ...item, id: Date.now() + staged.length + index + 1000 })));
      setSyncSkippedFiles(skippedFiles);
      setSyncEmptyFiles(emptyFiles);
      setSyncSummary(staged.length + " movimentações importadas · " + ignored + " já importadas · " + reviewed + " enviadas para Pendentes verificação · " + skippedFiles.length + " arquivos com erro de leitura · " + emptyFiles.length + " extratos processados sem movimentações.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha na sincronização. Nada foi importado.");
    } finally {
      setSyncProgress("");
      setSyncing(false);
    }
  }

  const previewAccount = preview ? accounts.find((account) =>
    bankForPath(preview.folderPath)?.toLocaleUpperCase("pt-BR") === account.name.toLocaleUpperCase("pt-BR")
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
        <p className="text-xs text-[#77879B]">A autorização permite leitura de todo o Drive, não apenas das pastas listadas. Após autorizar, os extratos OFX das pastas configuradas serão sincronizados automaticamente. Duplicidades suspeitas irão para revisão.</p>
      </div>
      {connected && <div className="mt-4"><button type="button" disabled={checking} onClick={() => void checkFolders()} className="rounded-xl bg-[#34383F] px-5 py-3 text-sm font-medium text-white disabled:opacity-50">{checking ? "Procurando pastas..." : "Localizar pastas no Drive"}</button><p className="mt-2 text-xs text-[#77879B]">Consulta apenas nomes e identificadores de pastas. Não lê nem importa arquivos financeiros.</p></div>}
      {results?.some((item) => item.status === "found") && <div className="mt-4"><button type="button" disabled={checking || loadingFiles} onClick={() => void checkFiles()} className="rounded-xl border border-[#DCE5EF] bg-white/80 px-5 py-3 text-sm font-medium text-[#34383F] disabled:opacity-50">{loadingFiles ? "Verificando arquivos..." : "Verificar arquivos"}</button><p className="mt-2 text-xs text-[#77879B]">Exibe metadados de OFX nas pastas dos bancos e nas subpastas anuais (2026, 2027 etc.), além dos CSV de faturas, sem baixar o conteúdo.</p></div>}
      {files && <div className="mt-4 rounded-2xl border border-[#DCE5EF] bg-white/90 p-4"><h3 className="text-sm font-semibold text-[#26364D]">Arquivos pendentes de importação</h3><p className="mt-1 text-xs text-[#77879B]">Analisa todos os extratos OFX sem importar nenhuma movimentação. Identifica arquivos pendentes, parcialmente importados e com problemas de leitura.</p><button type="button" disabled={auditing || syncing || !connected} onClick={() => void auditOfxFiles()} className="mt-3 rounded-xl border border-[#DCE5EF] px-4 py-2 text-sm font-medium disabled:opacity-50">{auditing ? "Verificando extratos..." : "Verificar arquivos não importados"}</button>{auditProgress && <p role="status" className="mt-2 text-xs text-[#526F96]">{auditProgress}</p>}{auditResults && <div className="mt-3 max-h-96 overflow-auto"><p className="mb-2 text-xs font-semibold text-[#26364D]">{auditResults.filter((item) => item.pending > 0).length} arquivos com movimentações novas · {auditResults.filter((item) => Boolean(item.error)).length} arquivos com erro · {auditResults.filter((item) => item.review > 0).length} arquivos com movimentações para revisão</p><table className="w-full min-w-[550px] text-left text-xs"><thead><tr className="border-b"><th className="py-2">Banco</th><th>Arquivo</th><th>Novas</th><th>Existentes</th><th>Revisar</th><th>Situação</th></tr></thead><tbody>{auditResults.map((item) => <tr key={item.id} className="border-b border-[#EEF2F6]"><td className="py-2">{item.bank}</td><td>{item.name}</td><td>{item.pending}</td><td>{item.existing}</td><td>{item.review}</td><td>{item.error ? "Erro: " + item.error : item.empty ? "Sem movimentações" : item.pending > 0 && item.existing > 0 ? "Parcial" : item.pending > 0 ? "Pendente" : item.review > 0 ? "Revisar" : "Sem pendências"}</td></tr>)}</tbody></table></div>}</div>}
      {files && <div className="mt-4 rounded-2xl border border-[#DCE5EF] bg-white/90 p-4"><h3 className="text-sm font-semibold text-[#26364D]">Sincronização de extratos bancários</h3><p className="mt-1 text-xs text-[#77879B]">Verifica todos os OFX de Caixa, Inter e Nubank, evita importações repetidas e não importa movimentações suspeitas. Faturas CSV não estão incluídas.</p><button type="button" disabled={syncing || loadingFiles || checking || !connected} onClick={() => void syncAllOfx()} className="mt-3 rounded-xl bg-[#34383F] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{syncing ? "Sincronizando..." : "Sincronizar todos os extratos OFX"}</button>{syncProgress && <p role="status" className="mt-2 text-xs text-[#526F96]">{syncProgress}</p>}{syncSummary && <p role="status" className="mt-2 text-sm text-emerald-700">{syncSummary}</p>}{syncEmptyFiles.length > 0 && <div className="mt-2 text-xs text-emerald-700"><p className="font-semibold">Processados — sem movimentações:</p><ul className="mt-1 list-disc pl-5">{syncEmptyFiles.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}{syncSkippedFiles.length > 0 && <div className="mt-2 text-xs text-amber-800"><p className="font-semibold">Arquivos com erro de leitura:</p><ul className="mt-1 list-disc pl-5">{syncSkippedFiles.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}</div>}
      {files && <div className="mt-5 rounded-2xl border border-[#E5EAF0] bg-white/70 p-4"><h3 className="text-sm font-semibold text-[#26364D]">Arquivos encontrados ({files.length})</h3>{files.length === 0 ? <p className="mt-3 text-sm text-[#77879B]">Nenhum arquivo OFX ou CSV encontrado nas pastas correspondentes.</p> : <div className="mt-3 max-h-96 space-y-2 overflow-y-auto">{files.map((file) => <div key={file.id} className="border-t border-[#E5EAF0] pt-2"><div className="flex flex-wrap items-center justify-between gap-2"><p className="break-all text-sm font-medium text-[#26364D]">{file.name}</p>{file.name.toLowerCase().endsWith(".csv") && <button type="button" disabled={loadingPreview} onClick={()=>void openCardCsv(file)} className="rounded-lg border border-[#DCE5EF] px-3 py-1 text-xs font-medium text-[#34383F] disabled:opacity-50">Prévia da fatura</button>}{file.name.toLowerCase().endsWith(".ofx") && <button type="button" disabled={loadingPreview} onClick={() => void previewOfx(file)} className="rounded-lg border border-[#DCE5EF] px-3 py-1 text-xs font-medium text-[#34383F] disabled:opacity-50">{loadingPreview ? "Lendo..." : "Prévia OFX"}</button>}</div><p className="text-xs text-[#77879B]">{folders.find((folder) => folder.path === file.folderPath)?.label} · {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString("pt-BR") : "Data indisponível"} · {file.size ? (Number(file.size) / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " KB" : "Tamanho indisponível"}</p></div>)}</div>}</div>}
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
