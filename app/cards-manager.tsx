"use client";

import { useState } from "react";
import { formatCents } from "./lib/money";

export type CardEntry = {
  id: string;
  card: "Nubank Crédito" | "Inter Crédito";
  date: string;
  description: string;
  amountCents: number;
  importKey: string;
};

type Draft = Omit<CardEntry, "id">;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (c === "," && !quoted) { row.push(field); field = ""; }
    else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && source[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  if (quoted) throw new Error("CSV com aspas não fechadas.");
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function parseAmount(raw: string): number {
  const cleaned = raw.trim().replace(/\s/g, "").replace(/^R\$/, "");
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error("Valor inválido: " + raw);
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents)) throw new Error("Valor fora do limite.");
  return cents;
}

function parseNubankCsv(text: string): Draft[] {
  const rows = parseCsv(text);
  const header = rows.shift()?.map((cell) => cell.trim().toLowerCase());
  if (!header) throw new Error("Arquivo vazio.");
  const dateIndex = header.indexOf("date"), titleIndex = header.indexOf("title"), amountIndex = header.indexOf("amount");
  if (dateIndex < 0 || titleIndex < 0 || amountIndex < 0) throw new Error("Este CSV não possui as colunas date, title e amount do Nubank.");
  const occurrences = new Map<string, number>();
  return rows.map((row, index) => {
    const date = (row[dateIndex] ?? "").trim();
    const description = (row[titleIndex] ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date) throw new Error("Data inválida na linha " + (index + 2));
    if (!description) throw new Error("Descrição vazia na linha " + (index + 2));
    const amountCents = parseAmount(row[amountIndex] ?? "");
    const signature = JSON.stringify([date, description, amountCents]);
    const occurrence = (occurrences.get(signature) ?? 0) + 1;
    occurrences.set(signature, occurrence);
    return { card: "Nubank Crédito" as const, date, description, amountCents, importKey: "nubank-csv:" + signature + ":" + occurrence };
  });
}

export default function CardsManager({ entries, onChange }: { entries: CardEntry[]; onChange: (entries: CardEntry[]) => void }) {
  const [preview, setPreview] = useState<Draft[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const existing = new Set(entries.map((entry) => entry.importKey));
  const newEntries = preview.filter((entry) => !existing.has(entry.importKey));
  async function loadFile(file?: File) {
    setError(""); setMessage(""); setPreview([]); setFileName("");
    if (!file) return;
    try {
      if (file.size > 3 * 1024 * 1024) throw new Error("O CSV excede 3 MB.");
      const parsed = parseNubankCsv(await file.text());
      if (!parsed.length) throw new Error("Nenhuma movimentação encontrada.");
      setPreview(parsed); setFileName(file.name);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível ler o CSV."); }
  }
  function confirmImport() {
    if (!newEntries.length) return;
    onChange([...entries, ...newEntries.map((entry) => ({ ...entry, id: crypto.randomUUID() }))]);
    setMessage(newEntries.length + " movimentações importadas para Nubank Crédito.");
    setPreview([]); setFileName("");
  }
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {(["Nubank Crédito", "Inter Crédito"] as const).map((card) => {
          const cardEntries = entries.filter((entry) => entry.card === card);
          return <div key={card} className="rounded-3xl border border-white/90 bg-white/65 p-6 shadow-sm backdrop-blur-2xl">
            <p className="text-sm text-[#77879B]">{card}</p>
            <p className="mt-3 text-2xl font-semibold text-[#263D59]">{cardEntries.length} movimentações</p>
            <p className="mt-2 text-xs text-[#8B9AAD]">Compras e créditos importados · sem alterar saldo bancário</p>
          </div>;
        })}
      </div>
      <section className="rounded-3xl border border-white/90 bg-white/65 p-6 shadow-sm backdrop-blur-2xl">
        <h3 className="text-lg font-semibold text-[#26364D]">Importar fatura Nubank (CSV)</h3>
        <p className="mt-2 text-sm text-[#707780]">Selecione um arquivo exportado pelo Nubank. Confira todas as movimentações antes de salvar. A integração com o Google Drive virá depois.</p>
        <label className="mt-5 inline-flex cursor-pointer rounded-xl bg-[#34383F] px-5 py-3 text-sm font-medium text-white hover:bg-[#25282D]">
          Selecionar CSV
          <input className="sr-only" type="file" accept=".csv,text/csv" onChange={(event) => { void loadFile(event.target.files?.[0]); event.target.value = ""; }} />
        </label>
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
        {preview.length > 0 && <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div><p className="font-medium text-[#26364D]">Prévia: {fileName}</p><p className="text-sm text-[#77879B]">{preview.length} registros · {newEntries.length} novos · {preview.length - newEntries.length} já importados</p></div>
            <button type="button" disabled={!newEntries.length} onClick={confirmImport} className="rounded-xl bg-[#34383F] px-5 py-3 text-sm font-medium text-white disabled:opacity-40">Confirmar {newEntries.length} lançamentos</button>
          </div>
          <div className="mt-4 max-h-96 overflow-auto rounded-2xl border border-[#E5EAF0]">
            <table className="w-full min-w-[540px] text-left text-sm"><thead className="sticky top-0 bg-[#F4F7FA] text-[#64748B]"><tr><th className="p-3">Data</th><th className="p-3">Descrição</th><th className="p-3 text-right">Valor</th><th className="p-3">Situação</th></tr></thead><tbody>
              {preview.map((entry) => <tr key={entry.importKey} className="border-t border-[#E5EAF0]"><td className="whitespace-nowrap p-3">{entry.date.split("-").reverse().join("/")}</td><td className="p-3">{entry.description}</td><td className={`whitespace-nowrap p-3 text-right ${entry.amountCents < 0 ? "text-emerald-700" : "text-[#B65D58]"}`}>{entry.amountCents < 0 ? "−" : ""}{formatCents(Math.abs(entry.amountCents))}</td><td className="p-3 text-xs">{existing.has(entry.importKey) ? "Já importado" : "Novo"}</td></tr>)}
            </tbody></table>
          </div>
          <p className="mt-3 text-xs text-[#77879B]">Valores negativos são preservados como créditos. Revise estornos e pagamentos: esta etapa não classifica despesas nem altera o saldo das contas.</p>
        </>}
      </section>
      {entries.length > 0 && <section className="rounded-3xl border border-white/90 bg-white/65 p-6 shadow-sm backdrop-blur-2xl">
        <h3 className="font-semibold text-[#26364D]">Movimentações de cartões salvas</h3>
        <p className="mt-2 text-sm text-[#77879B]">{entries.length} registros armazenados neste navegador e incluídos no backup.</p>
      </section>}
    </div>
  );
}
