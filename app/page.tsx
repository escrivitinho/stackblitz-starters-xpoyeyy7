
"use client";

import { useState } from "react";
import CategoriesManager, { type Category } from "./categories-manager";
import { formatCents, parseMoneyToCents } from "./lib/money";
import {
  calculateTransactionTotals,
  type Transaction,
  type TransactionType,
} from "./transactions";

type Account = {
  id: number;
  name: string;
  type: string;
  balanceCents: number | null;
  source: "manual" | "statement" | "pending";
};

const initialAccounts: Account[] = [
  {
    id: 1,
    name: "Nubank",
    type: "Conta corrente",
    balanceCents: 123456,
    source: "manual",
  },
  {
    id: 2,
    name: "Inter",
    type: "Conta corrente",
    balanceCents: null,
    source: "pending",
  },
  {
    id: 3,
    name: "Caixa",
    type: "Conta corrente",
    balanceCents: null,
    source: "pending",
  },
];

const initialTransactions: Transaction[] = [];

const navigation = [
  { name: "Visão geral", icon: "▦" },
  { name: "Lançamentos", icon: "⇄" },
  { name: "Categorias", icon: "⌁" },
  { name: "Contas", icon: "▤" },
  { name: "Cartões", icon: "▣" },
  { name: "Orçamento", icon: "◷" },
  { name: "Relatórios", icon: "▥" },
];

