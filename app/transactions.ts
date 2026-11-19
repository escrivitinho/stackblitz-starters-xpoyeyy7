export type TransactionType = "income" | "expense" | "transfer";

export type TransactionSource = "manual" | "ofx" | "csv";

type TransactionBase = {
  id: number;
  date: string; // AAAA-MM-DD
  amountCents: number; // Sempre positivo; o tipo define o sentido
  description: string;
  paidFor?: string;
  source: TransactionSource;
  externalId?: string;
  importHash?: string;
};

export type IncomeTransaction = TransactionBase & {
  type: "income";
  accountId: number;
  categoryId: string;
  subcategoryId?: string; // opcional: uma categoria pode não ter subcategorias
};

export type ExpenseTransaction = TransactionBase & {
  type: "expense";
  accountId: number;
  categoryId: string;
  subcategoryId?: string;
};

// Transferências não têm categoria: não entram em receitas nem despesas.
export type TransferTransaction = TransactionBase & {
  type: "transfer";
  fromAccountId: number;
  toAccountId: number;
};

export type Transaction =
  | IncomeTransaction
  | ExpenseTransaction
  | TransferTransaction;

export type TransactionTotals = {
  incomeCents: number;
  expenseCents: number;
};

/**
 * Calcula receitas e despesas.
 *
 * Transferências são ignoradas: mover dinheiro entre contas não é receita
 * nem despesa. amountCents é sempre positivo; o tipo determina o sentido.
 */
export function calculateTransactionTotals(
  transactions: Transaction[]
): TransactionTotals {
  return transactions.reduce(
    (totals, transaction) => {
      if (transaction.type === "income") {
        totals.incomeCents += transaction.amountCents;
      }

      if (transaction.type === "expense") {
        totals.expenseCents += transaction.amountCents;
      }

      return totals;
    },
    { incomeCents: 0, expenseCents: 0 }
  );
}

export type AccountOpeningBalance = {
  id: number;
  openingBalanceCents: number | null;
  openingBalanceDate: string | null; // AAAA-MM-DD
};

/**
 * Saldo atual de uma conta:
 * saldo inicial + receitas - despesas + transferências recebidas
 * - transferências enviadas.
 *
 * Só contam lançamentos com data igual ou posterior à data do saldo inicial
 * (o saldo inicial vale para o começo desse dia).
 *
 * Retorna null enquanto a conta não tem saldo inicial informado.
 */
export function calculateAccountBalance(
  account: AccountOpeningBalance,
  transactions: Transaction[]
): number | null {
  if (account.openingBalanceCents === null) return null;

  const since = account.openingBalanceDate;

  return transactions.reduce((balance, transaction) => {
    if (since && transaction.date < since) return balance;

    if (transaction.type === "income" && transaction.accountId === account.id) {
      return balance + transaction.amountCents;
    }

    if (transaction.type === "expense" && transaction.accountId === account.id) {
      return balance - transaction.amountCents;
    }

    if (transaction.type === "transfer") {
      if (transaction.toAccountId === account.id) {
        balance += transaction.amountCents;
      }

      if (transaction.fromAccountId === account.id) {
        balance -= transaction.amountCents;
      }
    }

    return balance;
  }, account.openingBalanceCents);
}
