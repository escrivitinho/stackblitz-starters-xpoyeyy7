
import type { Transaction } from "./transactions";

export type AccountBalance = {
  id: number;
  openingBalanceCents: number | null;
  openingBalanceDate: string | null;
};

export function calculateAccountBalance(
  account: AccountBalance,
  transactions: Transaction[]
): number | null {
  if (
    account.openingBalanceCents === null ||
    account.openingBalanceDate === null
  ) {
    return null;
  }

  let balance = account.openingBalanceCents;

  for (const transaction of transactions) {
    // Ignora movimentações anteriores ao saldo inicial.
    if (transaction.date < account.openingBalanceDate) {
      continue;
    }

    if (transaction.type === "income") {
      if (transaction.accountId === account.id) {
        balance += transaction.amountCents;
      }
    } else if (transaction.type === "expense") {
      if (transaction.accountId === account.id) {
        balance -= transaction.amountCents;
      }
    } else if (transaction.type === "transfer") {
      if (transaction.fromAccountId === account.id) {
        balance -= transaction.amountCents;
      }

      if (transaction.toAccountId === account.id) {
        balance += transaction.amountCents;
      }
    }
  }

  return balance;
}

export function calculateTotalBalance(
  accounts: AccountBalance[],
  transactions: Transaction[]
): number {
  return accounts.reduce((total, account) => {
    const balance = calculateAccountBalance(account, transactions);
    return total + (balance ?? 0);
  }, 0);
}
