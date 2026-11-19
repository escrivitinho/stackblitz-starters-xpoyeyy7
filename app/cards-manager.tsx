"use client";

import { useState } from "react";
import { formatCents } from "./lib/money";
import type { Category } from "./categories-manager";

export type CardEntry = {
  id: string;
  card: "Nubank Crédito" | "Inter Crédito";
  date: string;
  description: string;
  amountCents: number;
  importKey: string;
  categoryId?: string;
  subcategoryId?: string;
  kind?: "purchase" | "credit" | "payment";
};

type Draft = Omit<CardEntry, "id">;

// Regras locais baseadas apenas em classificações confirmadas pelo usuário.
// Não removemos números nem partes de nomes para evitar associar lojas diferentes.
function merchantKey(description: string): string {
  return description.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
}

function findSuggestion(entry: CardEntry, entries: CardEntry[], categories: Category[]) {
  if (entry.categoryId || entry.amountCents <= 0 || (entry.kind && entry.kind !== "purchase")) return null;
  const matches = entries.filter((candidate) =>
    candidate.id !== entry.id &&
    candidate.categoryId &&
    candidate.amountCents > 0 &&
    (candidate.kind ?? "purchase") === "purchase" &&
    merchantKey(candidate.description) === merchantKey(entry.description) &&
    categories.some((category) => category.type === "expense" && category.id === candidate.categoryId &&
      (!candidate.subcategoryId || category.subcategories.some((sub) => sub.id === candidate.subcategoryId)))
  );
  if (!matches.length) return null;
  const counts = new Map<string, { count: number; categoryId: string; subcategoryId?: string }>();
  for (const match of matches) {
    const key = JSON.stringify([match.categoryId, match.subcategoryId ?? ""]);
    const prior = counts.get(key);
    counts.set(key, { count: (prior?.count ?? 0) + 1, categoryId: match.categoryId!, subcategoryId: match.subcategoryId });
  }
  const ranked = Array.from(counts.values()).sort((a, b) => b.count - a.count);
  if (ranked.length > 1 && ranked[0].count === ranked[1].count) return null;
  return ranked[0];
}

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

