
export type TransactionType = "income" | "expense" | "transfer";

export type TransactionSource = "manual" | "ofx" | "csv";

type TransactionBase = {
  id: number;
  date: string; // AAAA-MM-DD
  amountCents: number; // Sempre positivo
  description: string;
  group: string;
  subcategory: string;
  paidFor?: string;
  source: TransactionSource;
  externalId?: string;
  importHash?: string;
};

export type IncomeTransaction = TransactionBase & {
  type: "income";
  accountId: number;
};

export type ExpenseTransaction = TransactionBase & {
  type: "expense";
  accountId: number;
};

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
  balanceCents: number;
};

/**
 * Calcula receitas, despesas e resultado financeiro.
 *
 * Transferências são ignoradas nos totais de receitas e despesas.
 * amountCents é sempre positivo; o tipo determina o sentido.
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
    {
      incomeCents: 0,
      expenseCents: 0,
      balanceCents: 0,
    }
  );
}
