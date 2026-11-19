import type { Transaction } from "./transactions";

export type CategoryType = "income" | "expense" | "transfer";

export type Subcategory = {
  id: string;
  name: string;
};

export type Category = {
  id: string;
  name: string;
  type: CategoryType;
  subcategories: Subcategory[];
};

/**
 * Gera um identificador único para novas categorias e subcategorias.
 * O id nunca muda, mesmo que o nome seja editado.
 */
export function newId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return `${prefix}-${random}`;
}

function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function category(
  id: string,
  name: string,
  type: CategoryType,
  subcategoryNames: string[]
): Category {
  return {
    id,
    name,
    type,
    subcategories: subcategoryNames.map((subName) => ({
      id: `${id}-${slug(subName)}`,
      name: subName,
    })),
  };
}

export const initialCategories: Category[] = [
  category("expense-housing", "Moradia", "expense", ["Aluguel", "Condomínio", "Energia", "Água", "Internet"]),
  category("expense-food", "Alimentação", "expense", ["Supermercado", "Restaurante", "Delivery"]),
  category("expense-transport", "Transporte", "expense", ["Combustível", "Aplicativos", "Transporte público"]),
  category("expense-health", "Saúde", "expense", ["Farmácia", "Consultas", "Exames"]),
  category("expense-leisure", "Lazer", "expense", ["Viagens", "Entretenimento", "Assinaturas"]),
  category("expense-other", "Outros", "expense", ["Compras diversas", "Presentes", "Outros"]),
  category("income-salary", "Salário", "income", ["Salário CLT", "Royalties", "Adiantamento"]),
  category("income-investments", "Investimentos", "income", ["Rendimentos", "Dividendos", "Juros"]),
  category("income-other", "Outros", "income", ["Reembolso", "Venda", "Outras receitas"]),
  category("transfer-general", "Transferência", "transfer", ["Entre contas"]),
];

export function getCategoryName(
  categories: Category[],
  categoryId: string
): string {
  return (
    categories.find((item) => item.id === categoryId)?.name ??
    "Categoria removida"
  );
}

export function getSubcategoryName(
  categories: Category[],
  categoryId: string,
  subcategoryId?: string
): string {
  if (!subcategoryId) return "";

  return (
    categories
      .find((item) => item.id === categoryId)
      ?.subcategories.find((sub) => sub.id === subcategoryId)?.name ??
    "Subcategoria removida"
  );
}

/** Texto "Categoria · Subcategoria" resolvido pelos ids atuais. */
export function getTransactionCategoryLabel(
  categories: Category[],
  transaction: Transaction
): string {
  if (transaction.type === "transfer") {
    return "Transferência · Entre contas";
  }

  const category = getCategoryName(categories, transaction.categoryId);
  const subcategory = getSubcategoryName(
    categories,
    transaction.categoryId,
    transaction.subcategoryId
  );

  return subcategory ? `${category} · ${subcategory}` : category;
}

/** Só o nome da categoria (sem subcategoria), resolvido pelo id atual. */
export function getTransactionCategoryName(
  categories: Category[],
  transaction: Transaction
): string {
  return transaction.type === "transfer"
    ? "Transferência"
    : getCategoryName(categories, transaction.categoryId);
}

export function isCategoryInUse(
  transactions: Transaction[],
  categoryId: string
): boolean {
  return transactions.some(
    (transaction) =>
      transaction.type !== "transfer" && transaction.categoryId === categoryId
  );
}

export function isSubcategoryInUse(
  transactions: Transaction[],
  subcategoryId: string
): boolean {
  return transactions.some(
    (transaction) =>
      transaction.type !== "transfer" &&
      transaction.subcategoryId === subcategoryId
  );
}
