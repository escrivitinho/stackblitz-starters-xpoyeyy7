"use client";

import type { CardEntry } from "./cards-manager";
import { formatCents } from "./lib/money";

const cards: CardEntry["card"][] = ["Nubank Crédito", "Inter Crédito"];

function invoiceTotal(entries: CardEntry[]): number {
  return entries.reduce((total, entry) => {
    const kind = entry.kind ?? (entry.amountCents < 0 ? "credit" : "purchase");
    if (kind === "payment") return total;
    return total + (kind === "credit" ? -Math.abs(entry.amountCents) : Math.abs(entry.amountCents));
  }, 0);
}

function monthLabel(month: string): string {
  return new Date(month + "-01T12:00:00Z").toLocaleDateString("pt-BR", {
    month: "long", year: "numeric", timeZone: "UTC",
  });
}

export default function CardInvoiceHistory({ entries }: { entries: CardEntry[] }) {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/90 bg-white/65 p-6 shadow-sm backdrop-blur-2xl">
        <h3 className="text-xl font-semibold text-[#263D59]">Histórico de faturas</h3>
        <p className="mt-2 text-sm text-[#77879B]">Acompanhe os valores mensais de cada cartão. Para visualizar e classificar compras, acesse Lançamentos → Cartões.</p>
      </div>
      {cards.map((card) => {
        const cardEntries = entries.filter((entry) => entry.card === card && /^\d{4}-\d{2}/.test(entry.date));
        const months = Array.from(new Set(cardEntries.map((entry) => entry.date.slice(0, 7)))).sort().reverse();
        return (
          <section key={card} className="rounded-3xl border border-white/90 bg-white/55 p-5 shadow-sm backdrop-blur-2xl sm:p-6">
            <h3 className="mb-4 text-lg font-semibold text-[#263D59]">{card}</h3>
            {months.length ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {months.map((month) => {
                  const total = invoiceTotal(cardEntries.filter((entry) => entry.date.startsWith(month)));
                  return (
                    <div key={month} className="rounded-2xl border border-white/90 bg-white/75 p-5 shadow-sm backdrop-blur-xl">
                      <p className="text-sm capitalize text-[#77879B]">{monthLabel(month)}</p>
                      <p className="mt-3 text-2xl font-semibold text-[#263D59]">{formatCents(total)}</p>
                      <p className="mt-2 text-xs text-[#94A0AF]">Total da fatura</p>
                    </div>
                  );
                })}
              </div>
            ) : <p className="rounded-2xl bg-white/65 p-5 text-sm text-[#77879B]">Nenhuma fatura cadastrada para este cartão.</p>}
          </section>
        );
      })}
    </div>
  );
}
