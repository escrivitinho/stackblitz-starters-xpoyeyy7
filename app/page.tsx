
"use client";

import { useEffect, useState } from "react";
import CategoriesManager, { type Category } from "./categories-manager";
import CardsManager, { type CardEntry } from "./cards-manager";
import DriveSettings from "./drive-settings";
import InvestmentsManager from "./investments-manager";
import ClassificationPreview, { excelRules } from "./classification-preview";
import ExcelReclassification from "./excel-reclassification";
import { formatCents, parseMoneyToCents } from "./lib/money";
import {
  calculateTransactionTotals,
  type Transaction,
  type TransactionType,
} from "./transactions";
import {
  calculateAccountBalance,
  calculateTotalBalance,
} from "./account-balances";

type Account = {
  id: number;
  name: string;
  type: string;
  openingBalanceCents: number | null;
  openingBalanceDate: string | null;
  source: "manual" | "statement" | "pending";
};


const initialAccounts: Account[] = [
  {
    id: 1,
    name: "Nubank",
    type: "Conta corrente",
    openingBalanceCents: 123456,
    openingBalanceDate: "2026-01-01",
    source: "manual",
  },
  {
    id: 2,
    name: "Inter",
    type: "Conta corrente",
    openingBalanceCents: null,
    openingBalanceDate: null,
    source: "pending",
  },
  {
    id: 3,
    name: "Caixa",
    type: "Conta corrente",
    openingBalanceCents: null,
    openingBalanceDate: null,
    source: "pending",
  },
];

const normalizedExcelText = (value: string) => value.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().trim();
function mergeExcelCategories(existing: Category[]): Category[] {
  const merged = existing.map(category => ({ ...category, subcategories: [...category.subcategories] }));
  for (const [, name, sub, type] of excelRules) {
    let category = merged.find(item => item.type === type && normalizedExcelText(item.name) === normalizedExcelText(name));
    if (!category) {
      category = { id: "excel-category-" + merged.length + "-" + type, name, type, subcategories: [] };
      merged.push(category);
    }
    if (sub && !category.subcategories.some(item => normalizedExcelText(item.name) === normalizedExcelText(sub))) {
      category.subcategories.push({ id: "excel-sub-" + category.id + "-" + category.subcategories.length, name: sub });
    }
  }
  return merged;
}
function classifyExcelTransaction(transaction: Transaction, categories: Category[]): Transaction {
  if (transaction.type === "transfer" || transaction.internalTransferPairId || transaction.source === "manual") return transaction;
  const isPlaceholder = !transaction.categoryId || normalizedExcelText(transaction.group) === "outros";
  if (!isPlaceholder) return transaction;
  const matches = excelRules.filter(([keyword,, ,type]) => type === transaction.type && normalizedExcelText(transaction.description).includes(normalizedExcelText(keyword)));
  if (!matches.length || new Set(matches.map(([,category,sub]) => normalizedExcelText(category)+"|"+normalizedExcelText(sub))).size !== 1) return transaction;
  const [,categoryName,subName] = [...matches].sort((a,b)=>b[0].length-a[0].length)[0];
  const category = categories.find(item => item.type === transaction.type && normalizedExcelText(item.name) === normalizedExcelText(categoryName));
  const subcategory = category?.subcategories.find(item => normalizedExcelText(item.name) === normalizedExcelText(subName));
  if (!category || !subcategory) return transaction;
  return { ...transaction, categoryId: category.id, subcategoryId: subcategory.id, group: category.name, subcategory: subcategory.name };
}

function normalizeCategories(value: Category[]): Category[] {
  return value.map((category) => ({
    ...category,
    subcategories: category.subcategories.map((subcategory, index) =>
      typeof subcategory === "string"
        ? { id: `${category.id}-legacy-${index}`, name: subcategory }
        : subcategory
    ),
  }));
}

function migrateTransactions(items: Transaction[], categories: Category[]): Transaction[] {
  return items.map((transaction) => {
    const category = categories.find((item) =>
      item.id === transaction.categoryId ||
      (item.type === transaction.type && item.name === transaction.group)
    );
    const subcategory = category?.subcategories.find((item) =>
      item.id === transaction.subcategoryId || item.name === transaction.subcategory
    );
    return {
      ...transaction,
      categoryId: category?.id ?? transaction.categoryId,
      subcategoryId: subcategory?.id ?? transaction.subcategoryId,
    };
  });
}

const initialTransactions: Transaction[] = [];

const navigation = [
  { name: "Visão geral", icon: "▦" },
  { name: "Lançamentos", icon: "⇄" },
  { name: "Categorias", icon: "⌁" },
  { name: "Contas", icon: "▤" },
  { name: "Cartões", icon: "▣" },
  { name: "Investimentos", icon: "◈" },
  { name: "Orçamento", icon: "◷" },
  { name: "Relatórios", icon: "▥" },
];

const initialCategories: Category[] = [
  { id: "expense-housing", name: "Moradia", type: "expense", subcategories: [{ id: "expense-housing-sub-0-aluguel", name: "Aluguel" }, { id: "expense-housing-sub-1-condominio", name: "Condomínio" }, { id: "expense-housing-sub-2-energia", name: "Energia" }, { id: "expense-housing-sub-3-agua", name: "Água" }, { id: "expense-housing-sub-4-internet", name: "Internet" }] },
  { id: "expense-food", name: "Alimentação", type: "expense", subcategories: [{ id: "expense-food-sub-0-supermercado", name: "Supermercado" }, { id: "expense-food-sub-1-restaurante", name: "Restaurante" }, { id: "expense-food-sub-2-delivery", name: "Delivery" }] },
  { id: "expense-transport", name: "Transporte", type: "expense", subcategories: [{ id: "expense-transport-sub-0-combustivel", name: "Combustível" }, { id: "expense-transport-sub-1-aplicativos", name: "Aplicativos" }, { id: "expense-transport-sub-2-transporte-publico", name: "Transporte público" }] },
  { id: "expense-health", name: "Saúde", type: "expense", subcategories: [{ id: "expense-health-sub-0-farmacia", name: "Farmácia" }, { id: "expense-health-sub-1-consultas", name: "Consultas" }, { id: "expense-health-sub-2-exames", name: "Exames" }] },
  { id: "expense-leisure", name: "Lazer", type: "expense", subcategories: [{ id: "expense-leisure-sub-0-viagens", name: "Viagens" }, { id: "expense-leisure-sub-1-entretenimento", name: "Entretenimento" }, { id: "expense-leisure-sub-2-assinaturas", name: "Assinaturas" }] },
  { id: "expense-other", name: "Outros", type: "expense", subcategories: [{ id: "expense-other-sub-0-compras-diversas", name: "Compras diversas" }, { id: "expense-other-sub-1-presentes", name: "Presentes" }, { id: "expense-other-sub-2-outros", name: "Outros" }] },
  { id: "income-salary", name: "Salário", type: "income", subcategories: [{ id: "income-salary-sub-0-salario-clt", name: "Salário CLT" }, { id: "income-salary-sub-1-royalties", name: "Royalties" }, { id: "income-salary-sub-2-adiantamento", name: "Adiantamento" }] },
  { id: "income-investments", name: "Investimentos", type: "income", subcategories: [{ id: "income-investments-sub-0-rendimentos", name: "Rendimentos" }, { id: "income-investments-sub-1-dividendos", name: "Dividendos" }, { id: "income-investments-sub-2-juros", name: "Juros" }] },
  { id: "income-other", name: "Outros", type: "income", subcategories: [{ id: "income-other-sub-0-reembolso", name: "Reembolso" }, { id: "income-other-sub-1-venda", name: "Venda" }, { id: "income-other-sub-2-outras-receitas", name: "Outras receitas" }] },
  { id: "transfer-general", name: "Transferência", type: "transfer", subcategories: [{ id: "transfer-general-sub-0-entre-contas", name: "Entre contas" }] },
];

function money(cents: number | null) {
  if (cents === null) {
    return "Aguardando saldo inicial";
  }

  return formatCents(cents);
}

function AccountLogo({ name }: { name: string }) {
  const styles: Record<string, string> = {
    Nubank: "bg-[#820AD1] text-white",
    Inter: "bg-[#FF7A00] text-white",
    Caixa: "bg-[#075CA8] text-white",
  };

  const initials: Record<string, string> = {
    Nubank: "nu",
    Inter: "in",
    Caixa: "cx",
  };

  return (
    <div
      className={`flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-bold shadow-sm ${
        styles[name] || "bg-slate-200 text-slate-600"
      }`}
    >
      {initials[name] || name.slice(0, 2).toLowerCase()}
    </div>
  );
}

function todayISO() {
  const now = new Date();
  const localDate = new Date(
    now.getTime() - now.getTimezoneOffset() * 60000
  );
  return localDate.toISOString().slice(0, 10);
}