export default function CardsManager({ entries, onChange, categories }: { entries: CardEntry[]; onChange: (entries: CardEntry[]) => void; categories: Category[] }) {
  const [openedCard, setOpenedCard] = useState<CardEntry["card"] | null>(null);
  const [openedInvoice, setOpenedInvoice] = useState<string | null>(null);
  const [manualCard, setManualCard] = useState<CardEntry["card"]>("Nubank Crédito");
  const [manualDate, setManualDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [manualDescription, setManualDescription] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualInstallments, setManualInstallments] = useState(1);
  const [manualError, setManualError] = useState("");
  const [manualSuccess, setManualSuccess] = useState("");
  function addManualPurchase() {
    setManualError(""); setManualSuccess("");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(manualDate) || new Date(manualDate + "T12:00:00Z").toISOString().slice(0, 10) !== manualDate) {
      setManualError("Informe uma data válida."); return;
    }
    if (!manualDescription.trim()) { setManualError("Informe a descrição da compra."); return; }
    let total: number;
    try { total = parseAmount(manualAmount); }
    catch { setManualError("Informe um valor válido, como 700,00."); return; }
    if (total <= 0) { setManualError("O valor precisa ser maior que zero."); return; }
    if (!Number.isInteger(manualInstallments) || manualInstallments < 1 || manualInstallments > 48) {
      setManualError("Escolha entre 1 e 48 parcelas."); return;
    }
    const [year, month] = manualDate.split("-").map(Number);
    const groupId = crypto.randomUUID();
    const base = Math.floor(total / manualInstallments);
    const remainder = total % manualInstallments;
    const created: CardEntry[] = Array.from({ length: manualInstallments }, (_, index) => ({
      id: crypto.randomUUID(), card: manualCard,
      date: new Date(Date.UTC(year, month + index, 8)).toISOString().slice(0, 10),
      description: manualDescription.trim() + (manualInstallments > 1 ? " - Parcela " + (index + 1) + "/" + manualInstallments : ""),
      amountCents: base + (index < remainder ? 1 : 0),
      importKey: "manual-card:" + groupId + ":" + (index + 1),
      kind: "purchase" as const,
    }));
    onChange([...entries, ...created]);
    setManualSuccess(manualInstallments === 1 ? "Compra registrada." : manualInstallments + " parcelas registradas.");
    setManualDescription(""); setManualAmount(""); setManualInstallments(1);
  }
  const [cardFilter, setCardFilter] = useState("Todos");
  const [monthFilter, setMonthFilter] = useState("Todos");
  const expenseCategories = categories.filter((category) => category.type === "expense");
  const months = Array.from(new Set(entries.map((entry) => entry.date.slice(0, 7)))).sort().reverse();
  const filtered = entries.filter((entry) => (cardFilter === "Todos" || entry.card === cardFilter) && (monthFilter === "Todos" || entry.date.startsWith(monthFilter))).sort((a, b) => b.date.localeCompare(a.date));
  function updateEntry(id: string, changes: Partial<CardEntry>) { onChange(entries.map((entry) => entry.id === id ? { ...entry, ...changes } : entry)); }
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
      {openedCard ? (
        <section className="rounded-3xl border border-white/90 bg-white/65 p-6 shadow-sm backdrop-blur-2xl">
          <button type="button" onClick={() => { if (openedInvoice) setOpenedInvoice(null); else setOpenedCard(null); }} className="mb-5 rounded-xl border border-white/90 bg-white/70 px-4 py-2 text-sm font-medium text-[#526B8B] backdrop-blur-xl hover:bg-white">← {openedInvoice ? "Voltar às faturas" : "Voltar aos cartões"}</button>
          <h3 className="text-xl font-semibold text-[#26364D]">{openedCard}</h3>
          {!openedInvoice ? (
            <>
              <p className="mt-2 text-sm text-[#77879B]">Selecione uma fatura para consultar as compras e os demais lançamentos.</p>
              <div className="mt-5 space-y-3">
                {Array.from(new Set(entries.filter((entry) => entry.card === openedCard).map((entry) => entry.date.slice(0, 7)))).sort().reverse().map((month) => {
                  const invoiceEntries = entries.filter((entry) => entry.card === openedCard && entry.date.startsWith(month));
                  const purchases = invoiceEntries.filter((entry) => (entry.kind ?? (entry.amountCents < 0 ? "credit" : "purchase")) === "purchase");
                  const credits = invoiceEntries.filter((entry) => (entry.kind ?? (entry.amountCents < 0 ? "credit" : "purchase")) === "credit");
                  const purchaseTotal = purchases.reduce((sum, entry) => sum + Math.abs(entry.amountCents), 0);
                  const creditTotal = credits.reduce((sum, entry) => sum + Math.abs(entry.amountCents), 0);
                  const label = new Date(month + "-01T12:00:00Z").toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
                  return <button type="button" key={month} onClick={() => setOpenedInvoice(month)} className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/90 bg-white/65 px-5 py-4 text-left shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white/85">
                    <span><span className="block font-semibold capitalize text-[#26364D]">{label}</span><span className="mt-1 block text-xs text-[#77879B]">{purchases.length} compras · {credits.length} créditos/estornos</span></span>
                    <span className="text-right"><span className="block font-semibold text-[#B65D58]">{formatCents(purchaseTotal - creditTotal)}</span><span className="text-xs text-[#77879B]">Compras − créditos ›</span></span>
                  </button>;
                })}
                {!entries.some((entry) => entry.card === openedCard) && <p className="rounded-2xl bg-white/65 p-5 text-sm text-[#77879B]">Nenhuma fatura com lançamentos cadastrados.</p>}
              </div>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm capitalize text-[#77879B]">Fatura de {new Date(openedInvoice + "-01T12:00:00Z").toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })}</p>
              {(() => {
                const invoiceEntries = entries.filter((entry) => entry.card === openedCard && entry.date.startsWith(openedInvoice)).sort((a, b) => b.date.localeCompare(a.date));
                const purchases = invoiceEntries.filter((entry) => (entry.kind ?? (entry.amountCents < 0 ? "credit" : "purchase")) === "purchase");
                const credits = invoiceEntries.filter((entry) => (entry.kind ?? (entry.amountCents < 0 ? "credit" : "purchase")) === "credit");
                const payments = invoiceEntries.filter((entry) => entry.kind === "payment");
                const total = purchases.reduce((sum, entry) => sum + Math.abs(entry.amountCents), 0) - credits.reduce((sum, entry) => sum + Math.abs(entry.amountCents), 0);
                return <>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-rose-100 bg-rose-50/65 p-4 backdrop-blur-xl"><p className="text-xs text-[#77879B]">Compras</p><p className="mt-2 font-semibold text-[#B65D58]">{formatCents(purchases.reduce((sum, entry) => sum + Math.abs(entry.amountCents), 0))}</p></div>
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/65 p-4 backdrop-blur-xl"><p className="text-xs text-[#77879B]">Créditos / estornos</p><p className="mt-2 font-semibold text-emerald-700">{formatCents(credits.reduce((sum, entry) => sum + Math.abs(entry.amountCents), 0))}</p></div>
                    <div className="rounded-2xl border border-sky-100 bg-sky-50/65 p-4 backdrop-blur-xl"><p className="text-xs text-[#77879B]">Total após créditos</p><p className="mt-2 font-semibold text-[#263D59]">{formatCents(total)}</p></div>
                  </div>
                  <div className="mt-5 space-y-3">
                    {invoiceEntries.map((entry) => {
                      const kind = entry.kind ?? (entry.amountCents < 0 ? "credit" : "purchase");
                      const category = categories.find((item) => item.id === entry.categoryId);
                      const subcategory = category?.subcategories.find((item) => item.id === entry.subcategoryId);
                      return <div key={entry.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-white/90 bg-white/70 p-4 backdrop-blur-xl">
                        <div><p className="font-medium text-[#26364D]">{entry.description}</p><p className="mt-1 text-xs text-[#77879B]">{entry.date.split("-").reverse().join("/")} · {kind === "purchase" ? "Compra" : kind === "payment" ? "Pagamento da fatura" : "Crédito / estorno"}{category ? " · " + category.name : ""}{subcategory ? " → " + subcategory.name : ""}</p></div>
                        <p className={`font-semibold ${kind === "purchase" ? "text-[#B65D58]" : "text-emerald-700"}`}>{kind === "purchase" ? "" : "−"}{formatCents(Math.abs(entry.amountCents))}</p>
                      </div>;
                    })}
                    {!invoiceEntries.length && <p className="text-sm text-[#77879B]">Nenhum lançamento nesta fatura.</p>}
                  </div>
                  {payments.length > 0 && <p className="mt-4 text-xs text-[#77879B]">Pagamentos identificados são exibidos para consulta, mas não reduzem o total de compras desta fatura.</p>}
                </>;
              })()}
            </>
          )}
          <p className="mt-5 text-xs text-[#77879B]">Agrupamento provisório pelo mês da data registrada. O ciclo de fechamento e vencimento será configurado depois; valores não representam necessariamente a fatura oficial do banco.</p>
        </section>
      ) : <div className="grid gap-4 sm:grid-cols-2">
        {(["Nubank Crédito", "Inter Crédito"] as const).map((card) => {
          const cardEntries = entries.filter((entry) => entry.card === card);
          const violet = card === "Nubank Crédito";
          return <button type="button" key={card} onClick={() => { setOpenedCard(card); setOpenedInvoice(null); }} className={`rounded-3xl border p-6 text-left shadow-sm backdrop-blur-2xl transition hover:-translate-y-0.5 hover:shadow-lg ${violet ? "border-violet-200/80 bg-gradient-to-br from-violet-100/80 to-violet-200/50" : "border-orange-200/80 bg-gradient-to-br from-orange-100/80 to-orange-200/50"}`}>
            <p className={`text-sm font-semibold ${violet ? "text-violet-800" : "text-orange-800"}`}>{card} →</p>
            <p className="mt-3 text-2xl font-semibold text-[#263D59]">{cardEntries.length} movimentações</p>
            <p className="mt-2 text-xs text-[#77879B]">Clique para consultar as faturas</p>
          </button>;
        })}
      </div>}
      <section className="rounded-3xl border border-white/90 bg-white/65 p-6 shadow-sm backdrop-blur-2xl">
        <h3 className="text-lg font-semibold text-[#26364D]">Registrar compra no cartão</h3>
        <p className="mt-2 text-sm text-[#707780]">À vista ou parcelada. Cada parcela aparece no mês de sua fatura, sem alterar o saldo bancário. A conciliação com CSV será implementada depois.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-medium text-[#64748B]">Cartão<select value={manualCard} onChange={(e) => setManualCard(e.target.value as CardEntry["card"])} className="mt-1 block w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-3 text-sm"><option>Nubank Crédito</option><option>Inter Crédito</option></select></label>
          <label className="text-xs font-medium text-[#64748B]">Data da compra<input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="mt-1 block w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-3 text-sm" /></label>
          <label className="text-xs font-medium text-[#64748B]">Descrição<input value={manualDescription} onChange={(e) => setManualDescription(e.target.value)} placeholder="Ex.: Mercado" className="mt-1 block w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-3 text-sm" /></label>
          <label className="text-xs font-medium text-[#64748B]">Valor total (R$)<input value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} inputMode="decimal" placeholder="700,00" className="mt-1 block w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-3 text-sm" /></label>
          <label className="text-xs font-medium text-[#64748B]">Parcelas (1 a 48)<input type="number" min={1} max={48} step={1} value={manualInstallments} onChange={(e) => setManualInstallments(Number(e.target.value))} className="mt-1 block w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-3 text-sm" /></label>
        </div>
        <p className="mt-3 text-xs text-[#77879B]">Regra provisória: primeira fatura no mês seguinte, vencimento dia 8. Configuração do fechamento e vencimento por cartão ainda será adicionada. Não utilize para compras reais antes dessa configuração.</p>
        {manualError && <p role="alert" className="mt-3 text-sm text-rose-700">{manualError}</p>}
        {manualSuccess && <p role="status" className="mt-3 text-sm text-emerald-700">{manualSuccess}</p>}
        <button type="button" onClick={addManualPurchase} className="mt-4 rounded-xl bg-[#34383F] px-5 py-3 text-sm font-medium text-white hover:bg-[#25282D]">Registrar compra</button>
      </section>
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
        <h3 className="text-lg font-semibold text-[#26364D]">Movimentações dos cartões</h3>
        <p className="mt-2 text-sm text-[#77879B]">Classifique cada registro. Ao reconhecer uma descrição já classificada, o MONEO sugere a mesma categoria para você aprovar. Pagamentos e estornos não recebem sugestões. As alterações são salvas neste navegador.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <label className="text-xs text-[#64748B]">Cartão<select aria-label="Filtrar cartão" className="mt-1 block rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm" value={cardFilter} onChange={(e) => setCardFilter(e.target.value)}><option>Todos</option><option>Nubank Crédito</option><option>Inter Crédito</option></select></label>
          <label className="text-xs text-[#64748B]">Mês<select aria-label="Filtrar mês" className="mt-1 block rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}><option>Todos</option>{months.map((month) => <option key={month} value={month}>{month.slice(5)}/{month.slice(0, 4)}</option>)}</select></label>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white/70 p-4"><p className="text-xs text-[#77879B]">Compras</p><p className="mt-2 font-semibold text-[#B65D58]">{formatCents(filtered.filter((entry) => (entry.kind ?? (entry.amountCents < 0 ? "credit" : "purchase")) === "purchase").reduce((sum, entry) => sum + Math.abs(entry.amountCents), 0))}</p></div>
          <div className="rounded-2xl bg-white/70 p-4"><p className="text-xs text-[#77879B]">Créditos / estornos</p><p className="mt-2 font-semibold text-emerald-700">{formatCents(filtered.filter((entry) => (entry.kind ?? (entry.amountCents < 0 ? "credit" : "purchase")) === "credit").reduce((sum, entry) => sum + Math.abs(entry.amountCents), 0))}</p></div>
          <div className="rounded-2xl bg-white/70 p-4"><p className="text-xs text-[#77879B]">Pagamentos identificados</p><p className="mt-2 font-semibold text-[#26364D]">{formatCents(filtered.filter((entry) => entry.kind === "payment").reduce((sum, entry) => sum + Math.abs(entry.amountCents), 0))}</p></div>
        </div>
        <div className="mt-5 space-y-3">
          {filtered.map((entry) => {
            const kind = entry.kind ?? (entry.amountCents < 0 ? "credit" : "purchase");
            const category = expenseCategories.find((item) => item.id === entry.categoryId);
            const suggestion = kind === "purchase" ? findSuggestion(entry, entries, categories) : null;
            const suggestedCategory = suggestion ? expenseCategories.find((item) => item.id === suggestion.categoryId) : undefined;
            const suggestedSubcategory = suggestedCategory?.subcategories.find((item) => item.id === suggestion?.subcategoryId);
            return <div key={entry.id} className="rounded-2xl border border-[#E5EAF0] bg-white/75 p-4">
              <div className="flex flex-wrap justify-between gap-3">
                <div className="min-w-0"><p className="font-medium text-[#26364D]">{entry.description}</p><p className="mt-1 text-xs text-[#77879B]">{entry.date.split("-").reverse().join("/")} · {entry.card}</p></div>
                <p className={`font-semibold ${entry.amountCents < 0 ? "text-emerald-700" : "text-[#B65D58]"}`}>{entry.amountCents < 0 ? "−" : ""}{formatCents(Math.abs(entry.amountCents))}</p>
              </div>
              {suggestion && suggestedCategory && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200/80 bg-sky-50/80 px-3 py-2">
                <p className="text-xs text-[#395D7A]">Sugestão baseada em compras classificadas com a mesma descrição: <strong>{suggestedCategory.name}{suggestedSubcategory ? " → " + suggestedSubcategory.name : ""}</strong></p>
                <button type="button" onClick={() => updateEntry(entry.id, { categoryId: suggestion.categoryId, subcategoryId: suggestion.subcategoryId })} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#294263] shadow-sm ring-1 ring-sky-200 hover:bg-sky-100">Aplicar sugestão</button>
              </div>}
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <label className="text-xs text-[#64748B]">Tipo<select aria-label={"Tipo: " + entry.description} className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-white p-2 text-sm" value={kind} onChange={(e) => updateEntry(entry.id, { kind: e.target.value as CardEntry["kind"], categoryId: undefined, subcategoryId: undefined })}><option value="purchase">Compra</option><option value="credit">Crédito / estorno</option><option value="payment">Pagamento da fatura</option></select></label>
                <label className="text-xs text-[#64748B]">Categoria<select disabled={kind !== "purchase"} aria-label={"Categoria: " + entry.description} className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-white p-2 text-sm disabled:opacity-40" value={entry.categoryId ?? ""} onChange={(e) => updateEntry(entry.id, { categoryId: e.target.value || undefined, subcategoryId: undefined })}><option value="">Não classificada</option>{expenseCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label className="text-xs text-[#64748B]">Subcategoria<select disabled={kind !== "purchase" || !category} aria-label={"Subcategoria: " + entry.description} className="mt-1 w-full rounded-xl border border-[#E2E8F0] bg-white p-2 text-sm disabled:opacity-40" value={entry.subcategoryId ?? ""} onChange={(e) => updateEntry(entry.id, { subcategoryId: e.target.value || undefined })}><option value="">Não selecionada</option>{category?.subcategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              </div>
            </div>;
          })}
          {filtered.length === 0 && <p className="py-5 text-sm text-[#77879B]">Nenhuma movimentação neste filtro.</p>}
        </div>
        <p className="mt-4 text-xs text-[#77879B]">Os totais acima são informativos e ainda não alimentam a Visão geral. Os registros originais e seus identificadores de importação são preservados.</p>
      </section>}
    </div>
  );
}
