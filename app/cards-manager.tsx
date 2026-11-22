"use client";

import { useEffect, useRef, useState } from "react";
import { formatCents } from "./lib/money";
import type { Category } from "./categories-manager";
import { classifyCardByDescription, type DescriptionRule } from "./description-rules";

export type CardEntry = {
  id: string;
  card: "Nubank Crédito" | "Inter Crédito";
  date: string;
  purchaseDate?: string;
  paidFor?: string;
  description: string;
  amountCents: number;
  importKey: string;
  categoryId?: string;
  subcategoryId?: string;
  kind?: "purchase" | "credit" | "payment";
  creditNature?: "refund" | "cashback" | "adjustment";
  refundedPurchaseId?: string;
};

type Draft = Omit<CardEntry, "id">;

function GlassSelect({ label, value, options, onChange, disabled = false, onCreate, createLabel = "categoria" }: {label:string;value:string;options:{value:string;label:string;detail?:string}[];onChange:(value:string)=>void;disabled?:boolean;onCreate?:(name:string)=>void;createLabel?:string}) {
 const [open,setOpen]=useState(false); const [openAbove,setOpenAbove]=useState(false); const [search,setSearch]=useState(""); const [active,setActive]=useState(0); const root=useRef<HTMLDivElement>(null);
 const normalized=(v:string)=>v.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
 const shown=options.filter(o=>normalized(o.label+" "+(o.detail||"")).includes(normalized(search)));
 const showDropdown = () => {
   const bounds = root.current?.getBoundingClientRect();
   if (bounds) setOpenAbove(window.innerHeight - bounds.bottom < 280 && bounds.top > window.innerHeight - bounds.bottom);
   setOpen(true);
 };
 useEffect(()=>{if(!open)return;const close=(e:MouseEvent)=>{if(!root.current?.contains(e.target as Node)){setOpen(false);setSearch("");}};document.addEventListener("mousedown",close);return()=>document.removeEventListener("mousedown",close)},[open]);
 return <div ref={root} className="relative min-w-0"><span className="block text-xs text-[#64748B]">{label}</span>
 <div className="mt-1 flex items-center rounded-xl border border-white/85 bg-white/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_5px_18px_rgba(80,110,150,0.07)] backdrop-blur-xl focus-within:ring-2 focus-within:ring-[#A7BBD6]">
 <input disabled={disabled} role="combobox" aria-label={label} aria-expanded={open} aria-autocomplete="list" value={open?search:(options.find(o=>o.value===value)?.label||"")} placeholder="Pesquisar..." onFocus={()=>{showDropdown();setSearch("");setActive(0)}} onChange={e=>{setSearch(e.target.value);setActive(0);showDropdown()}} onKeyDown={e=>{if(e.key==="Escape"){setOpen(false);setSearch("");(e.target as HTMLInputElement).blur()}if(e.key==="ArrowDown"){e.preventDefault();setActive(i=>Math.min(i+1,shown.length-1))}if(e.key==="ArrowUp"){e.preventDefault();setActive(i=>Math.max(i-1,0))}if(e.key==="Enter"&&open&&shown[active]){e.preventDefault();onChange(shown[active].value);setOpen(false);setSearch("");(e.target as HTMLInputElement).blur()}}} className="min-w-0 w-full bg-transparent px-3 py-2.5 text-sm text-[#35445A] outline-none disabled:opacity-40"/>
 <button type="button" disabled={disabled} aria-label={"Mostrar "+label} onClick={()=>{if(open)setOpen(false);else showDropdown();setSearch("");setActive(0)}} className="px-3 text-[#64748B]">⌄</button></div>
 {open&&!disabled&&<div role="listbox" className={`absolute left-0 right-0 z-50 max-h-64 overflow-y-auto rounded-2xl border border-white/90 bg-[#F4F7FC]/95 p-1.5 shadow-[0_16px_45px_rgba(55,75,110,0.22)] backdrop-blur-2xl ${openAbove ? "bottom-full mb-2" : "top-full mt-2"}`}>{shown.length===0&&<p className="px-3 py-3 text-sm text-[#64748B]">Nenhuma opção encontrada</p>}{onCreate && search.trim() && !disabled && !options.some(o=>o.label.trim().toLocaleLowerCase("pt-BR")===search.trim().toLocaleLowerCase("pt-BR")) && <button type="button" className="w-full rounded-xl bg-sky-50/90 px-3 py-3 text-left text-sm font-semibold text-[#344D70] hover:bg-sky-100" onClick={()=>{onCreate(search.trim());setOpen(false);setSearch("")}}>＋ Cadastrar {createLabel} “{search.trim()}”</button>}{shown.map((o,i)=><button key={o.value} type="button" role="option" aria-selected={o.value===value} onMouseEnter={()=>setActive(i)} onClick={()=>{onChange(o.value);setOpen(false);setSearch("")}} className={`block w-full rounded-xl px-3 py-2 text-left transition-colors ${i===active?"bg-white/90 shadow-sm":"hover:bg-white/65"}`}><span className="block text-sm font-medium text-[#35445A]">{o.label}</span>{o.detail&&<span className="block text-xs text-[#718198]">{o.detail}</span>}</button>)}</div>}</div>
}


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