function displayDate(date: string) {
  if (!date) return "";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

export default function Home() {
  const [active, setActive] = useState("Visão geral");

  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [transactions, setTransactions] =
    useState<Transaction[]>(initialTransactions);
  const [categories, setCategories] = useState<Category[]>(mergeExcelCategories(initialCategories));
  const [cardEntries, setCardEntries] = useState<CardEntry[]>([]);
  const [pendingTransactions, setPendingTransactions] = useState<Transaction[]>([]);
  const [transactionTab, setTransactionTab] = useState<"all" | "pending" | "transfers">("all");
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<"all" | "income" | "expense" | "uncategorized">("all");
  const [transactionMonthFilter, setTransactionMonthFilter] = useState("");
  const [rejectedTransferPairs, setRejectedTransferPairs] = useState<string[]>([]);
  const transferPairKey = (a: number, b: number) => [a, b].sort((x, y) => x - y).join(":");
  function confirmTransferPair(outgoingId: number, incomingId: number) {
    if (!window.confirm("Confirmar que esta saída e entrada são uma transferência entre suas próprias contas? Os registros serão preservados, mas deixarão de contar como receita e despesa.")) return;
    const pairId = "internal:" + transferPairKey(outgoingId, incomingId);
    setTransactions((current) => current.map((item) =>
      item.id === outgoingId || item.id === incomingId ? { ...item, internalTransferPairId: pairId } : item
    ));
  }
  function rejectTransferPair(outgoingId: number, incomingId: number) {
    setRejectedTransferPairs((current) => [...current, transferPairKey(outgoingId, incomingId)]);
  }
  const transferSuggestions = transactions
    .filter((item) => item.type === "expense" && !item.internalTransferPairId && /transfer[eê]ncia|\bpix\b|ted|doc/i.test(item.description))
    .flatMap((outgoing) => {
      if (outgoing.type !== "expense") return [];
      const candidates = transactions.filter((incoming) =>
        incoming.type === "income" && !incoming.internalTransferPairId && incoming.accountId !== outgoing.accountId &&
        incoming.amountCents === outgoing.amountCents &&
        Math.abs(Date.parse(incoming.date + "T12:00:00Z") - Date.parse(outgoing.date + "T12:00:00Z")) <= 3 * 86400000 &&
        /transfer[eê]ncia|\bpix\b|ted|doc/i.test(incoming.description)
      );
      return candidates.length === 1 && candidates[0].type === "income" ? [{ outgoing, incoming: candidates[0] }] : [];
    })
    .filter(({ outgoing, incoming }) => !rejectedTransferPairs.includes(transferPairKey(outgoing.id, incoming.id)) && transactions.filter((item) =>
      item.type === "expense" && !item.internalTransferPairId && item.accountId !== incoming.accountId &&
      item.amountCents === incoming.amountCents &&
      Math.abs(Date.parse(item.date + "T12:00:00Z") - Date.parse(incoming.date + "T12:00:00Z")) <= 3 * 86400000 &&
      /transfer[eê]ncia|\bpix\b|ted|doc/i.test(item.description)
    ).length === 1);

  const [transactionSort, setTransactionSort] = useState<"date" | "description" | "category" | "amount">("date");
  const [transactionSortDirection, setTransactionSortDirection] = useState<"asc" | "desc">("desc");
  function changeTransactionSort(column: "date" | "description" | "category" | "amount") {
    if (transactionSort === column) setTransactionSortDirection(current => current === "asc" ? "desc" : "asc");
    else { setTransactionSort(column); setTransactionSortDirection(column === "date" ? "desc" : "asc"); }
  }
  const filteredTransactions = transactions.filter((item) =>
    (transactionTypeFilter === "all" || (transactionTypeFilter === "uncategorized" ? (!item.categoryId || !item.subcategoryId || normalizedExcelText(item.group) === "outros" || normalizedExcelText(item.subcategory) === "outros") : item.type === transactionTypeFilter)) &&
    (!transactionMonthFilter || item.date.startsWith(transactionMonthFilter))
  ).sort((a, b) => {
    const direction = transactionSortDirection === "asc" ? 1 : -1;
    if (transactionSort === "amount") return (a.amountCents - b.amountCents || a.id - b.id) * direction;
    const value = (item: Transaction) => transactionSort === "date" ? item.date : transactionSort === "description" ? (item.displayDescription || item.description) : [categories.find(c => c.id === item.categoryId)?.name || item.group, categories.find(c => c.id === item.categoryId)?.subcategories.find(sub => sub.id === item.subcategoryId)?.name || item.subcategory].join(" ");
    return (value(a).localeCompare(value(b), "pt-BR", { sensitivity: "base" }) || a.id - b.id) * direction;
  });

  const [editId, setEditId] = useState<number | null>(null);
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editSubcategoryId, setEditSubcategoryId] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPaidFor, setEditPaidFor] = useState("");
  const editItem = transactions.find((item) => item.id === editId);
  const editCategories = categories.filter((item) => item.type === (editItem?.type === "income" ? "income" : "expense"));
  const editCategory = editCategories.find((item) => item.id === editCategoryId);
  function startEdit(item: Transaction) {
    setEditId(item.id);
    setEditCategoryId(item.categoryId || "");
    setEditSubcategoryId(item.subcategoryId || "");
    setEditDescription(item.displayDescription || item.description);
    setEditPaidFor(item.paidFor || "");
  }
  function saveEdit() {
    const category = editCategories.find((item) => item.id === editCategoryId);
    const subcategory = category?.subcategories.find((item) => item.id === editSubcategoryId);
    setTransactions((current) => current.map((item) => item.id === editId ? { ...item,
      displayDescription: editDescription.trim() && editDescription.trim() !== item.description ? editDescription.trim() : undefined, paidFor: editPaidFor.trim(),
      categoryId: category?.id, subcategoryId: subcategory?.id,
      group: category?.name || item.group, subcategory: subcategory?.name || (category ? "" : item.subcategory)
    } : item));
    setEditId(null);
  }

  // Persistência local: carregar após a hidratação e só salvar depois da leitura.
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [backupError, setBackupError] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("moneo-finance-v1");
      if (saved) {
        const data: unknown = JSON.parse(saved);
        if (data && typeof data === "object") {
          const stored = data as Record<string, unknown>;
          if (Array.isArray(stored.accounts)) setAccounts(stored.accounts as Account[]);
          if (Array.isArray(stored.cardEntries)) setCardEntries(stored.cardEntries as CardEntry[]);
          if (Array.isArray(stored.pendingTransactions)) setPendingTransactions(stored.pendingTransactions as Transaction[]);
           if (Array.isArray(stored.rejectedTransferPairs)) setRejectedTransferPairs(stored.rejectedTransferPairs as string[]);
          const loadedCategories = mergeExcelCategories(Array.isArray(stored.categories)
            ? normalizeCategories(stored.categories as Category[])
            : initialCategories);
          setCategories(loadedCategories);
          if (Array.isArray(stored.transactions)) {
            setTransactions(migrateTransactions(stored.transactions as Transaction[], loadedCategories).map(item => classifyExcelTransaction(item, loadedCategories)));
          }
        }
      }
    } catch (error) {
      console.error("Não foi possível carregar os dados locais do MONEO.", error);
    } finally {
      setStorageLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!storageLoaded) return;
    try {
      window.localStorage.setItem(
        "moneo-finance-v1",
        JSON.stringify({ accounts, transactions, categories, cardEntries, pendingTransactions, rejectedTransferPairs })
      );
    } catch (error) {
      console.error("Não foi possível salvar os dados locais do MONEO.", error);
    }
  }, [accounts, transactions, categories, cardEntries, pendingTransactions, rejectedTransferPairs, storageLoaded]);


  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null;

  // Formulário de contas
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState("Conta corrente");
  const [balanceMethod, setBalanceMethod] = useState("manual");
  const [initialBalance, setInitialBalance] = useState("");
  const [openingBalanceDate, setOpeningBalanceDate] = useState(todayISO());
  const [accountError, setAccountError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  // Formulário de lançamentos
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [transactionType, setTransactionType] =
    useState<TransactionType>("expense");
  const [transactionDate, setTransactionDate] = useState(todayISO());
  const [transactionDescription, setTransactionDescription] = useState("");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionAccount, setTransactionAccount] = useState("1");
  const [transferDestination, setTransferDestination] = useState("2");
  const [transactionGroup, setTransactionGroup] = useState("Moradia");
  const [transactionSubcategory, setTransactionSubcategory] =
    useState("Aluguel");
  const [paidFor, setPaidFor] = useState("");
  const [transactionError, setTransactionError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"debit" | "credit">("debit");
  const [selectedCreditCard, setSelectedCreditCard] = useState<CardEntry["card"]>("Nubank Crédito");
  const [installmentCount, setInstallmentCount] = useState(1);
  const [invoiceCompetenceOverride, setInvoiceCompetenceOverride] = useState("");
  const [isInstallment, setIsInstallment] = useState(false);
  const [purchaseYear, purchaseMonth] = transactionDate.split("-").map(Number);
  const suggestedInvoice = Number.isInteger(purchaseYear) && purchaseMonth >= 1 && purchaseMonth <= 12 ? new Date(Date.UTC(purchaseYear, purchaseMonth, 1)) : null;
  const suggestedCompetence = suggestedInvoice ? String(suggestedInvoice.getUTCMonth() + 1).padStart(2, "0") + String(suggestedInvoice.getUTCFullYear()) : "";
  const invoiceCompetence = invoiceCompetenceOverride || suggestedCompetence;


const totalBalanceCents = calculateTotalBalance(
  accounts,
  transactions
);

const accountsWithBalance = accounts.filter(
  (account) =>
    account.openingBalanceCents !== null &&
    account.openingBalanceDate !== null
).length;


  const totals = calculateTransactionTotals(transactions);

  const availableGroups = categories
    .filter((category) => category.type === transactionType)
    .reduce<Record<string, string[]>>((groups, category) => {
      groups[category.name] = category.subcategories.map((subcategory) => subcategory.name);
      return groups;
    }, {});

  const availableSubcategories = availableGroups[transactionGroup] || [];

  function exportBackup() {
    if (!storageLoaded) return;
    const payload = {
      app: "moneo-finance",
      version: 1,
      exportedAt: new Date().toISOString(),
      accounts,
      transactions,
      categories,
      cardEntries,
      pendingTransactions,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `moneo-backup-${todayISO()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setBackupError("");
    setBackupMessage("Backup gerado. Guarde o arquivo em um local seguro.");
  }

  async function importBackup(file: File | undefined) {
    if (!file || !storageLoaded) return;
    setBackupError("");
    setBackupMessage("");
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("O arquivo excede 10 MB.");
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object") throw new Error("Arquivo inválido.");
      const data = parsed as Record<string, unknown>;
      if (data.app !== "moneo-finance" || data.version !== 1 ||
          !Array.isArray(data.accounts) || !Array.isArray(data.transactions) ||
          !Array.isArray(data.categories)) {
        throw new Error("Este arquivo não é um backup compatível do MONEO.");
      }
      const validAccounts = data.accounts.every((item: unknown) => {
        if (!item || typeof item !== "object") return false;
        const a = item as Record<string, unknown>;
        return typeof a.id === "number" && typeof a.name === "string" &&
          (a.openingBalanceCents === null || typeof a.openingBalanceCents === "number") &&
          (a.openingBalanceDate === null || typeof a.openingBalanceDate === "string");
      });
      const validCategories = data.categories.every((item: unknown) => {
        if (!item || typeof item !== "object") return false;
        const c = item as Record<string, unknown>;
        return typeof c.id === "string" && typeof c.name === "string" &&
          ["income", "expense", "transfer"].includes(String(c.type)) &&
          Array.isArray(c.subcategories) && c.subcategories.every((sub: unknown) =>
            typeof sub === "string" ||
            (sub !== null && typeof sub === "object" &&
              typeof (sub as { id?: unknown }).id === "string" &&
              typeof (sub as { name?: unknown }).name === "string")
          );
      });
      const validTransactions = data.transactions.every((item: unknown) => {
        if (!item || typeof item !== "object") return false;
        const t = item as Record<string, unknown>;
        return typeof t.id === "number" && typeof t.date === "string" &&
          typeof t.description === "string" && typeof t.amountCents === "number" &&
          Number.isFinite(t.amountCents) && t.amountCents >= 0 &&
          ["income", "expense", "transfer"].includes(String(t.type)) &&
          typeof t.group === "string" && typeof t.subcategory === "string" &&
          (t.type === "transfer"
            ? typeof t.fromAccountId === "number" && typeof t.toAccountId === "number"
            : typeof t.accountId === "number");
      });
      const validCardEntries = data.cardEntries === undefined || (Array.isArray(data.cardEntries) && data.cardEntries.every((item: unknown) => {
        if (!item || typeof item !== "object") return false;
        const c = item as Record<string, unknown>;
        return typeof c.id === "string" && ["Nubank Crédito", "Inter Crédito"].includes(String(c.card)) &&
          typeof c.date === "string" && typeof c.description === "string" &&
          typeof c.amountCents === "number" && Number.isSafeInteger(c.amountCents) && typeof c.importKey === "string";
      }));
      if (!validAccounts || !validCategories || !validTransactions || !validCardEntries) {
        throw new Error("O backup contém registros inválidos.");
      }
      if (!window.confirm("Restaurar este backup? Isso substituirá TODAS as contas, categorias e movimentações deste navegador. Faça um backup atual antes de continuar.")) return;
      const restoredCategories = normalizeCategories(data.categories as Category[]);
      const restoredTransactions = migrateTransactions(data.transactions as Transaction[], restoredCategories);
      // Persistir primeiro: evita mostrar dados restaurados se o navegador estiver sem espaço.
      window.localStorage.setItem("moneo-finance-v1", JSON.stringify({
        accounts: data.accounts, transactions: restoredTransactions, categories: restoredCategories, cardEntries: data.cardEntries ?? [], pendingTransactions: Array.isArray(data.pendingTransactions) ? data.pendingTransactions : [],
      }));
      setAccounts(data.accounts as Account[]);
      setCategories(restoredCategories);
      setTransactions(restoredTransactions);
      setCardEntries((data.cardEntries ?? []) as CardEntry[]);
      setPendingTransactions((Array.isArray(data.pendingTransactions) ? data.pendingTransactions : []) as Transaction[]);
      setSelectedAccountId(null);
      setBackupMessage("Backup restaurado com sucesso neste navegador.");
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "Não foi possível restaurar o backup.");
    }
  }

  function possibleMatches(item: Transaction): Array<{ transaction: Transaction; location: string }> {
    if (item.type === "transfer") return [];
    const normalize = (value: string) => value.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/\\s+/g, " ").trim();
    const matches = (candidate: Transaction) =>
      candidate.type !== "transfer" &&
      candidate.accountId === item.accountId &&
      candidate.date === item.date &&
      candidate.type === item.type &&
      candidate.amountCents === item.amountCents &&
      normalize(candidate.description) === normalize(item.description);
    const confirmed = transactions.filter(matches).map((transaction) => ({ transaction, location: "Já registrado em Lançamentos" }));
    const otherPending = pendingTransactions.filter((candidate) => candidate.id !== item.id && matches(candidate))
      .map((transaction) => ({ transaction, location: "Outra pendência" }));
    return [...confirmed, ...otherPending];
  }

  function goToPage(page: string) {
    setActive(page);
    setSelectedAccountId(null);
    setShowAccountForm(false);
    setShowTransactionForm(false);
  }

  // -----------------------------------------
  // CONTAS
  // -----------------------------------------

  function closeAccountForm() {
    setShowAccountForm(false);
    setAccountName("");
    setAccountType("Conta corrente");
    setBalanceMethod("manual");
    setInitialBalance("");
    setOpeningBalanceDate(todayISO());
    setAccountError("");
    setEditingId(null);
  }

  function saveAccount() {
    setAccountError("");

    if (!accountName.trim()) {
      setAccountError("Informe o nome da instituição financeira.");
      return;
    }

let openingBalanceCents: number | null = null;
    if (balanceMethod === "manual") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(openingBalanceDate) ||
          Number.isNaN(new Date(`${openingBalanceDate}T12:00:00`).getTime()) ||
          new Date(`${openingBalanceDate}T12:00:00`).toISOString().slice(0, 10) !== openingBalanceDate) {
        setAccountError("Informe uma data válida para o saldo inicial.");
        return;
      }
      if (!initialBalance.trim()) {
        setAccountError("Informe o saldo inicial da conta.");
        return;
      }

     try {
openingBalanceCents = parseMoneyToCents(initialBalance);
} catch (error) {
  setAccountError(
    error instanceof Error
      ? error.message
      : "Não foi possível validar o saldo inicial."
  );
  return;
}
    }


  
const newAccount: Account = {
  id: editingId ?? Date.now(),
  name: accountName.trim(),
  type: accountType,
  openingBalanceCents,
  openingBalanceDate:
    openingBalanceCents !== null
      ? openingBalanceDate
      : null,
  source:
    balanceMethod === "manual" ? "manual" : "pending",
};


    if (editingId !== null) {
      setAccounts((current) =>
        current.map((account) =>
          account.id === editingId ? newAccount : account
        )
      );

    } else {
      setAccounts((current) => [...current, newAccount]);
    }

    closeAccountForm();
  }

  function editAccount(account: Account) {
    setAccountName(account.name);
    setAccountType(account.type);
    setBalanceMethod(
      account.source === "statement" ? "statement" : "manual"
    );

    setInitialBalance(
      account.openingBalanceCents === null
        ? ""
        : (account.openingBalanceCents / 100).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
    );

    setOpeningBalanceDate(account.openingBalanceDate ?? todayISO());
    setEditingId(account.id);
    setAccountError("");
    setShowAccountForm(true);
  }

  function removeAccount(id: number) {
    const hasTransactions = transactions.some((transaction) => {
      if (transaction.type === "transfer") {
        return (
          transaction.fromAccountId === id ||
          transaction.toAccountId === id
        );
      }

      return transaction.accountId === id;
    });

    if (hasTransactions) {
      alert(
        "Esta conta possui lançamentos vinculados. Remova ou transfira esses lançamentos antes de excluir a conta."
      );
      return;
    }

    if (confirm("Deseja realmente excluir esta conta?")) {
      setAccounts((current) =>
        current.filter((account) => account.id !== id)
      );

      if (selectedAccount?.id === id) {
        setSelectedAccountId(null);
      }
    }
  }

  // -----------------------------------------
  // LANÇAMENTOS
  // -----------------------------------------

  function resetTransactionForm() {
    setShowTransactionForm(false);
    setTransactionType("expense");
    setTransactionDate(todayISO());
    setTransactionDescription("");
    setTransactionAmount("");
    setTransactionAccount(String(accounts[0]?.id ?? ""));
    setTransferDestination(
      String(accounts[1]?.id ?? accounts[0]?.id ?? "")
    );
    const firstExpense = categories.find((category) => category.type === "expense");
    setTransactionGroup(firstExpense?.name || "");
    setTransactionSubcategory(firstExpense?.subcategories[0]?.name || "");
    setPaidFor("");
    setPaymentMethod("debit");
    setInstallmentCount(1);
    setInvoiceCompetenceOverride("");
    setIsInstallment(false);
    setTransactionError("");
  }

  function changeTransactionType(type: TransactionType) {
    setTransactionType(type);
    setTransactionError("");

    const firstCategory = categories.find((category) => category.type === type);
    setTransactionGroup(firstCategory?.name || "");
    setTransactionSubcategory(firstCategory?.subcategories[0]?.name || "");
  }

  function saveTransaction() {
    setTransactionError("");

    if (!transactionDate) {
      setTransactionError("Informe a data do lançamento.");
      return;
    }

    if (!transactionDescription.trim()) {
      setTransactionError("Informe a descrição do lançamento.");
      return;
    }

    let amountCents: number;

try {
  amountCents = parseMoneyToCents(transactionAmount);
} catch (error) {
  setTransactionError(
    error instanceof Error
      ? error.message
      : "Não foi possível validar o valor informado."
  );
  return;
}

if (amountCents <= 0) {
  setTransactionError(
    "Informe um valor maior que zero. Ex.: 150,00."
  );
  return;
}

    if (transactionType === "expense" && paymentMethod === "credit") {
      const installments = isInstallment ? installmentCount : 1;
      if (!/^\d{6}$/.test(invoiceCompetence) || Number(invoiceCompetence.slice(0, 2)) < 1 || Number(invoiceCompetence.slice(0, 2)) > 12 || Number(invoiceCompetence.slice(2)) < 2000) {
        setTransactionError("Informe uma competência válida no formato MMAAAA."); return;
      }
      if (!Number.isInteger(installments) || installments < 1 || installments > 48) {
        setTransactionError("Escolha entre 1 e 48 parcelas."); return;
      }
      const year = Number(invoiceCompetence.slice(2));
      const month = Number(invoiceCompetence.slice(0, 2));
      const groupId = crypto.randomUUID();
      const base = Math.floor(amountCents / installments);
      const remainder = amountCents % installments;
      const category = categories.find((item) => item.type === "expense" && item.name === transactionGroup);
      const created: CardEntry[] = Array.from({ length: installments }, (_, index) => ({
        id: crypto.randomUUID(), card: selectedCreditCard,
        purchaseDate: transactionDate,
        paidFor: paidFor.trim() || undefined,
        date: new Date(Date.UTC(year, month - 1 + index, selectedCreditCard === "Inter Crédito" ? 7 : 8)).toISOString().slice(0, 10),
        description: transactionDescription.trim() + (installments > 1 ? " - Parcela " + (index + 1) + "/" + installments : ""),
        amountCents: base + (index < remainder ? 1 : 0),
        importKey: "manual-card:" + groupId + ":" + (index + 1),
        categoryId: category?.id,
        subcategoryId: category?.subcategories.find((item) => item.name === transactionSubcategory)?.id,
        kind: "purchase" as const,
      }));
      setCardEntries((current) => [...current, ...created]);
      resetTransactionForm();
      return;
    }
    const accountId = Number(transactionAccount);

    if (!accounts.some((account) => account.id === accountId)) {
      setTransactionError("Selecione uma conta válida.");
      return;
    }

    const common = {
      id: Date.now(),
      date: transactionDate,
      amountCents,
      description: transactionDescription.trim(),
      group:
        transactionType === "transfer"
          ? "Transferência"
          : transactionGroup,
      subcategory:
        transactionType === "transfer"
          ? "Entre contas"
          : transactionSubcategory,
      source: "manual" as const,
      categoryId: categories.find((category) => category.type === transactionType && category.name === (transactionType === "transfer" ? "Transferência" : transactionGroup))?.id,
      subcategoryId: categories.find((category) => category.type === transactionType && category.name === (transactionType === "transfer" ? "Transferência" : transactionGroup))?.subcategories.find((subcategory) => subcategory.name === (transactionType === "transfer" ? "Entre contas" : transactionSubcategory))?.id,
      ...(paidFor.trim() ? { paidFor: paidFor.trim() } : {}),
    };

    let newTransaction: Transaction;

    if (transactionType === "transfer") {
      const destinationId = Number(transferDestination);

      if (
        !accounts.some((account) => account.id === destinationId) ||
        destinationId === accountId
      ) {
        setTransactionError(
          "Escolha uma conta de destino diferente da conta de origem."
        );
        return;
      }

      newTransaction = {
        ...common,
        type: "transfer",
        fromAccountId: accountId,
        toAccountId: destinationId,
      };
    } else if (transactionType === "income") {
      newTransaction = {
        ...common,
        type: "income",
        accountId,
      };
    } else {
      newTransaction = {
        ...common,
        type: "expense",
        accountId,
      };
    }

    setTransactions((current) => [
      newTransaction,
      ...current,
    ]);

    resetTransactionForm();
  }

  function deleteTransaction(id: number) {
    if (confirm("Deseja excluir este lançamento?")) {
      setTransactions((current) =>
        current.filter((transaction) => transaction.id !== id)
      );
    }
  }

  function getCategoryNames(transaction: Transaction) {
    const category = categories.find((item) => item.id === transaction.categoryId)
      ?? categories.find((item) => item.type === transaction.type && item.name === transaction.group);
    const subcategory = category?.subcategories.find((item) => item.id === transaction.subcategoryId)
      ?? category?.subcategories.find((item) => item.name === transaction.subcategory);
    return {
      group: category?.name ?? transaction.group,
      subcategory: subcategory?.name ?? transaction.subcategory,
    };
  }

  function getTransactionAccountName(transaction: Transaction) {
    if (transaction.type === "transfer") {
      const from = accounts.find(
        (account) => account.id === transaction.fromAccountId
      );
      const to = accounts.find(
        (account) => account.id === transaction.toAccountId
      );

      return `${from?.name || "Conta"} → ${to?.name || "Conta"}`;
    }

    return (
      accounts.find(
        (account) => account.id === transaction.accountId
      )?.name || "Conta não encontrada"
    );
  }

  // -----------------------------------------
  // DETALHES DA CONTA
  // -----------------------------------------

  const accountTransactions = selectedAccount
    ? transactions.filter((transaction) => {
        if (transaction.type === "transfer") {
          return (
            transaction.fromAccountId === selectedAccount.id ||
            transaction.toAccountId === selectedAccount.id
          );
        }

        return transaction.accountId === selectedAccount.id;
      })
    : [];

  const accountTotals = calculateTransactionTotals(
    accountTransactions
  );

  return (
    <main className="moneo-app min-h-screen bg-[#F5F5F7] text-[#202B3C] md:flex">

      {/* MENU LATERAL */}
      <aside className="moneo-sidebar flex w-full flex-col bg-white/55 px-5 py-6 text-[#34383F] md:fixed md:inset-y-0 md:h-dvh md:w-[250px] md:overflow-y-auto md:overscroll-contain">
        <div className="mb-10 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#D8E5F5] text-xl font-bold text-[#14243D]">
            M
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-wide">MONEO</h1>
            <p className="text-[10px] tracking-[3px] text-slate-400">FINANCE</p>
          </div>
        </div>

        <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[2px] text-slate-500">
          Menu principal
        </p>

        <nav className="flex flex-wrap gap-1 md:flex-col">
          {navigation.map((item) => (
            <button
              key={item.name}
              onClick={() => goToPage(item.name)}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${
                active === item.name
                  ? "bg-white/80 font-medium text-[#25282D] shadow-sm ring-1 ring-white/80"
                  : "text-[#707780] hover:bg-white/60 hover:text-[#25282D]"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.name}
            </button>
          ))}
        </nav>

        <div className="mt-8 hidden rounded-2xl border border-white/60 bg-white/55 p-4 md:block">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white/60 text-lg">
            ✧
          </div>
          <p className="text-sm font-medium">Seu planejamento</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Acompanhe suas metas e mantenha suas finanças em equilíbrio.
          </p>
          <button
            onClick={() => goToPage("Orçamento")}
            className="mt-4 text-xs font-semibold text-[#B9D0ED]"
          >
            Ver orçamento →
          </button>
        </div>

        <div className="mt-auto hidden shrink-0 border-t border-white/60 pt-5 md:block">
          <button
            onClick={() => goToPage("Configurações")}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400 hover:bg-white/35"
          >
            ⚙ Configurações
          </button>
          <div className="mt-4 flex items-center gap-3 px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#D7E3F1] text-sm font-semibold text-[#14243D]">
              V
            </div>
            <div>
              <p className="text-sm font-medium">Meu perfil</p>
              <p className="text-xs text-slate-400">Conta pessoal</p>
            </div>
          </div>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <section className="min-w-0 flex-1 px-5 py-7 md:ml-[250px] md:px-9 md:py-9 lg:px-12">

        {/* CABEÇALHO */}
        <header className="mb-9 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-medium text-[#8A96A7]">
              MONEO FINANCE
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-[#17263D] md:text-3xl">
              {selectedAccount
                ? selectedAccount.name
                : active}
            </h2>
            <p className="mt-1 text-sm text-[#8A96A7]">
              {selectedAccount
                ? "Consulte o saldo e acompanhe as movimentações desta conta."
                : active === "Contas"
                ? "Gerencie suas contas e acompanhe seu dinheiro disponível."
                : active === "Lançamentos"
                ? "Registre e acompanhe suas movimentações financeiras."
                : "Acompanhe suas finanças em um só lugar."}
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white bg-white/70 text-sm font-semibold text-[#294263] shadow-sm backdrop-blur-xl">
            V
          </div>
        </header>

        {/* ================================== */}
        {/* VISÃO GERAL */}
        {/* ================================== */}

        {active === "Visão geral" && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-3">
              {([["income", "+ Nova receita"], ["expense", "+ Nova despesa"]] as [TransactionType, string][]).map(([type, label]) => (
                <button key={type} type="button" onClick={() => {
                  resetTransactionForm();
                  changeTransactionType(type);
                  setShowTransactionForm(true);
                  setActive("Lançamentos");
                }} className={`rounded-2xl border px-5 py-3 text-sm font-semibold backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 ${type === "income" ? "border-emerald-200/80 bg-gradient-to-br from-emerald-100/85 via-emerald-200/65 to-emerald-300/55 text-emerald-900 shadow-[0_6px_22px_rgba(16,185,129,0.13),inset_0_1px_1px_rgba(255,255,255,0.9)] hover:from-emerald-100 hover:to-emerald-300/75" : "border-rose-200/80 bg-gradient-to-br from-rose-100/85 via-rose-200/65 to-rose-300/55 text-rose-900 shadow-[0_6px_22px_rgba(244,63,94,0.12),inset_0_1px_1px_rgba(255,255,255,0.9)] hover:from-rose-100 hover:to-rose-300/75"}`}>{label}</button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="group relative isolate overflow-hidden rounded-3xl border border-white/90 bg-white/65 p-6 shadow-[0_8px_32px_rgba(80,110,150,0.10)] backdrop-blur-2xl">
                <div className="pointer-events-none absolute -right-10 -top-16 -z-10 h-48 w-48 rounded-full bg-sky-200/70 blur-[65px]" />
                <p className="text-sm font-medium text-[#63758D]">Dinheiro disponível</p>
                <h3 className="mt-7 text-3xl font-semibold text-[#233C5B]">
                  {money(totalBalanceCents)}
                </h3>
                <p className="mt-2 text-xs text-[#7D8FA5]">Saldos iniciais e movimentações nas contas</p>
              </div>

              <div className="group relative isolate overflow-hidden rounded-3xl border border-white/90 bg-white/65 p-6 shadow-[0_8px_32px_rgba(100,90,150,0.10)] backdrop-blur-2xl">
                <div className="pointer-events-none absolute -right-10 -top-16 -z-10 h-48 w-48 rounded-full bg-violet-200/70 blur-[65px]" />
                <p className="text-sm font-medium text-[#756D91]">Dinheiro investido</p>
                <h3 className="mt-7 text-3xl font-semibold text-[#40385F]">R$ 18.610,00</h3>
                <p className="mt-2 text-xs text-[#938BAA]">Valor alocado em investimentos</p>
              </div>
            </div>

            <div className="relative isolate overflow-hidden rounded-3xl border border-white/90 bg-white/55 px-6 py-5 shadow-[0_8px_32px_rgba(80,110,150,0.08)] backdrop-blur-2xl">
              <p className="text-sm text-[#77879B]">Patrimônio total</p>
              <h3 className="mt-2 text-2xl font-semibold text-[#263D59]">
                {money(totalBalanceCents + 1861000)}
              </h3>
              <p className="mt-1 text-xs text-[#8B9AAD]">Disponível + investido · investimento demonstrativo</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/90 bg-white/60 p-5 shadow-sm backdrop-blur-2xl">
                <p className="text-sm text-[#8491A3]">Receitas registradas</p>
                <h3 className="mt-4 text-2xl font-semibold text-[#247D5A]">
                  {money(totals.incomeCents)}
                </h3>
              </div>
              <div className="rounded-2xl border border-white/90 bg-white/60 p-5 shadow-sm backdrop-blur-2xl">
                <p className="text-sm text-[#8491A3]">Despesas registradas</p>
                <h3 className="mt-4 text-2xl font-semibold text-[#B65D58]">
                  {money(totals.expenseCents)}
                </h3>
              </div>
            </div>


          </div>
        )}

        {/* ================================== */}
        {/* LANÇAMENTOS */}
        {/* ================================== */}

        {active === "Lançamentos" && (
          <div className="space-y-6">

            {/* RESUMO */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/90 bg-white/65 p-5 shadow-sm backdrop-blur-2xl">
                <p className="text-sm text-[#77879B]">Receitas</p>
                <h3 className="mt-3 text-2xl font-semibold text-[#247D5A]">
                  {money(totals.incomeCents)}
                </h3>
              </div>
              <div className="rounded-3xl border border-white/90 bg-white/65 p-5 shadow-sm backdrop-blur-2xl">
                <p className="text-sm text-[#77879B]">Despesas</p>
                <h3 className="mt-3 text-2xl font-semibold text-[#B65D58]">
                  {money(totals.expenseCents)}
                </h3>
              </div>
              <div className="rounded-3xl border border-white/90 bg-white/65 p-5 shadow-sm backdrop-blur-2xl">
                <p className="text-sm text-[#77879B]">Resultado</p>
                <h3 className="mt-3 text-2xl font-semibold text-[#263D59]">
                  {money(totals.incomeCents - totals.expenseCents)}
                </h3>
              </div>
            </div>

            {/* TÍTULO E BOTÃO */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-[#26364D]">Movimentações</h3>
                <p className="mt-1 text-sm text-[#94A0AF]">
                  Consulte, registre e organize suas movimentações.
                </p>
              </div>
              <button
                onClick={() => {
                  resetTransactionForm();
                  setShowTransactionForm(true);
                }}
                className="rounded-xl bg-[#34383F] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-blue-900/10 transition hover:bg-[#25282D]"
              >
                + Novo lançamento
              </button>
            </div>

            {/* FORMULÁRIO */}
            {showTransactionForm && (
              <div className="rounded-3xl border border-white/90 bg-white/75 p-6 shadow-[0_8px_32px_rgba(80,110,150,0.10)] backdrop-blur-2xl">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-[#26364D]">Novo lançamento</h3>
                    <p className="mt-1 text-xs text-[#94A0AF]">
                      Preencha os dados da movimentação.
                    </p>
                  </div>
                  <button onClick={resetTransactionForm} className="text-xl text-[#8A96A7]">×</button>
                </div>

                {/* TIPO */}
                <div className="mb-6 grid grid-cols-3 gap-2">
                  {([
                    ["income", "Receita"],
                    ["expense", "Despesa"],
                    ["transfer", "Transferência"],
                  ] as [TransactionType, string][]).map(([type, label]) => (
                    <button
                      key={type}
                      onClick={() => changeTransactionType(type)}
                      className={`rounded-xl border px-3 py-3 text-sm font-medium transition ${
                        transactionType === type
                          ? "border-[#A7A9AF] bg-white/70 text-[#294263]"
                          : "border-[#E2E8F0] bg-white/60 text-[#8290A2] hover:bg-white"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                  {transactionType === "expense" && (
                    <div className="mb-5 space-y-2">
                      <span className="text-xs font-medium text-[#64748B]">Forma de pagamento</span>
                      <div className="grid grid-cols-2 gap-3">
                        <button type="button" onClick={() => setPaymentMethod("debit")} className={paymentMethod === "debit" ? "rounded-2xl border border-sky-300 bg-sky-100/70 px-4 py-3 text-sm backdrop-blur-xl" : "rounded-2xl border border-white/80 bg-white/60 px-4 py-3 text-sm backdrop-blur-xl"}>Débito / Pix</button>
                        <button type="button" onClick={() => setPaymentMethod("credit")} className={paymentMethod === "credit" ? "rounded-2xl border border-sky-300 bg-sky-100/70 px-4 py-3 text-sm backdrop-blur-xl" : "rounded-2xl border border-white/80 bg-white/60 px-4 py-3 text-sm backdrop-blur-xl"}>Crédito</button>
                      </div>
                    </div>
                  )}

                  <div className="mb-5 space-y-2">
                    <span className="text-xs font-medium text-[#64748B]">{transactionType === "expense" && paymentMethod === "credit" ? "Cartão" : "Conta"}</span>
                    <div className="flex flex-wrap justify-center gap-3">
                      {(transactionType === "expense" && paymentMethod === "credit" ? (["Nubank Crédito", "Inter Crédito"] as CardEntry["card"][]) : [...accounts].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).map((account) => account.name)).map((name, index) => {
                        const account = transactionType === "expense" && paymentMethod === "credit" ? null : accounts.find((item) => item.name === name);
                        const selected = account ? transactionAccount === String(account.id) : selectedCreditCard === name;
                        const tone = name.toLowerCase().includes("nubank") ? "violet" : name.toLowerCase().includes("inter") ? "orange" : name.toLowerCase().includes("caixa") ? "sky" : "teal";
                        const palette = {
                          violet: selected ? "border-violet-400/80 bg-violet-200/75 text-violet-950 shadow-[0_6px_22px_rgba(139,92,246,0.18)]" : "border-violet-200/80 bg-violet-100/55 text-violet-800",
                          orange: selected ? "border-orange-400/80 bg-orange-200/75 text-orange-950 shadow-[0_6px_22px_rgba(249,115,22,0.18)]" : "border-orange-200/80 bg-orange-100/55 text-orange-800",
                          sky: selected ? "border-sky-400/80 bg-sky-200/75 text-sky-950 shadow-[0_6px_22px_rgba(14,165,233,0.18)]" : "border-sky-200/80 bg-sky-100/55 text-sky-800",
                          teal: selected ? "border-teal-400/80 bg-teal-200/75 text-teal-950 shadow-[0_6px_22px_rgba(20,184,166,0.18)]" : "border-teal-200/80 bg-teal-100/55 text-teal-800",
                        };
                        return <button key={account?.id ?? name} type="button" aria-pressed={selected} onClick={() => account ? setTransactionAccount(String(account.id)) : setSelectedCreditCard(name as CardEntry["card"])} className={`flex min-h-12 w-44 items-center justify-center rounded-2xl border px-4 py-3 text-center text-sm font-semibold backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:shadow-lg ${palette[tone]}`}>{name}{selected ? " ✓" : ""}</button>;
                      })}
                    </div>
                  </div>
                  {transactionType === "expense" && paymentMethod === "credit" && (
                    <div className="mb-5 grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                    <span className="text-xs font-medium text-[#64748B]">{transactionType === "expense" && paymentMethod === "credit" ? "Data da compra" : "Data"}</span>
                    <input
                      type="date"
                      value={transactionDate}
                      onChange={(e) => { setTransactionDate(e.target.value); setInvoiceCompetenceOverride(""); }}
                      className="w-full rounded-xl border border-[#E2E8F0] bg-white/80 px-4 py-3 text-sm outline-none focus:border-[#A7A9AF]"
                    />
                  </label>
                      <label className="space-y-2">
                        <span className="text-xs font-medium text-[#64748B]">Competência da fatura (MM/AAAA)</span>
                        <input value={invoiceCompetence.length > 2 ? invoiceCompetence.slice(0, 2) + "/" + invoiceCompetence.slice(2) : invoiceCompetence}
                          onChange={(e) => setInvoiceCompetenceOverride(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          inputMode="numeric" maxLength={7} placeholder="MMAAAA"
                          className="w-full rounded-xl border border-[#E2E8F0] bg-white/80 px-4 py-3 text-sm outline-none focus:border-[#A7A9AF]" />
                      </label>
                    </div>
                  )}
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">

                  <div className={`grid gap-4 ${transactionType === "expense" && paymentMethod === "credit" ? "md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]" : "md:grid-cols-2"} md:col-span-2`}>
                    <label className="space-y-2">
                    <span className="text-xs font-medium text-[#64748B]">Descrição</span>
                    <input
                      value={transactionDescription}
                      onChange={(e) => setTransactionDescription(e.target.value)}
                      placeholder="Ex.: Supermercado"
                      className="w-full rounded-xl border border-[#E2E8F0] bg-white/80 px-4 py-3 text-sm outline-none focus:border-[#A7A9AF]"
                    />
                  </label>
                    <label className="space-y-2">
                    <span className="text-xs font-medium text-[#64748B]">Valor (R$)</span>
                    <input
                      value={transactionAmount}
                      onChange={(e) => setTransactionAmount(e.target.value)}
                      placeholder="Ex.: 150,00"
                      inputMode="decimal"
                      className="w-full rounded-xl border border-[#E2E8F0] bg-white/80 px-4 py-3 text-sm outline-none focus:border-[#A7A9AF]"
                    />
                  </label>
                    {transactionType === "expense" && paymentMethod === "credit" && <div className="space-y-2">
                      <span className="block text-xs font-medium text-[#64748B]">Parcelado?</span>
                      <div className="flex gap-2">
                        {([false, true] as const).map((choice) => <button type="button" key={String(choice)} onClick={() => { setIsInstallment(choice); setInstallmentCount(choice ? 2 : 1); }} aria-pressed={isInstallment === choice}
                          className={`flex-1 rounded-xl border px-3 py-3 text-sm backdrop-blur-xl ${isInstallment === choice ? "border-sky-300 bg-sky-100/80 text-sky-900" : "border-white/80 bg-white/60 text-[#64748B]"}`}>{choice ? "Sim" : "Não"}</button>)}
                      </div>
                      {isInstallment && <label className="block space-y-1"><span className="text-xs text-[#64748B]">Quantidade de parcelas</span><input type="number" min={2} max={48} value={installmentCount < 2 ? 2 : installmentCount} onChange={(e) => setInstallmentCount(Number(e.target.value))} className="w-full rounded-xl border border-[#E2E8F0] bg-white/80 px-3 py-2 text-sm" /></label>}
                    </div>}
                  </div>
                  {!(transactionType === "expense" && paymentMethod === "credit") && <label className="space-y-2">
                    <span className="text-xs font-medium text-[#64748B]">{transactionType === "expense" && paymentMethod === "credit" ? "Data da compra" : "Data"}</span>
                    <input
                      type="date"
                      value={transactionDate}
                      onChange={(e) => { setTransactionDate(e.target.value); setInvoiceCompetenceOverride(""); }}
                      className="w-full rounded-xl border border-[#E2E8F0] bg-white/80 px-4 py-3 text-sm outline-none focus:border-[#A7A9AF]"
                    />
                  </label>}
                  {transactionType === "transfer" ? (
                    <label className="space-y-2 md:col-span-2">
                      <span className="text-xs font-medium text-[#64748B]">Conta de destino</span>
                      <select
                        value={transferDestination}
                        onChange={(e) => setTransferDestination(e.target.value)}
                        className="w-full rounded-xl border border-[#E2E8F0] bg-white/80 px-4 py-3 text-sm outline-none"
                      >
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <>
                      <label className="space-y-2">
                        <span className="text-xs font-medium text-[#64748B]">Categoria</span>
                        <select
                          value={transactionGroup}
                          onChange={(e) => {
                            setTransactionGroup(e.target.value);
                            setTransactionSubcategory(
                              (availableGroups[e.target.value] || [])[0] || ""
                            );
                          }}
                          className="w-full rounded-xl border border-[#E2E8F0] bg-white/80 px-4 py-3 text-sm outline-none"
                        >
                          {Object.keys(availableGroups).map((group) => (
                            <option key={group} value={group}>{group}</option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-2">
                        <span className="text-xs font-medium text-[#64748B]">Subcategoria</span>
                        <select
                          value={transactionSubcategory}
                          onChange={(e) => setTransactionSubcategory(e.target.value)}
                          className="w-full rounded-xl border border-[#E2E8F0] bg-white/80 px-4 py-3 text-sm outline-none"
                        >
                          {availableSubcategories.map((subcategory) => (
                            <option key={subcategory} value={subcategory}>{subcategory}</option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-2 md:col-span-2">
                        <span className="text-xs font-medium text-[#64748B]">
                          Por conta de quem? (opcional)
                        </span>
                        <input
                          value={paidFor}
                          onChange={(e) => setPaidFor(e.target.value)}
                          placeholder="Ex.: João — compra que será reembolsada"
                          className="w-full rounded-xl border border-[#E2E8F0] bg-white/80 px-4 py-3 text-sm outline-none focus:border-[#A7A9AF]"
                        />
                      </label>
                    </>
                  )}
                </div>

                {transactionError && (
                  <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {transactionError}
                  </div>
                )}

                {transactionType === "transfer" && (
                  <p className="mt-5 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-xs leading-5 text-[#617B9B]">
                    Transferências não entram nos totais de receitas e despesas.
                    O valor será registrado como saída da conta de origem e entrada
                    na conta de destino quando implementarmos a atualização dos saldos.
                  </p>
                )}

                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <button
                    onClick={resetTransactionForm}
                    className="rounded-xl border border-[#E2E8F0] bg-white/70 px-5 py-3 text-sm text-[#64748B]"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={saveTransaction}
                    className="rounded-xl bg-[#34383F] px-6 py-3 text-sm font-medium text-white hover:bg-[#25282D]"
                  >
                    Salvar lançamento
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {([
                ["all", `Todos os lançamentos (${transactions.length})`],
                ["pending", `Pendentes verificação (${pendingTransactions.length})`],
                ["transfers", `Possíveis transferências (${transferSuggestions.length})`],
              ] as const).map(([tab, label]) => (
                <button key={tab} type="button" onClick={() => setTransactionTab(tab)}
                  aria-pressed={transactionTab === tab}
                  className={`w-full rounded-xl px-4 py-2 text-sm font-semibold sm:w-[220px] ${transactionTab === tab ? "bg-[#34383F] text-white" : "border border-[#DCE5EF] bg-white text-[#526B8B]"}`}>
                  {label}
                </button>
              ))}
            </div>
            {transactionTab === "pending" && <div className="rounded-3xl border border-white/90 bg-white/65 p-5 shadow-sm md:p-6">
              <h3 className="font-semibold text-[#26364D]">Pendentes verificação</h3>
              <p className="mt-1 text-xs text-[#64748B]">Compare o lançamento recebido com os registros semelhantes. Nenhuma pendência altera saldos ou relatórios antes da aprovação.</p>
              {pendingTransactions.length === 0 ? <p className="mt-5 text-sm text-[#64748B]">Nenhuma movimentação aguardando verificação.</p> :
                <div className="mt-4 space-y-5">{pendingTransactions.map((item) => {
                  const matches = possibleMatches(item);
                  const accountName = item.type === "transfer" ? "Transferência" : accounts.find((a) => a.id === item.accountId)?.name || "Conta não encontrada";
                  return <div key={item.id} className="rounded-2xl border border-[#DCE5EF] bg-white/75 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[#26364D]">Conferência de movimentação</p>
                      <span className="text-xs text-[#64748B]">{matches.length} registro(s) semelhante(s)</span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                        <p className="mb-2 text-xs font-semibold text-amber-900">Pendente — recebido do extrato</p>
                        <p className="break-words text-sm font-medium text-[#35445A]">{item.description}</p>
                        <p className="mt-2 text-xs text-[#64748B]">Data: {displayDate(item.date)}</p>
                        <p className="text-xs text-[#64748B]">Banco: {accountName}</p>
                        <p className="text-xs text-[#64748B]">Tipo: {item.type === "income" ? "Receita" : item.type === "expense" ? "Despesa" : "Transferência"}</p>
                        <p className="mt-2 text-sm font-semibold">{item.type === "expense" ? "−" : "+"}{money(item.amountCents)}</p>
                      </div>
                      <div className="rounded-xl border border-[#DCE5EF] bg-[#F7F9FC] p-3">
                        <p className="mb-2 text-xs font-semibold text-[#526B8B]">Possível duplicidade — comparação</p>
                        {matches.length ? <div className="space-y-3">{matches.map(({ transaction: candidate, location }) => <div key={location + candidate.id} className="border-b border-[#DCE5EF] pb-3 last:border-0 last:pb-0">
                          <p className="text-[11px] font-semibold text-[#526B8B]">{location}</p>
                          <p className="mt-1 break-words text-sm font-medium text-[#35445A]">{candidate.description}</p>
                          <p className="mt-2 text-xs text-[#64748B]">Data: {displayDate(candidate.date)}</p>
                          <p className="text-xs text-[#64748B]">Banco: {accounts.find((a) => a.id === (candidate.type === "transfer" ? candidate.fromAccountId : candidate.accountId))?.name || "Conta não encontrada"}</p>
                          <p className="text-xs text-[#64748B]">Tipo: {candidate.type === "income" ? "Receita" : candidate.type === "expense" ? "Despesa" : "Transferência"}</p>
                          <p className="mt-2 text-sm font-semibold">{candidate.type === "expense" ? "−" : "+"}{money(candidate.amountCents)}</p>
                        </div>)}</div> : <p className="text-xs leading-5 text-[#64748B]">Nenhum registro correspondente foi encontrado entre os lançamentos atuais ou outras pendências. A suspeita pode ter sido identificada durante a leitura dos extratos, ou o registro original pode ter sido alterado.</p>}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <button type="button" className="rounded-lg bg-[#34383F] px-4 py-2 text-xs font-semibold text-white" onClick={() => {
                        if (!window.confirm("Você verificou os registros semelhantes e confirma que esta movimentação é nova? Aprovar adicionará um lançamento e afetará seus saldos.")) return;
                        setTransactions((current) => [...current, { ...item, id: Math.max(Date.now(), ...current.map((t) => t.id + 1)) }]);
                        setPendingTransactions((current) => current.filter((t) => t.id !== item.id));
                      }}>Aprovar lançamento</button>
                      <button type="button" className="rounded-lg border border-[#DCE5EF] px-4 py-2 text-xs font-semibold" onClick={() => {
                        if (window.confirm("Descartar somente esta pendência? Nenhum lançamento confirmado será excluído.")) setPendingTransactions((current) => current.filter((t) => t.id !== item.id));
                      }}>Descartar pendência</button>
                    </div>
                  </div>;
                })}</div>}
            </div>}
            {editItem && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={() => setEditId(null)}>
              <div role="dialog" aria-modal="true" aria-label="Classificar lançamento" onClick={(event) => event.stopPropagation()} className="w-full max-w-xl space-y-4 rounded-3xl border border-white bg-[#F8FAFD] p-6 shadow-2xl">
                <h3 className="text-lg font-semibold text-[#26364D]">Classificar lançamento</h3>
                <p className="text-xs text-[#64748B]">{displayDate(editItem.date)} · {getTransactionAccountName(editItem)} · {money(editItem.amountCents)}</p>
                <label className="block space-y-2"><span className="text-xs text-[#64748B]">Descrição exibida (o texto original do extrato será preservado)</span><input value={editDescription} onChange={(event) => setEditDescription(event.target.value)} className="w-full rounded-xl border border-[#E2E8F0] bg-white p-3 text-sm" /></label>
                {editItem.type !== "transfer" && <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-2"><span className="text-xs text-[#64748B]">Categoria</span><select value={editCategoryId} onChange={(event) => { setEditCategoryId(event.target.value); setEditSubcategoryId(""); }} className="w-full rounded-xl border border-[#E2E8F0] bg-white p-3 text-sm"><option value="">Selecione</option>{editCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label className="block space-y-2"><span className="text-xs text-[#64748B]">Subcategoria</span><select value={editSubcategoryId} onChange={(event) => setEditSubcategoryId(event.target.value)} className="w-full rounded-xl border border-[#E2E8F0] bg-white p-3 text-sm"><option value="">Selecione</option>{editCategory?.subcategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                </div>}
                <label className="block space-y-2"><span className="text-xs text-[#64748B]">Por conta de quem? (opcional)</span><input value={editPaidFor} onChange={(event) => setEditPaidFor(event.target.value)} className="w-full rounded-xl border border-[#E2E8F0] bg-white p-3 text-sm" /></label>
                <p className="text-xs text-[#64748B]">A classificação não altera valor, data, conta ou origem importada. Vamos tratar transferências na próxima etapa.</p>
                <div className="flex justify-end gap-3"><button type="button" onClick={() => setEditId(null)} className="rounded-xl border border-[#DCE5EF] bg-white px-5 py-3 text-sm">Cancelar</button><button type="button" onClick={saveEdit} className="rounded-xl bg-[#34383F] px-5 py-3 text-sm text-white">Salvar classificação</button></div>
              </div>
            </div>}
            {transactionTab === "transfers" && <div className="rounded-3xl border border-white/90 bg-white/65 p-4 shadow-sm backdrop-blur-2xl md:p-5">
              <h3 className="text-sm font-semibold text-[#26364D]">Possíveis transferências entre contas</h3>
              <p className="mt-1 text-xs text-[#64748B]">{transferSuggestions.length} par(es) aguardando sua decisão. Confirme apenas movimentações entre suas próprias contas.</p>
              <div className="mt-4 space-y-3">
                {transferSuggestions.length === 0 ? <p className="text-sm text-[#64748B]">Nenhuma sugestão pendente de análise.</p> :
                  transferSuggestions.map(({ outgoing, incoming }) => <div key={String(outgoing.id) + ":" + String(incoming.id)} className="flex flex-col gap-3 rounded-2xl border border-[#E2E8F0] bg-white/75 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-amber-700">{money(outgoing.amountCents)} · possível transferência</p>
                      <p className="mt-2 break-words text-xs text-[#64748B]"><span className="font-semibold text-rose-600">Saída:</span> {displayDate(outgoing.date)} · {accounts.find((account) => account.id === outgoing.accountId)?.name || "Conta desconhecida"} · {outgoing.description}</p>
                      <p className="mt-2 break-words text-xs text-[#64748B]"><span className="font-semibold text-emerald-600">Entrada:</span> {displayDate(incoming.date)} · {accounts.find((account) => account.id === incoming.accountId)?.name || "Conta desconhecida"} · {incoming.description}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button type="button" onClick={() => confirmTransferPair(outgoing.id, incoming.id)} className="rounded-xl border border-amber-300/80 bg-amber-300/45 px-4 py-2.5 text-xs font-semibold text-amber-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_4px_16px_rgba(245,158,11,0.12)] backdrop-blur-xl transition-all hover:bg-amber-300/65">Confirmar transferência</button>
                      <button type="button" onClick={() => rejectTransferPair(outgoing.id, incoming.id)} className="rounded-xl border border-rose-300/80 bg-rose-300/35 px-4 py-2.5 text-xs font-semibold text-rose-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_4px_16px_rgba(244,63,94,0.10)] backdrop-blur-xl transition-all hover:bg-rose-300/55">Não é transferência</button>
                    </div>
                  </div>)}
              </div>
            </div>}
                        {transactionTab === "all" && <>
            {/* LISTA */}
            <div className="rounded-3xl border border-white/90 bg-white/65 p-5 shadow-[0_8px_32px_rgba(80,110,150,0.07)] backdrop-blur-2xl md:p-6">
              <div className="mb-5">
                <h3 className="font-semibold text-[#26364D]">Todos os lançamentos</h3>
                <p className="mt-1 text-xs text-[#94A0AF]">
                  Exibindo {filteredTransactions.length} de {transactions.length} movimentação(ões)
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    {([
                      ["all", "Todos"],
                      ["income", "Receitas"],
                      ["expense", "Despesas"],
                      ["uncategorized", "Sem categoria"],
                    ] as const).map(([filter, label]) => (
                      <button key={filter} type="button" onClick={() => setTransactionTypeFilter(filter)}
                        aria-pressed={transactionTypeFilter === filter}
                        className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold backdrop-blur-xl transition-all ${transactionTypeFilter === filter
                          ? filter === "income" ? "border-emerald-300/80 bg-emerald-300/45 text-emerald-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]" : filter === "expense" ? "border-rose-300/80 bg-rose-300/45 text-rose-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]" : "border-slate-300 bg-white/90 text-[#35445A] shadow-sm"
                          : "border-white/90 bg-white/55 text-[#64748B] hover:bg-white/85"}`}>{label}</button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 rounded-2xl border border-white/90 bg-white/65 px-3 py-2 backdrop-blur-xl">
                    <span className="text-xs font-medium text-[#64748B]">Mês</span>
                    <input type="month" value={transactionMonthFilter} onChange={(event) => setTransactionMonthFilter(event.target.value)}
                      aria-label="Filtrar lançamentos por mês" className="min-w-0 bg-transparent text-sm text-[#35445A] outline-none" />
                    {transactionMonthFilter && <button type="button" onClick={() => setTransactionMonthFilter("")} className="text-xs font-medium text-[#77879B] hover:text-[#35445A]">Limpar</button>}
                  </label>
                </div>
              </div>

              {filteredTransactions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#D5DFEA] bg-white/40 px-5 py-12 text-center">
                  <div className="text-3xl text-[#91A9C8]">⇄</div>
                  <h4 className="mt-3 font-medium text-[#43536A]">
                    Nenhum lançamento encontrado
                  </h4>
                  <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-[#94A0AF]">
                    Tente alterar os filtros ou cadastre uma nova receita, despesa ou transferência.
                  </p>
                  <button
                    onClick={() => setShowTransactionForm(true)}
                    className="mt-5 rounded-xl bg-[#34383F] px-5 py-3 text-sm font-medium text-white"
                  >
                    + Novo lançamento
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="hidden grid-cols-[100px_minmax(180px,2fr)_minmax(140px,1.4fr)_120px_60px] gap-3 border-b border-[#E2E8F0] pb-3 text-xs font-semibold uppercase tracking-wide text-[#8190A4] md:grid">
                    {(["date", "description", "category", "amount"] as const).map((column) => <button key={column} type="button" onClick={() => changeTransactionSort(column)} aria-label={`Ordenar por ${column}`} aria-pressed={transactionSort === column} className={`flex items-center gap-1 text-left hover:text-[#334B75] ${column === "amount" ? "justify-end" : ""}`}>{({date:"Data",description:"Descrição",category:"Categoria / Subcategoria",amount:"Valor"} as const)[column]} <span aria-hidden="true">{transactionSort === column ? (transactionSortDirection === "asc" ? "↑" : "↓") : "↕"}</span></button>)}<span />
                  </div>
                  {filteredTransactions.map((transaction) => (
                    <div key={transaction.id} className="grid grid-cols-[80px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[#EDF0F4] py-4 last:border-0 md:grid-cols-[100px_minmax(180px,2fr)_minmax(140px,1.4fr)_120px_60px]">
                      <span className="text-xs text-[#64748B]">{displayDate(transaction.date)}</span>
                      <button type="button" onClick={() => startEdit(transaction)} title="Editar descrição exibida e classificação" className="min-w-0 text-left">
                        <span className="block break-words text-sm font-medium text-[#35445A] hover:text-blue-700">{transaction.displayDescription || transaction.description}</span>
                        <span className="mt-1 block text-[11px] text-[#94A0AF]">{getTransactionAccountName(transaction)}</span>
                      </button>
                      <div className="col-span-2 min-w-0 pl-[92px] md:col-span-1 md:pl-0">
                        <p className="break-words text-xs font-medium text-[#526B8B]">{getCategoryNames(transaction).group}</p>
                        <p className="mt-1 break-words text-xs text-[#94A0AF]">{getCategoryNames(transaction).subcategory}</p>
                      </div>
                      <p className={`col-start-3 row-start-1 whitespace-nowrap text-right text-sm font-semibold md:col-start-4 ${transaction.type === "income" ? "text-emerald-700" : transaction.type === "expense" ? "text-[#B65D58]" : "text-[#526B8B]"}`}>
                        {transaction.type === "income" ? "+" : transaction.type === "expense" ? "−" : ""}{money(transaction.amountCents)}
                      </p>
                      <button type="button" onClick={() => deleteTransaction(transaction.id)} className="col-start-3 text-right text-xs text-[#A0AABA] hover:text-rose-600 md:col-start-5 md:row-start-1" title="Excluir lançamento">Excluir</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            </>}

            <p className="text-xs leading-5 text-[#94A0AF]">
              Os lançamentos são mantidos temporariamente em memória nesta versão.
              Eles serão persistidos no banco de dados em uma etapa posterior.
            </p>
          </div>
        )}

        {/* ================================== */}
        {/* CONTAS */}
        {/* ================================== */}

        {active === "Contas" && selectedAccount && (
          <div className="space-y-6">
            <button
              onClick={() => setSelectedAccountId(null)}
              className="flex items-center gap-2 rounded-xl border border-white/90 bg-white/60 px-4 py-2.5 text-sm font-medium text-[#526B8B] shadow-sm backdrop-blur-xl hover:bg-white"
            >
              ← Voltar para minhas contas
            </button>

            <div className="relative isolate overflow-hidden rounded-3xl border border-white/90 bg-white/65 p-7 shadow-[0_8px_32px_rgba(80,110,150,0.10)] backdrop-blur-2xl md:p-9">
              <div className="pointer-events-none absolute -right-12 -top-20 -z-10 h-64 w-64 rounded-full bg-sky-200/70 blur-[75px]" />
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <AccountLogo name={selectedAccount.name} />
                  <div>
                    <p className="font-semibold text-[#354B68]">{selectedAccount.name}</p>
                    <p className="text-xs text-[#94A0AF]">{selectedAccount.type}</p>
                  </div>
                </div>
                <button
                  onClick={() => editAccount(selectedAccount)}
                  className="rounded-xl border border-white bg-white/70 px-4 py-2 text-xs font-medium text-[#526B8B] shadow-sm hover:bg-white"
                >
                  Editar conta
                </button>
              </div>

              <p className="mt-8 text-xs font-medium uppercase tracking-wider text-[#8494A8]">Saldo atual</p>
              <h3 className={`mt-2 text-4xl font-semibold tracking-tight ${calculateAccountBalance(selectedAccount, transactions) !== null && calculateAccountBalance(selectedAccount, transactions)! < 0 ? "text-rose-700" : "text-[#233C5B]"}`}>
                {money(calculateAccountBalance(selectedAccount, transactions))}
              </h3>
              {calculateAccountBalance(selectedAccount, transactions) !== null && calculateAccountBalance(selectedAccount, transactions)! < 0 && (
                <p className="mt-2 text-xs font-medium text-rose-700">⚠ Saldo negativo</p>
              )}
              <p className="mt-3 text-xs text-[#8B9AAD]">
                {selectedAccount.source === "manual"
                  ? "Saldo calculado a partir do saldo inicial"
                  : selectedAccount.source === "statement"
                  ? "Saldo calculado por extrato"
                  : "Aguardando informação de saldo"}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-white/90 bg-white/65 p-5 shadow-sm backdrop-blur-2xl">
                <p className="text-sm text-[#8491A3]">Total de entradas</p>
                <h3 className="mt-4 text-2xl font-semibold text-[#247D5A]">
                  {money(accountTotals.incomeCents)}
                </h3>
              </div>
              <div className="rounded-3xl border border-white/90 bg-white/65 p-5 shadow-sm backdrop-blur-2xl">
                <p className="text-sm text-[#8491A3]">Total de saídas</p>
                <h3 className="mt-4 text-2xl font-semibold text-[#B65D58]">
                  {money(accountTotals.expenseCents)}
                </h3>
              </div>
            </div>

            <div className="rounded-3xl border border-white/90 bg-white/65 p-5 shadow-sm backdrop-blur-2xl md:p-6">
              <h3 className="font-semibold text-[#26364D]">Histórico de movimentações</h3>
              <p className="mt-1 text-xs text-[#94A0AF]">Entradas, saídas e transferências desta conta</p>

              {accountTransactions.length === 0 ? (
                <p className="py-10 text-center text-sm text-[#94A0AF]">
                  Nenhuma movimentação registrada nesta conta.
                </p>
              ) : (
                <div className="mt-4 space-y-1">
                  {accountTransactions.map((transaction) => (
                    <div key={transaction.id} className="flex flex-wrap justify-between gap-3 border-b border-[#EDF0F4] py-4 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-[#35445A]">{transaction.description}</p>
                        <p className="mt-1 text-xs text-[#94A0AF]">
                          {getCategoryNames(transaction).group} · {displayDate(transaction.date)}
                        </p>
                      </div>
                      <p className={`text-sm font-semibold ${
                        transaction.type === "income" ? "text-emerald-700" :
                        transaction.type === "expense" ? "text-[#B65D58]" : "text-[#526B8B]"
                      }`}>
                        {transaction.type === "income" ? "+" : transaction.type === "expense" ? "−" : ""}
                        {money(transaction.amountCents)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {active === "Contas" && !selectedAccount && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="relative isolate overflow-hidden rounded-3xl border border-white/90 bg-white/65 p-5 shadow-[0_8px_32px_rgba(80,110,150,0.10)] backdrop-blur-2xl">
                <div className="pointer-events-none absolute -right-10 -top-16 -z-10 h-36 w-36 rounded-full bg-sky-200/70 blur-[60px]" />
                <p className="text-sm text-[#77879B]">Saldo consolidado</p>
                <h3 className="mt-3 text-2xl font-semibold text-[#233C5B]">{money(totalBalanceCents)}</h3>
                <p className="mt-2 text-xs text-[#8B9AAD]">Saldos iniciais e movimentações</p>
              </div>
              <div className="rounded-3xl border border-white/90 bg-white/65 p-5 shadow-sm backdrop-blur-2xl">
                <p className="text-sm text-[#77879B]">Contas cadastradas</p>
                <h3 className="mt-3 text-2xl font-semibold text-[#233C5B]">{accounts.length}</h3>
                <p className="mt-2 text-xs text-[#8B9AAD]">Instituições financeiras</p>
              </div>
              <div className="rounded-3xl border border-white/90 bg-white/65 p-5 shadow-sm backdrop-blur-2xl">
                <p className="text-sm text-[#77879B]">Saldos informados</p>
                <h3 className="mt-3 text-2xl font-semibold text-[#233C5B]">{accountsWithBalance} de {accounts.length}</h3>
                <p className="mt-2 text-xs text-[#8B9AAD]">Contas com saldo cadastrado</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-[#26364D]">Minhas contas</h3>
                <p className="mt-1 text-sm text-[#94A0AF]">Clique em uma conta para consultar os detalhes.</p>
              </div>
              <button
                onClick={() => {
                  setShowAccountForm(true);
                  setAccountError("");
                }}
                className="rounded-xl bg-[#34383F] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-blue-900/10 hover:bg-[#25282D]"
              >
                + Adicionar conta
              </button>
            </div>

            {showAccountForm && (
              <div className="rounded-3xl border border-white/90 bg-white/75 p-6 shadow-sm backdrop-blur-2xl">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-[#26364D]">
                      {editingId !== null ? "Editar conta" : "Nova conta"}
                    </h3>
                    <p className="mt-1 text-xs text-[#94A0AF]">Informe os dados da sua conta bancária.</p>
                  </div>
                  <button onClick={closeAccountForm} className="text-xl text-[#8A96A7]">×</button>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-xs font-medium text-[#64748B]">Instituição financeira</span>
                    <input
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      placeholder="Ex.: Nubank, Inter, Caixa..."
                      className="w-full rounded-xl border border-[#E2E8F0] bg-white/80 px-4 py-3 text-sm outline-none focus:border-[#A7A9AF]"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-medium text-[#64748B]">Tipo de conta</span>
                    <select
                      value={accountType}
                      onChange={(e) => setAccountType(e.target.value)}
                      className="w-full rounded-xl border border-[#E2E8F0] bg-white/80 px-4 py-3 text-sm outline-none"
                    >
                      <option>Conta corrente</option>
                      <option>Conta poupança</option>
                      <option>Conta de pagamento</option>
                      <option>Conta salário</option>
                      <option>Outra</option>
                    </select>
                  </label>
                </div>

                <div className="mt-6">
                  <p className="mb-3 text-xs font-medium text-[#64748B]">Como deseja informar o saldo inicial?</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setBalanceMethod("manual")}
                      className={`rounded-2xl border p-4 text-left transition ${
                        balanceMethod === "manual" ? "border-[#A7A9AF] bg-white/70" : "border-[#E2E8F0] bg-white/60"
                      }`}
                    >
                      <span className="text-lg">✎</span>
                      <p className="mt-2 text-sm font-semibold text-[#354B68]">Informar manualmente</p>
                      <p className="mt-1 text-xs text-[#8998AA]">Digitar o saldo atual da conta.</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBalanceMethod("statement")}
                      className={`rounded-2xl border p-4 text-left transition ${
                        balanceMethod === "statement" ? "border-[#A7A9AF] bg-white/70" : "border-[#E2E8F0] bg-white/60"
                      }`}
                    >
                      <span className="text-lg">⇧</span>
                      <p className="mt-2 text-sm font-semibold text-[#354B68]">Pelo primeiro extrato</p>
                      <p className="mt-1 text-xs text-[#8998AA]">Calcular o saldo a partir do arquivo importado.</p>
                    </button>
                  </div>
                </div>

                {balanceMethod === "manual" && (
                  <label className="mt-5 block space-y-2">
                    <span className="text-xs font-medium text-[#64748B]">Saldo inicial (R$)</span>
                    <input
                      value={initialBalance}
                      onChange={(e) => {
                        setInitialBalance(e.target.value);
                        setAccountError("");
                      }}
                      placeholder="Ex.: 1.500,00"
                      inputMode="decimal"
                      className="w-full rounded-xl border border-[#E2E8F0] bg-white/80 px-4 py-3 text-sm outline-none focus:border-[#A7A9AF] md:max-w-sm"
                    />
                  </label>
                )}

                {balanceMethod === "manual" && (
                  <label className="mt-5 block space-y-2">
                    <span className="text-xs font-medium text-[#64748B]">Data do saldo inicial</span>
                    <input
                      type="date"
                      value={openingBalanceDate}
                      onChange={(e) => { setOpeningBalanceDate(e.target.value); setAccountError(""); }}
                      className="w-full rounded-xl border border-[#E2E8F0] bg-white/80 px-4 py-3 text-sm outline-none focus:border-[#A7A9AF] md:max-w-sm"
                    />
                  </label>
                )}

                {balanceMethod === "statement" && (
                  <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                    <p className="text-sm font-medium text-[#456486]">Importação de extrato</p>
                    <p className="mt-1 text-xs leading-5 text-[#7189A4]">
                      A conta será cadastrada sem saldo inicial. A importação CSV e OFX será implementada em uma próxima etapa.
                    </p>
                  </div>
                )}

                {accountError && (
                  <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {accountError}
                  </div>
                )}

                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <button onClick={closeAccountForm} className="rounded-xl border border-[#E2E8F0] bg-white/70 px-5 py-3 text-sm text-[#64748B]">
                    Cancelar
                  </button>
                  <button onClick={saveAccount} className="rounded-xl bg-[#34383F] px-6 py-3 text-sm font-medium text-white hover:bg-[#25282D]">
                    Salvar conta
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {accounts.map((account) => (
                <div key={account.id} className="group relative overflow-hidden rounded-3xl border border-white/90 bg-white/65 p-5 shadow-[0_8px_32px_rgba(80,110,150,0.07)] backdrop-blur-2xl transition hover:shadow-[0_12px_38px_rgba(80,110,150,0.13)]">
                  <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-sky-100/70 blur-[60px]" />
                  <div className="relative flex items-start justify-between gap-3">
                    <button onClick={() => setSelectedAccountId(account.id)} className="flex items-center gap-3 text-left">
                      <AccountLogo name={account.name} />
                      <div>
                        <h4 className="font-semibold text-[#2D405A]">{account.name}</h4>
                        <p className="mt-1 text-xs text-[#94A0AF]">{account.type}</p>
                      </div>
                    </button>
                    <button onClick={() => editAccount(account)} className="rounded-lg px-3 py-2 text-xs text-[#71839A] hover:bg-white/80">
                      Editar
                    </button>
                  </div>
                  <div className="relative mt-7 border-t border-[#E9EEF4] pt-5">
                    <p className="text-xs text-[#8A98AA]">Saldo da conta</p>
                    <p className={`mt-2 text-2xl font-semibold tracking-tight ${calculateAccountBalance(account, transactions) !== null && calculateAccountBalance(account, transactions)! < 0 ? "text-rose-700" : "text-[#263D59]"}`}>
                      {money(calculateAccountBalance(account, transactions))}
                    </p>
                    {calculateAccountBalance(account, transactions) !== null && calculateAccountBalance(account, transactions)! < 0 && (
                      <p className="mt-2 text-xs font-medium text-rose-700">⚠ Saldo negativo</p>
                    )}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-full border border-blue-100 bg-blue-50/70 px-3 py-1.5 text-[10px] font-medium text-blue-700">
                        {account.source === "manual" ? "Saldo calculado a partir do saldo inicial" : account.source === "statement" ? "Saldo calculado por extrato" : "Saldo ainda não informado"}
                      </span>
                      <button onClick={() => removeAccount(account.id)} className="text-xs text-[#A0AABA] hover:text-rose-600">
                        Excluir conta
                      </button>
                    </div>
                    <button onClick={() => setSelectedAccountId(account.id)} className="mt-5 w-full rounded-xl border border-[#DCE5EF] bg-white/60 px-4 py-3 text-xs font-semibold text-[#526B8B] transition hover:bg-white">
                      Ver detalhes da conta →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================================== */}
        {/* OUTROS MÓDULOS */}
        {/* ================================== */}

        {active === "Investimentos" && <InvestmentsManager accounts={accounts.map(({ id, name }) => ({ id, name }))} />}

        {active === "Cartões" && (
          <CardsManager entries={cardEntries} onChange={setCardEntries} categories={categories} />
        )}

        {active === "Categorias" && (
          <CategoriesManager
            categories={categories}
            onChange={setCategories}
            usedCategoryIds={transactions.map((transaction) => transaction.categoryId).filter((id): id is string => Boolean(id))}
            usedSubcategoryIds={transactions.map((transaction) => transaction.subcategoryId).filter((id): id is string => Boolean(id))}
          />
        )}

        {active === "Configurações" && <ExcelReclassification transactions={transactions} categories={categories} onApply={(items, cats) => { setCategories(cats); setTransactions(items); }} />}
        {active === "Configurações" && <ClassificationPreview transactions={transactions} categories={categories} onApply={(ids, categoryId, subcategoryId) => setTransactions(current => current.map(t => ids.includes(t.id) && t.type !== "transfer" && !t.internalTransferPairId && !t.categoryId && !t.subcategoryId ? { ...t, categoryId, subcategoryId, group: categories.find(c => c.id === categoryId)?.name ?? t.group, subcategory: categories.find(c => c.id === categoryId)?.subcategories.find(sub => sub.id === subcategoryId)?.name ?? t.subcategory } : t))} />}
        {active === "Configurações" && (
          <div className="rounded-3xl border border-white/90 bg-white/65 p-6 shadow-sm backdrop-blur-2xl">
            <h2 className="text-xl font-semibold text-[#26364D]">Backup e restauração</h2>
            <p className="mt-2 text-sm text-[#707780]">Exporte seus dados para levar o MONEO entre navegadores e dispositivos. O arquivo contém informações financeiras pessoais: guarde-o em local seguro.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" disabled={!storageLoaded} onClick={exportBackup}
                className="rounded-xl bg-[#34383F] px-5 py-3 text-sm font-medium text-white disabled:opacity-50">
                Baixar backup (.json)
              </button>
              <label className="cursor-pointer rounded-xl border border-[#DCE5EF] bg-white/80 px-5 py-3 text-sm font-medium text-[#34383F]">
                Restaurar backup
                <input type="file" accept=".json,application/json" className="sr-only"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    void importBackup(file);
                  }} />
              </label>
            </div>
            <p className="mt-4 text-xs text-[#8A98AA]">A restauração substitui os dados atuais deste navegador. Não há sincronização automática com o GitHub ou StackBlitz.</p>
            {backupMessage && <p role="status" className="mt-4 text-sm text-emerald-700">{backupMessage}</p>}
            {backupError && <p role="alert" className="mt-4 text-sm text-rose-600">{backupError}</p>}
          </div>
        )}

        {active === "Configurações" && <DriveSettings transactions={transactions} accounts={accounts} categories={categories} onImport={(items) => setTransactions((current) => [...current, ...items.map(item => classifyExcelTransaction(item, categories))])} onPending={(items) => setPendingTransactions((current) => { const known = new Set(current.map((t) => t.importHash)); return [...current, ...items.filter((item) => !known.has(item.importHash))]; })} />}

        {!["Visão geral", "Contas", "Lançamentos", "Categorias", "Configurações"].includes(active) && (
          <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-white/90 bg-white/55 p-8 text-center shadow-sm backdrop-blur-2xl">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E7EEF7] text-3xl text-[#526F96]">✧</div>
            <h3 className="mt-5 text-xl font-semibold text-[#263D59]">{active}</h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-[#8A98AA]">
              Este módulo está no nosso planejamento e será desenvolvido nas próximas etapas do MONEO.
            </p>
            <button onClick={() => goToPage("Visão geral")} className="mt-6 rounded-xl bg-[#34383F] px-5 py-3 text-sm font-medium text-white hover:bg-[#25282D]">
              Voltar à visão geral
            </button>
          </div>
        )}

        <footer className="mt-8 pb-5 text-center text-[11px] text-[#A2ACB9]">
          MONEO FINANCE · Seu dinheiro, sob seu controle.
        </footer>
      </section>
    </main>
  );
}