const initialCategories: Category[] = [
  { id: "expense-housing", name: "Moradia", type: "expense", subcategories: ["Aluguel", "Condomínio", "Energia", "Água", "Internet"] },
  { id: "expense-food", name: "Alimentação", type: "expense", subcategories: ["Supermercado", "Restaurante", "Delivery"] },
  { id: "expense-transport", name: "Transporte", type: "expense", subcategories: ["Combustível", "Aplicativos", "Transporte público"] },
  { id: "expense-health", name: "Saúde", type: "expense", subcategories: ["Farmácia", "Consultas", "Exames"] },
  { id: "expense-leisure", name: "Lazer", type: "expense", subcategories: ["Viagens", "Entretenimento", "Assinaturas"] },
  { id: "expense-other", name: "Outros", type: "expense", subcategories: ["Compras diversas", "Presentes", "Outros"] },
  { id: "income-salary", name: "Salário", type: "income", subcategories: ["Salário CLT", "Royalties", "Adiantamento"] },
  { id: "income-investments", name: "Investimentos", type: "income", subcategories: ["Rendimentos", "Dividendos", "Juros"] },
  { id: "income-other", name: "Outros", type: "income", subcategories: ["Reembolso", "Venda", "Outras receitas"] },
  { id: "transfer-general", name: "Transferência", type: "transfer", subcategories: ["Entre contas"] },
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
  const [categories, setCategories] = useState<Category[]>(initialCategories);

  const [selectedAccount, setSelectedAccount] =
    useState<Account | null>(null);

  // Formulário de contas
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState("Conta corrente");
  const [balanceMethod, setBalanceMethod] = useState("manual");
  const [initialBalance, setInitialBalance] = useState("");
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

  const totalBalanceCents = accounts.reduce(
    (total, account) => total + (account.balanceCents ?? 0),
    0
  );

  const accountsWithBalance = accounts.filter(
    (account) => account.balanceCents !== null
  ).length;

  const totals = calculateTransactionTotals(transactions);

  const availableGroups = categories
    .filter((category) => category.type === transactionType)
    .reduce<Record<string, string[]>>((groups, category) => {
      groups[category.name] = category.subcategories;
      return groups;
    }, {});

  const availableSubcategories = availableGroups[transactionGroup] || [];

  function goToPage(page: string) {
    setActive(page);
    setSelectedAccount(null);
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
    setAccountError("");
    setEditingId(null);
  }

  function saveAccount() {
    setAccountError("");

    if (!accountName.trim()) {
      setAccountError("Informe o nome da instituição financeira.");
      return;
    }

    let balanceCents: number | null = null;

    if (balanceMethod === "manual") {
      if (!initialBalance.trim()) {
        setAccountError("Informe o saldo inicial da conta.");
        return;
      }

      const parsed = parseMoneyToCents(initialBalance);

      if (parsed === null) {
        setAccountError(
          "Valor inválido. Use formatos como 1500,00 ou 1.500,00."
        );
        return;
      }

      balanceCents = parsed;
    }

    const existingAccount = accounts.find(
      (account) => account.id === editingId
    );

    const newAccount: Account = {
      id: editingId ?? Date.now(),
      name: accountName.trim(),
      type: accountType,
      balanceCents,
      source:
        balanceMethod === "manual" ? "manual" : "pending",
    };

    if (editingId !== null) {
      setAccounts((current) =>
        current.map((account) =>
          account.id === editingId ? newAccount : account
        )
      );

      if (selectedAccount?.id === editingId) {
        setSelectedAccount(newAccount);
      }
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
      account.balanceCents === null
        ? ""
        : (account.balanceCents / 100).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
    );

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
        setSelectedAccount(null);
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
    setTransactionSubcategory(firstExpense?.subcategories[0] || "");
    setPaidFor("");
    setTransactionError("");
  }

  function changeTransactionType(type: TransactionType) {
    setTransactionType(type);
    setTransactionError("");

    const firstCategory = categories.find((category) => category.type === type);
    setTransactionGroup(firstCategory?.name || "");
    setTransactionSubcategory(firstCategory?.subcategories[0] || "");
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

    const amountCents = parseMoneyToCents(transactionAmount);

    if (amountCents === null || amountCents <= 0) {
      setTransactionError(
        "Informe um valor válido e maior que zero. Ex.: 150,00."
      );
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
    <main className="min-h-screen bg-[#F1F4F8] text-[#202B3C] md:flex">

      {/* MENU LATERAL */}
      <aside className="flex w-full flex-col bg-[#14243D] px-5 py-6 text-white md:fixed md:inset-y-0 md:w-[250px]">
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
                  ? "bg-[#294263] font-medium text-white"
                  : "text-slate-400 hover:bg-[#203652] hover:text-white"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.name}
            </button>
          ))}
        </nav>

        <div className="mt-8 hidden rounded-2xl border border-[#344761] bg-[#1B304C] p-4 md:block">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[#314B6B] text-lg">
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

        <div className="mt-auto hidden border-t border-[#344761] pt-5 md:block">
          <button
            onClick={() => goToPage("Configurações")}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400 hover:bg-[#203652]"
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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="group relative isolate overflow-hidden rounded-3xl border border-white/90 bg-white/65 p-6 shadow-[0_8px_32px_rgba(80,110,150,0.10)] backdrop-blur-2xl">
                <div className="pointer-events-none absolute -right-10 -top-16 -z-10 h-48 w-48 rounded-full bg-sky-200/70 blur-[65px]" />
                <p className="text-sm font-medium text-[#63758D]">Dinheiro disponível</p>
                <h3 className="mt-7 text-3xl font-semibold text-[#233C5B]">
                  {money(totalBalanceCents)}
                </h3>
                <p className="mt-2 text-xs text-[#7D8FA5]">Soma dos saldos informados nas contas</p>
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

            <div className="rounded-2xl border border-white/90 bg-white/65 p-6 shadow-sm backdrop-blur-2xl">
              <h3 className="font-semibold text-[#26364D]">Últimos lançamentos</h3>
              <p className="mt-1 text-xs text-[#94A0AF]">
                Movimentações cadastradas manualmente
              </p>

              {transactions.length === 0 ? (
                <p className="mt-5 text-sm text-[#94A0AF]">
                  Nenhum lançamento cadastrado ainda.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {transactions.slice(0, 5).map((transaction) => (
                    <div key={transaction.id} className="flex justify-between gap-3 border-b border-[#EDF0F4] py-3 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-[#35445A]">{transaction.description}</p>
                        <p className="text-xs text-[#94A0AF]">{displayDate(transaction.date)} · {transaction.group}</p>
                      </div>
                      <span className={`text-sm font-semibold ${transaction.type === "income" ? "text-emerald-700" : "text-[#526176]"}`}>
                        {transaction.type === "income" ? "+" : transaction.type === "expense" ? "−" : ""}
                        {money(transaction.amountCents)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => goToPage("Lançamentos")} className="mt-4 text-xs font-medium text-[#334B75]">
                Ver lançamentos →
              </button>
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
                className="rounded-xl bg-[#294263] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-blue-900/10 transition hover:bg-[#203653]"
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
                          ? "border-[#7898BF] bg-[#EDF4FC] text-[#294263]"
                          : "border-[#E2E8F0] bg-white/60 text-[#8290A2] hover:bg-white"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">

                  <label className="space-y-2">
                    <span className="text-xs font-medium text-[#64748B]">Descrição</span>
                    <input
                      value={transactionDescription}
                      onChange={(e) => setTransactionDescription(e.target.value)}
                      placeholder="Ex.: Supermercado"
                      className="w-full rounded-xl border border-[#E2E8F0] bg-white/80 px-4 py-3 text-sm outline-none focus:border-[#7898BF]"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs font-medium text-[#64748B]">Valor (R$)</span>
                    <input
                      value={transactionAmount}
                      onChange={(e) => setTransactionAmount(e.target.value)}
                      placeholder="Ex.: 150,00"
                      inputMode="decimal"
                      className="w-full rounded-xl border border-[#E2E8F0] bg-white/80 px-4 py-3 text-sm outline-none focus:border-[#7898BF]"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs font-medium text-[#64748B]">Data</span>
                    <input
                      type="date"
                      value={transactionDate}
                      onChange={(e) => setTransactionDate(e.target.value)}
                      className="w-full rounded-xl border border-[#E2E8F0] bg-white/80 px-4 py-3 text-sm outline-none focus:border-[#7898BF]"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs font-medium text-[#64748B]">
                      {transactionType === "transfer" ? "Conta de origem" : "Conta"}
                    </span>
                    <select
                      value={transactionAccount}
                      onChange={(e) => setTransactionAccount(e.target.value)}
                      className="w-full rounded-xl border border-[#E2E8F0] bg-white/80 px-4 py-3 text-sm outline-none"
                    >
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>

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
                          className="w-full rounded-xl border border-[#E2E8F0] bg-white/80 px-4 py-3 text-sm outline-none focus:border-[#7898BF]"
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
                    className="rounded-xl bg-[#294263] px-6 py-3 text-sm font-medium text-white hover:bg-[#203653]"
                  >
                    Salvar lançamento
                  </button>
                </div>
              </div>
            )}

            {/* LISTA */}
            <div className="rounded-3xl border border-white/90 bg-white/65 p-5 shadow-[0_8px_32px_rgba(80,110,150,0.07)] backdrop-blur-2xl md:p-6">
              <div className="mb-5">
                <h3 className="font-semibold text-[#26364D]">Todos os lançamentos</h3>
                <p className="mt-1 text-xs text-[#94A0AF]">
                  {transactions.length} movimentação(ões) registrada(s) nesta sessão
                </p>
              </div>

              {transactions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#D5DFEA] bg-white/40 px-5 py-12 text-center">
                  <div className="text-3xl text-[#91A9C8]">⇄</div>
                  <h4 className="mt-3 font-medium text-[#43536A]">
                    Nenhum lançamento por enquanto
                  </h4>
                  <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-[#94A0AF]">
                    Cadastre sua primeira receita, despesa ou transferência.
                  </p>
                  <button
                    onClick={() => setShowTransactionForm(true)}
                    className="mt-5 rounded-xl bg-[#294263] px-5 py-3 text-sm font-medium text-white"
                  >
                    + Novo lançamento
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  {transactions.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EDF0F4] py-4 last:border-0"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          transaction.type === "income"
                            ? "bg-emerald-50 text-emerald-700"
                            : transaction.type === "transfer"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-rose-50 text-rose-600"
                        }`}>
                          {transaction.type === "income" ? "↗" : transaction.type === "transfer" ? "⇄" : "↘"}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[#35445A]">
                            {transaction.description}
                          </p>
                          <p className="mt-1 text-xs text-[#94A0AF]">
                            {transaction.group} · {transaction.subcategory}
                          </p>
                          <p className="mt-1 text-[11px] text-[#A0AABA]">
                            {displayDate(transaction.date)} · {getTransactionAccountName(transaction)}
                            {transaction.paidFor ? ` · Por conta de ${transaction.paidFor}` : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <p className={`whitespace-nowrap text-sm font-semibold ${
                          transaction.type === "income"
                            ? "text-emerald-700"
                            : transaction.type === "expense"
                            ? "text-[#B65D58]"
                            : "text-[#526B8B]"
                        }`}>
                          {transaction.type === "income" ? "+" : transaction.type === "expense" ? "−" : ""}
                          {money(transaction.amountCents)}
                        </p>
                        <button
                          onClick={() => deleteTransaction(transaction.id)}
                          className="rounded-lg px-2 py-2 text-xs text-[#A0AABA] hover:bg-rose-50 hover:text-rose-600"
                          title="Excluir lançamento"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

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
              onClick={() => setSelectedAccount(null)}
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
              <h3 className="mt-2 text-4xl font-semibold tracking-tight text-[#233C5B]">
                {money(selectedAccount.balanceCents)}
              </h3>
              <p className="mt-3 text-xs text-[#8B9AAD]">
                {selectedAccount.source === "manual"
                  ? "Saldo cadastrado manualmente"
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
                          {transaction.group} · {displayDate(transaction.date)}
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
                <p className="mt-2 text-xs text-[#8B9AAD]">Soma dos saldos informados</p>
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
                className="rounded-xl bg-[#294263] px-5 py-3 text-sm font-medium text-white shadow-lg shadow-blue-900/10 hover:bg-[#203653]"
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
                      className="w-full rounded-xl border border-[#E2E8F0] bg-white/80 px-4 py-3 text-sm outline-none focus:border-[#7898BF]"
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
                        balanceMethod === "manual" ? "border-[#7898BF] bg-[#EDF4FC]" : "border-[#E2E8F0] bg-white/60"
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
                        balanceMethod === "statement" ? "border-[#7898BF] bg-[#EDF4FC]" : "border-[#E2E8F0] bg-white/60"
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
                      className="w-full rounded-xl border border-[#E2E8F0] bg-white/80 px-4 py-3 text-sm outline-none focus:border-[#7898BF] md:max-w-sm"
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
                  <button onClick={saveAccount} className="rounded-xl bg-[#294263] px-6 py-3 text-sm font-medium text-white hover:bg-[#203653]">
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
                    <button onClick={() => setSelectedAccount(account)} className="flex items-center gap-3 text-left">
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
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-[#263D59]">
                      {money(account.balanceCents)}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-full border border-blue-100 bg-blue-50/70 px-3 py-1.5 text-[10px] font-medium text-blue-700">
                        {account.source === "manual" ? "Saldo informado manualmente" : account.source === "statement" ? "Saldo calculado por extrato" : "Saldo ainda não informado"}
                      </span>
                      <button onClick={() => removeAccount(account.id)} className="text-xs text-[#A0AABA] hover:text-rose-600">
                        Excluir conta
                      </button>
                    </div>
                    <button onClick={() => setSelectedAccount(account)} className="mt-5 w-full rounded-xl border border-[#DCE5EF] bg-white/60 px-4 py-3 text-xs font-semibold text-[#526B8B] transition hover:bg-white">
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

        {active === "Categorias" && (
          <CategoriesManager categories={categories} onChange={setCategories} />
        )}

        {!["Visão geral", "Contas", "Lançamentos", "Categorias"].includes(active) && (
          <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-white/90 bg-white/55 p-8 text-center shadow-sm backdrop-blur-2xl">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E7EEF7] text-3xl text-[#526F96]">✧</div>
            <h3 className="mt-5 text-xl font-semibold text-[#263D59]">{active}</h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-[#8A98AA]">
              Este módulo está no nosso planejamento e será desenvolvido nas próximas etapas do MONEO.
            </p>
            <button onClick={() => goToPage("Visão geral")} className="mt-6 rounded-xl bg-[#294263] px-5 py-3 text-sm font-medium text-white hover:bg-[#203653]">
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