export function parseNubankCsv(text: string): Draft[] {
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

export default function CardsManager({ entries, onChange, categories, onCategoriesChange, descriptionRules = [], importOnly = false, driveFile }: { entries: CardEntry[]; onChange: (entries: CardEntry[]) => void; categories: Category[]; onCategoriesChange?: (categories: Category[]) => void; descriptionRules?: DescriptionRule[]; importOnly?: boolean; driveFile?: File | null }) {
  const [openedCard, setOpenedCard] = useState<CardEntry["card"] | null>(null);
  const [openedInvoice, setOpenedInvoice] = useState<string | null>(null);
  const [showManualPurchase, setShowManualPurchase] = useState(false);
  const [manualCard, setManualCard] = useState<CardEntry["card"]>("Nubank Crédito");
  const [manualDate, setManualDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [manualDescription, setManualDescription] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualInstallments, setManualInstallments] = useState(1);
  const [manualInvoiceOffset, setManualInvoiceOffset] = useState<1 | 2>(1);
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
      date: new Date(Date.UTC(year, month + manualInvoiceOffset - 1 + index, manualCard === "Inter Crédito" ? 7 : 8)).toISOString().slice(0, 10),
      description: manualDescription.trim() + (manualInstallments > 1 ? " - Parcela " + (index + 1) + "/" + manualInstallments : ""),
      amountCents: base + (index < remainder ? 1 : 0),
      importKey: "manual-card:" + groupId + ":" + (index + 1),
      kind: "purchase" as const,
    }));
    onChange([...entries, ...created]);
    setManualSuccess(manualInstallments === 1 ? "Compra registrada." : manualInstallments + " parcelas registradas.");
    setManualDescription(""); setManualAmount(""); setManualInstallments(1);
    setShowManualPurchase(false);
  }
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [cardFilter, setCardFilter] = useState("Todos");
  const [monthFilter, setMonthFilter] = useState("Todos");
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkSubcategoryId, setBulkSubcategoryId] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkNotice, setBulkNotice] = useState("");
  const [treatmentFilter, setTreatmentFilter] = useState<"all" | "treated" | "untreated">("all");
  const expenseCategories = categories.filter((category) => category.type === "expense");
  const hasCompleteClassification = (entry: CardEntry) => {
    const category = expenseCategories.find(item => item.id === entry.categoryId);
    return Boolean(category && category.subcategories.some(subcategory => subcategory.id === entry.subcategoryId));
  };
  const creditIsTreated = (entry: CardEntry) =>
    entry.creditNature === "cashback" ||
    entry.creditNature === "adjustment" ||
    (entry.creditNature === "refund" && hasCompleteClassification(entry));
  const entryIsTreated = (entry: CardEntry) => {
    const kind = entry.kind ?? (entry.amountCents < 0 ? "credit" : "purchase");
    return kind === "payment" || (kind === "credit" ? creditIsTreated(entry) : hasCompleteClassification(entry));
  };
  const months = Array.from(new Set(entries.map((entry) => entry.date.slice(0, 7)))).sort().reverse();
  type CardSortColumn = "status" | "date" | "description" | "category" | "card" | "amount";
  const [cardSort, setCardSort] = useState<CardSortColumn>("date");
  const [cardSortDirection, setCardSortDirection] = useState<"asc" | "desc">("desc");
  function changeCardSort(column: CardSortColumn) {
    if (cardSort === column) setCardSortDirection(direction => direction === "asc" ? "desc" : "asc");
    else { setCardSort(column); setCardSortDirection(column === "date" || column === "amount" ? "desc" : "asc"); }
  }
  const cardSortValue = (entry: CardEntry, column: CardSortColumn): string | number => {
    const kind = entry.kind ?? (entry.amountCents < 0 ? "credit" : "purchase");
    const category = expenseCategories.find(item => item.id === entry.categoryId);
    switch (column) {
      case "status": return kind === "payment" ? "Pagamento" : entryIsTreated(entry) ? "Classificado" : "A tratar";
      case "date": return entry.date;
      case "description": return entry.description;
      case "category": return category?.name ?? "";
      case "card": return entry.card;
      case "amount": return entry.amountCents;
    }
  };
  const filtered = entries.filter((entry) => {
    if (cardFilter !== "Todos" && entry.card !== cardFilter) return false;
    if (monthFilter !== "Todos" && !entry.date.startsWith(monthFilter)) return false;
    const kind = entry.kind ?? (entry.amountCents < 0 ? "credit" : "purchase");
    const treated = entryIsTreated(entry);
    return treatmentFilter === "all" || (treatmentFilter === "treated" ? treated : !treated);
  }).sort((a, b) => {
    const av = cardSortValue(a, cardSort), bv = cardSortValue(b, cardSort);
    const comparison = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "pt-BR", { sensitivity: "base", numeric: true });
    return (cardSortDirection === "asc" ? comparison : -comparison) || b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
  });
  const eligibleForBulk = (entry: CardEntry) => {
    const kind = entry.kind ?? (entry.amountCents < 0 ? "credit" : "purchase");
    return kind === "purchase" || (kind === "credit" && entry.creditNature === "refund");
  };
  const visibleEligibleIds = filtered.filter(eligibleForBulk).map(entry => entry.id);
  const selectedEligible = entries.filter(entry => selectedEntryIds.includes(entry.id) && eligibleForBulk(entry));
  function applyBulkCategory() {
    const category = expenseCategories.find(item => item.id === bulkCategoryId);
    if (!category || !category.subcategories.some(item => item.id === bulkSubcategoryId) || selectedEligible.length === 0) return;
    const ids = new Set(selectedEligible.map(entry => entry.id));
    onChange(entries.map(entry => ids.has(entry.id) ? {...entry,categoryId:bulkCategoryId,subcategoryId:bulkSubcategoryId,refundedPurchaseId:undefined} : entry));
    setBulkNotice(selectedEligible.length + " lançamento(s) categorizado(s).");
    setSelectedEntryIds([]);
    setBulkOpen(false);
    setBulkCategoryId("");
    setBulkSubcategoryId("");
  }
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
  useEffect(()=>{
    if(driveFile)void loadFile(driveFile);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[driveFile]);
  function confirmImport() {
    if (!newEntries.length) return;
    onChange([...entries, ...newEntries.map((entry) => classifyCardByDescription({ ...entry, id: crypto.randomUUID() },descriptionRules,categories))]);
    setMessage(newEntries.length + " movimentações importadas para Nubank Crédito.");
    setPreview([]); setFileName("");
  }
  if (importOnly) return <div className="space-y-5">      <section className="rounded-3xl border border-white/90 bg-white/65 p-6 shadow-sm backdrop-blur-2xl">
        <h3 className="text-lg font-semibold text-[#26364D]">Importar fatura de cartão (CSV Nubank)</h3>
        <p className="mt-2 text-sm text-[#707780]">Importação manual alternativa: selecione uma fatura CSV do Nubank, revise a prévia e confirme. A leitura de faturas diretamente do Drive será integrada nesta central.</p>
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
</div>;
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
      <div className="flex justify-end"><button type="button" aria-expanded={showManualPurchase} onClick={() => {setShowManualPurchase(current => !current);setManualError("");setManualSuccess("");}} className="rounded-xl bg-[#344D70] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#263B57]">{showManualPurchase ? "Fechar novo lançamento" : "+ Novo lançamento"}</button></div>
      {showManualPurchase && <section className="rounded-3xl border border-white/90 bg-white/65 p-6 shadow-sm backdrop-blur-2xl">
        <h3 className="text-lg font-semibold text-[#26364D]">Registrar compra no cartão</h3>
        <p className="mt-2 text-sm text-[#707780]">À vista ou parcelada. Cada parcela aparece no mês de sua fatura, sem alterar o saldo bancário. A conciliação com CSV será implementada depois.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-medium text-[#64748B]">Cartão<select value={manualCard} onChange={(e) => setManualCard(e.target.value as CardEntry["card"])} className="mt-1 block w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-3 text-sm"><option>Nubank Crédito</option><option>Inter Crédito</option></select></label>
          <label className="text-xs font-medium text-[#64748B]">Data da compra<input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="mt-1 block w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-3 text-sm" /></label>
          <label className="text-xs font-medium text-[#64748B]">Descrição<input value={manualDescription} onChange={(e) => setManualDescription(e.target.value)} placeholder="Ex.: Mercado" className="mt-1 block w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-3 text-sm" /></label>
          <label className="text-xs font-medium text-[#64748B]">Valor total (R$)<input value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} inputMode="decimal" placeholder="700,00" className="mt-1 block w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-3 text-sm" /></label>
          <label className="text-xs font-medium text-[#64748B]">Parcelas (1 a 48)<input type="number" min={1} max={48} step={1} value={manualInstallments} onChange={(e) => setManualInstallments(Number(e.target.value))} className="mt-1 block w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-3 text-sm" /></label>
        </div>
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-[#64748B]">Primeira fatura</p>
          <div className="flex flex-wrap justify-center gap-3">
            {([1, 2] as const).map((offset) => {
              const [year, month] = manualDate.split("-").map(Number);
              const valid = Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12;
              const label = valid ? new Date(Date.UTC(year, month + offset - 1, 1)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }) : offset === 1 ? "Próxima fatura" : "Fatura posterior";
              return <button key={offset} type="button" aria-pressed={manualInvoiceOffset === offset} onClick={() => setManualInvoiceOffset(offset)}
                className={`min-h-12 w-44 rounded-2xl border px-4 py-3 text-sm font-semibold backdrop-blur-xl ${manualInvoiceOffset === offset ? "border-sky-400/80 bg-sky-200/75 text-sky-950 shadow-md" : "border-white/80 bg-white/60 text-[#64748B]"}`}>{label}{manualInvoiceOffset === offset ? " ✓" : ""}</button>;
            })}
          </div>
        </div>
        <p className="mt-3 text-xs text-[#77879B]">A primeira fatura é sugerida para o mês seguinte à compra, com opção de adiar um mês. Vencimento: Nubank dia 08 e Inter dia 07. Confirme com a fatura oficial; a regra de corte é aproximada.</p>
        {manualError && <p role="alert" className="mt-3 text-sm text-rose-700">{manualError}</p>}
        {manualSuccess && <p role="status" className="mt-3 text-sm text-emerald-700">{manualSuccess}</p>}
        <button type="button" onClick={addManualPurchase} className="mt-4 rounded-xl bg-[#34383F] px-5 py-3 text-sm font-medium text-white hover:bg-[#25282D]">Registrar compra</button>
      </section>}
      {importOnly && <>
      <section className="rounded-3xl border border-white/90 bg-white/65 p-6 shadow-sm backdrop-blur-2xl">
        <h3 className="text-lg font-semibold text-[#26364D]">Importar fatura de cartão (CSV Nubank)</h3>
        <p className="mt-2 text-sm text-[#707780]">Importação manual alternativa: selecione uma fatura CSV do Nubank, revise a prévia e confirme. A leitura de faturas diretamente do Drive será integrada nesta central.</p>
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
      </>}
      {entries.length > 0 && <section className="rounded-3xl border border-white/90 bg-white/65 p-6 shadow-sm backdrop-blur-2xl">
        <h3 className="text-lg font-semibold text-[#26364D]">Movimentações dos cartões</h3>
        <p className="mt-2 text-sm text-[#77879B]">Consulte as movimentações e suas classificações. Clique em um lançamento para editar tipo, categoria e subcategoria. Pagamentos e estornos não recebem sugestões. As alterações são salvas automaticamente.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <label className="text-xs text-[#64748B]">Cartão<select aria-label="Filtrar cartão" className="mt-1 block rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm" value={cardFilter} onChange={(e) => setCardFilter(e.target.value)}><option>Todos</option><option>Nubank Crédito</option><option>Inter Crédito</option></select></label>
          <label className="text-xs text-[#64748B]">Mês<select aria-label="Filtrar mês" className="mt-1 block rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}><option>Todos</option>{months.map((month) => <option key={month} value={month}>{month.slice(5)}/{month.slice(0, 4)}</option>)}</select></label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar lançamentos por tratamento">
          {([["all", "Todos"], ["treated", "Tratados"], ["untreated", "Não tratados"]] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={treatmentFilter === value} onClick={() => setTreatmentFilter(value)} className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${treatmentFilter === value ? "border-[#A7BBD6] bg-white/90 text-[#344D70] shadow-sm" : "border-white/80 bg-white/45 text-[#718198] hover:bg-white/70"}`}>{label}</button>
          ))}
        </div>
        <div className="sticky top-0 z-50 mt-4 rounded-2xl border border-white/85 bg-[#F4F7FC]/95 p-3 shadow-[0_8px_28px_rgba(55,75,110,0.12)] backdrop-blur-2xl">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-[#526B8B]"><input type="checkbox" checked={visibleEligibleIds.length > 0 && visibleEligibleIds.every(id=>selectedEntryIds.includes(id))} onChange={event=>setSelectedEntryIds(current=>event.target.checked?Array.from(new Set([...current,...visibleEligibleIds])):current.filter(id=>!visibleEligibleIds.includes(id)))} /> Selecionar elegíveis visíveis</label>
          {selectedEntryIds.length > 0 && <><span className="text-sm text-[#64748B]">{selectedEligible.length} selecionado(s)</span><button type="button" onClick={()=>{setBulkOpen(value=>!value);setBulkNotice("");}} className="rounded-xl border border-[#A7BBD6] bg-white/85 px-3 py-2 text-sm font-semibold text-[#344D70]">Categorizar em lote</button><button type="button" onClick={()=>{setSelectedEntryIds([]);setBulkOpen(false);}} className="rounded-xl px-3 py-2 text-sm text-[#64748B]">Limpar seleção</button></>}
        </div>
        {bulkOpen && selectedEligible.length > 0 && <div className="relative mt-3 max-h-[65vh] space-y-3 overflow-y-auto rounded-2xl border border-white/90 bg-white/80 p-4 shadow-sm">
          <p className="text-sm font-semibold text-[#344D70]">Categorizar {selectedEligible.length} lançamento(s) em lote</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <GlassSelect label="Categoria" value={bulkCategoryId} options={[{value:"",label:"Selecionar categoria"},...expenseCategories.map(category=>({value:category.id,label:category.name}))]} onChange={value=>{setBulkCategoryId(value);setBulkSubcategoryId("");}} />
            <GlassSelect label="Subcategoria" disabled={!bulkCategoryId} value={bulkSubcategoryId} options={[{value:"",label:"Selecionar subcategoria"},...(expenseCategories.find(category=>category.id===bulkCategoryId)?.subcategories??[]).map(item=>({value:item.id,label:item.name}))]} onChange={setBulkSubcategoryId}/>
          </div>
          <p className="text-xs text-[#64748B]">Aplica a mesma categoria e subcategoria às compras e estornos de compra selecionados. Pagamentos, cashbacks e ajustes não serão alterados.</p>
          <div className="flex justify-end gap-2"><button type="button" onClick={()=>setBulkOpen(false)} className="rounded-xl bg-white/70 px-4 py-2 text-sm">Cancelar</button><button type="button" disabled={!bulkSubcategoryId} onClick={applyBulkCategory} className="rounded-xl bg-[#344D70] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Aplicar classificação</button></div>
        </div>}
        {bulkNotice && <p role="status" className="mt-2 text-sm text-emerald-700">{bulkNotice}</p>}
        </div>
        <div className="mt-5 space-y-2">
          <div className="sticky top-0 z-30 hidden grid-cols-[120px_100px_minmax(240px,2fr)_minmax(170px,1.2fr)_130px_130px] gap-3 rounded-xl border border-white/80 bg-[#F1F3F8]/95 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#8190A4] shadow-sm backdrop-blur-2xl lg:grid">
            {([["status", "Situação"], ["date", "Data"], ["description", "Descrição"], ["category", "Categoria"], ["card", "Cartão"], ["amount", "Valor"]] as const).map(([column, label]) => (
              <button key={column} type="button" onClick={() => changeCardSort(column)} aria-label={`Ordenar por ${label}`} aria-pressed={cardSort === column} className={`flex items-center gap-1 text-left transition-colors hover:text-[#344D70] focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 ${column === "amount" ? "justify-end text-right" : ""} ${cardSort === column ? "text-[#344D70]" : ""}`}>
                {label}<span aria-hidden="true">{cardSort === column ? (cardSortDirection === "asc" ? "↑" : "↓") : "↕"}</span>
              </button>
            ))}
          </div>
          {filtered.map((entry) => {
            const kind = entry.kind ?? (entry.amountCents < 0 ? "credit" : "purchase");
            const category = expenseCategories.find(item => item.id === entry.categoryId);
            const subcategory = category?.subcategories.find(item => item.id === entry.subcategoryId);
            const suggestion = kind === "purchase" ? findSuggestion(entry, entries, categories) : null;
            const suggestedCategory = suggestion ? expenseCategories.find(item => item.id === suggestion.categoryId) : undefined;
            const suggestedSubcategory = suggestedCategory?.subcategories.find(item => item.id === suggestion?.subcategoryId);
            const editing = editingEntryId === entry.id;
            const credit = kind === "credit" || entry.amountCents < 0;
            const classified = entryIsTreated(entry);
            const glassBackground = credit ? "linear-gradient(120deg, rgba(101,221,172,0.59), rgba(211,251,233,0.48))" : "linear-gradient(120deg, rgba(251,155,171,0.62), rgba(255,224,230,0.49))";
            const glassBorder = credit ? "rgba(16,185,129,0.55)" : "rgba(225,72,102,0.56)";
            return <div key={entry.id} onClick={(event) => { if ((event.target as HTMLElement).closest("button, input, select, textarea, label, a, [role=combobox], [role=listbox]")) return; setEditingEntryId(current => current === entry.id ? null : entry.id); }} style={{background: kind === "payment" ? "rgba(255,255,255,0.40)" : classified ? (credit ? "linear-gradient(120deg, rgba(167,243,208,0.20), rgba(236,253,245,0.18))" : "linear-gradient(120deg, rgba(254,205,211,0.22), rgba(255,240,242,0.19))") : glassBackground, borderColor: kind === "payment" ? "rgba(203,213,225,0.55)" : classified ? (credit ? "rgba(52,211,153,0.22)" : "rgba(244,114,136,0.22)") : glassBorder}} className={`relative cursor-pointer overflow-visible rounded-2xl border px-4 py-3 transition-shadow hover:shadow-md shadow-[inset_0_1px_0_rgba(255,255,255,0.78),0_5px_18px_rgba(70,90,120,0.035)] backdrop-blur-xl ${editing ? "z-40 ring-1 ring-[#A7BBD6]" : "z-0"}`}>
              {eligibleForBulk(entry) && <label className="mb-2 inline-flex cursor-pointer items-center gap-2 text-xs text-[#526B8B]" onClick={event=>event.stopPropagation()}><input type="checkbox" checked={selectedEntryIds.includes(entry.id)} onChange={event=>{setBulkNotice("");setSelectedEntryIds(current=>event.target.checked?[...current.filter(id=>id!==entry.id),entry.id]:current.filter(id=>id!==entry.id));}} /> Selecionar</label>}
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-[120px_100px_minmax(240px,2fr)_minmax(170px,1.2fr)_130px_130px] lg:gap-3">
                <span className="inline-flex h-8 w-[116px] items-center justify-center rounded-lg border border-white/75 bg-white/55 px-2 text-xs font-semibold text-[#526B8B]">{kind === "payment" ? "Pagamento" : classified ? "Classificado" : "A tratar"}</span>
                <span className="text-xs text-[#64748B] lg:pt-1">{entry.date.split("-").reverse().join("/")}</span>
                <button type="button" aria-expanded={editing} aria-label={(editing ? "Fechar edição de " : "Editar ") + entry.description} onClick={() => setEditingEntryId(editing ? null : entry.id)} className="min-w-0 whitespace-normal break-words text-left text-sm font-medium leading-relaxed text-[#35445A]">{entry.description}</button>
                <span className="min-w-0 whitespace-normal break-words text-xs leading-relaxed text-[#64748B] lg:pt-1">{kind === "purchase" ? (category?.name ?? "Não classificada") + (subcategory ? " → " + subcategory.name : "") : kind === "credit" ? (entry.creditNature === "refund" ? "Estorno" + (category ? " · " + category.name + (subcategory ? " → " + subcategory.name : "") : "") : entry.creditNature === "cashback" ? "Cashback / recompensa" : entry.creditNature === "adjustment" ? "Ajuste de fatura" : "Crédito / estorno") : "Pagamento da fatura"}</span>
                <span className="text-xs text-[#64748B] lg:pt-1">{entry.card}</span>
                <button type="button" onClick={() => setEditingEntryId(editing ? null : entry.id)} className={`whitespace-nowrap text-left text-sm font-semibold lg:text-right ${credit ? "text-emerald-700" : "text-[#B65D58]"}`}>{credit ? "−" : ""}{formatCents(Math.abs(entry.amountCents))} <span className="text-[#7A8BA4]">{editing ? "⌃" : "⌄"}</span></button>
              </div>
              {editing && <div className="mt-4 space-y-3 border-t border-white/65 pt-4">
                {suggestion && suggestedCategory && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200/80 bg-sky-50/80 px-3 py-2">
                  <p className="text-xs text-[#395D7A]">Sugestão: <strong>{suggestedCategory.name}{suggestedSubcategory ? " → " + suggestedSubcategory.name : ""}</strong></p>
                  <button type="button" onClick={() => updateEntry(entry.id, { categoryId: suggestion.categoryId, subcategoryId: suggestion.subcategoryId })} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#294263] shadow-sm ring-1 ring-sky-200">Aplicar sugestão</button>
                </div>}
                {kind === "credit" && <div className="space-y-3 rounded-xl border border-white/80 bg-white/45 p-3">
                  <GlassSelect label="Natureza do crédito" value={entry.creditNature ?? ""} options={[{value:"",label:"Selecionar natureza"},{value:"refund",label:"Estorno de compra"},{value:"cashback",label:"Cashback / recompensa"},{value:"adjustment",label:"Ajuste de fatura"}]} onChange={value=>updateEntry(entry.id,{creditNature:value as CardEntry["creditNature"] || undefined,refundedPurchaseId:undefined,categoryId:undefined,subcategoryId:undefined})}/>
                  {entry.creditNature === "refund" && <>
                    <GlassSelect label="Vincular compra original (opcional)" value={entry.refundedPurchaseId ?? ""} options={[{value:"",label:"Selecionar compra ou classificar manualmente"},...entries.filter(candidate=>candidate.id!==entry.id && candidate.card===entry.card && (candidate.kind??(candidate.amountCents<0?"credit":"purchase"))==="purchase").map(candidate=>({value:candidate.id,label:candidate.date.split("-").reverse().join("/")+" · "+candidate.description+" · "+formatCents(candidate.amountCents)}))]} onChange={value=>{const purchase=entries.find(candidate=>candidate.id===value);updateEntry(entry.id,{refundedPurchaseId:value||undefined,categoryId:purchase?.categoryId,subcategoryId:purchase?.subcategoryId})}}/>
                    <p className="text-xs text-[#64748B]">Vincule a compra original para herdar sua classificação ou escolha a categoria e subcategoria abaixo. O crédito continua reduzindo a fatura.</p>
                  </>}
                  {entry.creditNature === "cashback" && <p className="text-xs text-[#64748B]">Benefício registrado separadamente, sem gerar entrada na conta bancária.</p>}
                  {entry.creditNature === "adjustment" && <p className="text-xs text-[#64748B]">Ajuste da operadora, sem criar receita ou despesa fictícia.</p>}
                </div>}
                <div className="grid gap-2 sm:grid-cols-3">
                  <GlassSelect label="Tipo" value={kind} options={[{value:"purchase",label:"Compra"},{value:"credit",label:"Crédito / estorno"},{value:"payment",label:"Pagamento da fatura"}]} onChange={value=>updateEntry(entry.id,{kind:value as CardEntry["kind"],categoryId:undefined,subcategoryId:undefined,creditNature:undefined,refundedPurchaseId:undefined})}/>
                  <GlassSelect label="Categoria" onCreate={onCategoriesChange ? (name) => { const existing=categories.find(item=>item.type==="expense" && item.name.trim().toLocaleLowerCase("pt-BR")===name.toLocaleLowerCase("pt-BR")); if(existing){updateEntry(entry.id,{categoryId:existing.id,subcategoryId:undefined});return;} const id="category-"+Date.now()+"-"+Math.random().toString(36).slice(2,7);onCategoriesChange([...categories,{id,name,type:"expense",subcategories:[]}]);updateEntry(entry.id,{categoryId:id,subcategoryId:undefined}); } : undefined} disabled={kind!=="purchase" && !(kind==="credit" && entry.creditNature==="refund")} value={entry.categoryId??""} options={[{value:"",label:"Não classificada"},...expenseCategories.map(item=>({value:item.id,label:item.name}))]} onChange={value=>updateEntry(entry.id,{categoryId:value||undefined,subcategoryId:undefined})}/>
                  <GlassSelect label="Subcategoria" createLabel="subcategoria" onCreate={onCategoriesChange ? (name) => { const target=expenseCategories.find(item=>item.id===entry.categoryId); if(!target){return;} const existing=target.subcategories.find(item=>item.name.trim().toLocaleLowerCase("pt-BR")===name.toLocaleLowerCase("pt-BR")); if(existing){updateEntry(entry.id,{subcategoryId:existing.id});return;} const id="subcategory-"+Date.now()+"-"+Math.random().toString(36).slice(2,7);onCategoriesChange(categories.map(item=>item.id===target.id?{...item,subcategories:[...item.subcategories,{id,name}]}:item));updateEntry(entry.id,{subcategoryId:id}); } : undefined} disabled={kind!=="purchase" && !(kind==="credit" && entry.creditNature==="refund")} value={entry.subcategoryId??""} options={[{value:"",label:"Não selecionada"},...(category ? category.subcategories.map(item=>({value:item.id,label:item.name})) : expenseCategories.flatMap(cat=>cat.subcategories.map(item=>({value:cat.id+"::"+item.id,label:item.name,detail:cat.name}))))]} onChange={value=>{if(value.includes("::")){const [catId,subId]=value.split("::");updateEntry(entry.id,{categoryId:catId,subcategoryId:subId})}else updateEntry(entry.id,{subcategoryId:value||undefined})}}/>
                </div>
                <div className="flex justify-end"><button type="button" onClick={() => setEditingEntryId(null)} className="rounded-lg border border-white/80 bg-white/65 px-4 py-2 text-xs font-semibold text-[#526B8B]">Concluir edição</button></div>
              </div>}
            </div>;
          })}
          {filtered.length === 0 && <p className="py-5 text-sm text-[#77879B]">Nenhuma movimentação neste filtro.</p>}
        </div>
        <p className="mt-4 text-xs text-[#77879B]">Os totais acima são informativos e ainda não alimentam a Visão geral. Os registros originais e seus identificadores de importação são preservados.</p>
      </section>}
    </div>
  );
}
