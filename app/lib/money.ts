
export function parseMoneyToCents(value: string): number {
  const cleaned = value
    .trim()
    .replace(/^R\$\s*/, "")
    .replace(/\s/g, "");

  // Aceita: 1500 | 1500,00 | 1.500,00 | -200,50
  const validFormat = /^-?\d+(?:,\d{1,2})?$|^-?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/;

  if (!cleaned || !validFormat.test(cleaned)) {
    throw new Error("Digite um valor válido. Exemplo: 1.500,00");
  }

  const normalized = cleaned
    .replace(/\./g, "")
    .replace(",", ".");

  const valueInCents = Math.round(Number(normalized) * 100);

  if (!Number.isSafeInteger(valueInCents)) {
    throw new Error("O valor informado é muito alto.");
  }

  return valueInCents;
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}
