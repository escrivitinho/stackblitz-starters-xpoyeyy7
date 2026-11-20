"use client";

import { useEffect, useState } from "react";
import { formatCents, parseMoneyToCents } from "./lib/money";

type Valuation = { id: string; date: string; valueCents: number };
type Investment = { awaitingMovements?: boolean; valuations?: Valuation[]; id: string; name: string; category: string; institution: string; investedCents: number; currentCents: number; date: string };
const KEY = "moneo-investments-v1";
const types = ["Caixinha Nubank", "CDB", "Tesouro Direto", "LCI / LCA", "Ações", "FIIs", "ETF", "Fundos", "Criptomoedas", "Outros"];

export default function InvestmentsManager({ accounts }: { accounts: { id: number; name: string }[] }) {
  const [items, setItems] = useState<Investment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("CDB");
  const [institution, setInstitution] = useState("");
  const availableBanks = accounts.filter((account) => account.name.trim());
  const selectedBank = category === "Caixinha Nubank" ? availableBanks.find((account) => account.name.trim().toLowerCase() === "nubank")?.name ?? "" : institution;
  const [invested, setInvested] = useState("");
  const [current, setCurrent] = useState("");
  const [date, setDate] = useState(() => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); });
  const [error, setError] = useState("");
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [attemptedUpdate, setAttemptedUpdate] = useState(false);
  const invalidStyle = " !border-rose-400 !bg-rose-50/75 ring-2 ring-rose-300/40";
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updatedValue, setUpdatedValue] = useState("");
  const [updatedDate, setUpdatedDate] = useState("");
  const [updateError, setUpdateError] = useState("");
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY);
      if (stored) { const data: unknown = JSON.parse(stored); if (Array.isArray(data)) setItems(data as Investment[]); }
    } catch (e) { console.error("Não foi possível carregar os investimentos.", e); }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) { try { window.localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { console.error("Não foi possível salvar os investimentos.", e); } } }, [items, loaded]);
  const totalInvested = items.reduce((sum, item) => sum + (item.awaitingMovements ? 0 : item.investedCents), 0);
  const totalCurrent = items.reduce((sum, item) => sum + (item.awaitingMovements ? 0 : item.currentCents), 0);
  const performance = totalCurrent - totalInvested;
  function save() {
    setAttemptedSave(true);
    const isCaixinha = category === "Caixinha Nubank";
    const investedCents = isCaixinha ? 0 : parseMoneyToCents(invested);
    const currentCents = isCaixinha ? 0 : parseMoneyToCents(current);
    if (!name.trim() || investedCents === null || currentCents === null || investedCents < 0 || currentCents < 0 || (!isCaixinha && !date) || !selectedBank) {
      setError("Confira o nome, o banco cadastrado e os campos obrigatórios do investimento."); return;
    }
    setItems((previous) => [{ id: crypto.randomUUID(), name: name.trim(), category, institution: selectedBank, investedCents, currentCents, date, awaitingMovements: isCaixinha, valuations: isCaixinha ? [] : [{ id: crypto.randomUUID(), date, valueCents: currentCents }] }, ...previous]);
    setName(""); setInstitution(""); setInvested(""); setCurrent(""); setError(""); setAttemptedSave(false); setFormOpen(false);
  }
  function updateValue(item: Investment) {
    setAttemptedUpdate(true);
    const valueCents = parseMoneyToCents(updatedValue);
    if (valueCents === null || valueCents < 0 || !updatedDate || !/^\d{4}-\d{2}-\d{2}$/.test(updatedDate)) {
      setUpdateError("Informe uma data e um valor atual válidos."); return;
    }
    const history = item.valuations ?? [{ id: item.id + "-initial", date: item.date, valueCents: item.currentCents }];
    const lastDate = history.reduce((latest, point) => point.date > latest ? point.date : latest, "");
    if (updatedDate < lastDate) { setUpdateError("A data não pode ser anterior à última atualização registrada."); return; }
    setItems((previous) => previous.map((entry) => entry.id === item.id
      ? { ...entry, currentCents: valueCents, valuations: [...history, { id: crypto.randomUUID(), date: updatedDate, valueCents }] }
      : entry));
    setUpdatingId(null); setUpdatedValue(""); setUpdateError(""); setAttemptedUpdate(false);
  }
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-semibold text-[#26364D]">Investimentos</h2><p className="mt-1 text-xs text-[#8A9AAF]">Acompanhe sua carteira e a evolução do patrimônio investido.</p></div>
      <button type="button" onClick={() => setFormOpen((value) => !value)} className="rounded-xl border border-blue-300/80 bg-blue-300/35 px-5 py-3 text-sm font-semibold text-blue-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_6px_20px_rgba(59,130,246,0.12)] backdrop-blur-xl hover:bg-blue-300/55">+ Novo investimento</button>
    </div>
    <div className="grid gap-3 md:grid-cols-3">
      {([{ label: "Total aplicado", value: totalInvested, color: "text-[#26364D]" }, { label: "Valor atual", value: totalCurrent, color: "text-blue-700" }, { label: "Rentabilidade acumulada", value: performance, color: performance >= 0 ? "text-emerald-700" : "text-rose-700" }]).map((stat) =>
        <div key={stat.label} className="rounded-3xl border border-white/90 bg-white/55 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_24px_rgba(80,110,150,0.07)] backdrop-blur-2xl">
          <p className="text-xs text-[#64748B]">{stat.label}</p><p className={`mt-3 text-2xl font-semibold ${stat.color}`}>{formatCents(stat.value)}</p>
        </div>)}
    </div>
    {formOpen && <div className="rounded-3xl border border-white/90 bg-white/65 p-5 shadow-sm backdrop-blur-2xl md:p-6">
      <h3 className="mb-4 font-semibold text-[#26364D]">Cadastrar investimento ou Caixinha</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-[#64748B]">Nome do ativo<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: CDB liquidez diária" className={`block w-full rounded-xl border border-white bg-white/75 p-3 text-sm text-[#26364D] outline-none focus:border-blue-300 ${attemptedSave && (!name.trim()) ? invalidStyle : ""}`} /></label>
        <label className="space-y-1 text-xs text-[#64748B]">Tipo<select value={category} onChange={(e) => { setCategory(e.target.value); if (e.target.value === "Caixinha Nubank") setInstitution(""); }} className="block w-full rounded-xl border border-white bg-white/75 p-3 text-sm text-[#26364D]">{types.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label className="space-y-1 text-xs text-[#64748B]">Banco<select value={selectedBank} disabled={category === "Caixinha Nubank"} onChange={(e) => setInstitution(e.target.value)} className={`block w-full rounded-xl border border-white bg-white/75 p-3 text-sm text-[#26364D] disabled:opacity-70 ${attemptedSave && !selectedBank ? invalidStyle : ""}`}><option value="">Selecione um banco cadastrado</option>{availableBanks.map((account) => <option key={account.id} value={account.name}>{account.name}</option>)}</select>{category === "Caixinha Nubank" && !selectedBank && <span className="block text-xs text-rose-700">Cadastre uma conta Nubank em Contas para criar esta Caixinha.</span>}</label>
        {category !== "Caixinha Nubank" && <label className="space-y-1 text-xs text-[#64748B]">Data da aplicação<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`block w-full rounded-xl border border-white bg-white/75 p-3 text-sm text-[#26364D] ${attemptedSave && (category !== "Caixinha Nubank" && !date) ? invalidStyle : ""}`} /></label>}
        {category !== "Caixinha Nubank" && <label className="space-y-1 text-xs text-[#64748B]">Valor aplicado (R$)<input value={invested} onChange={(e) => setInvested(e.target.value)} placeholder="0,00" inputMode="decimal" className={`block w-full rounded-xl border border-white bg-white/75 p-3 text-sm text-[#26364D] ${attemptedSave && (parseMoneyToCents(invested) === null || parseMoneyToCents(invested)! < 0) ? invalidStyle : ""}`} /></label>}
        {category !== "Caixinha Nubank" && <label className="space-y-1 text-xs text-[#64748B]">Valor atual (R$)<input value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="0,00" inputMode="decimal" className={`block w-full rounded-xl border border-white bg-white/75 p-3 text-sm text-[#26364D] ${attemptedSave && (parseMoneyToCents(current) === null || parseMoneyToCents(current)! < 0) ? invalidStyle : ""}`} /></label>}
      </div>
      {category === "Caixinha Nubank" && <p className="mt-3 text-xs text-blue-800">Cadastre apenas o nome. Os valores ficam pendentes até a vinculação das movimentações OFX; nenhum saldo ou rendimento será presumido.</p>}
      {error && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-xs font-medium text-rose-700">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => { setFormOpen(false); setError(""); }} className="rounded-xl border border-white bg-white/65 px-4 py-2 text-sm">Cancelar</button><button type="button" onClick={save} className="rounded-xl border border-blue-300 bg-blue-300/50 px-5 py-2 text-sm font-semibold text-blue-900 backdrop-blur-xl">Salvar investimento</button></div>
    </div>}
    <div className="rounded-3xl border border-white/90 bg-white/60 p-5 shadow-sm backdrop-blur-2xl md:p-6">
      <h3 className="font-semibold text-[#26364D]">Minha carteira e Caixinhas ({items.length})</h3>
      {items.length === 0 ? <p className="mt-5 text-sm text-[#64748B]">Nenhum investimento cadastrado. Adicione seu primeiro ativo para começar.</p> :
        <div className="mt-4 space-y-2">{items.map((item) => <div key={item.id} className="rounded-2xl border border-white/90 bg-white/55 p-4 backdrop-blur-xl"><div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm font-semibold text-[#26364D]">{item.name}</p><p className="mt-1 text-xs text-[#64748B]">{item.category} · {item.institution || "Sem instituição"} · {item.date.split("-").reverse().join("/")}</p></div>
          <div className="flex items-center gap-4"><div className="text-right"><p className="text-sm font-semibold text-blue-700">{item.awaitingMovements ? "Movimentações pendentes" : formatCents(item.currentCents)}</p><p className="text-xs text-[#64748B]">{item.awaitingMovements ? "Sem saldo apurado" : `Aplicado: ${formatCents(item.investedCents)}`}</p></div>{!item.awaitingMovements && <button type="button" onClick={() => { setUpdatingId(item.id); setUpdatedValue((item.currentCents / 100).toFixed(2).replace(".", ",")); setUpdatedDate(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)); setUpdateError(""); setAttemptedUpdate(false); }} className="rounded-xl border border-blue-300/80 bg-blue-300/35 px-3 py-2 text-xs font-semibold text-blue-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-xl hover:bg-blue-300/55">Atualizar valor</button>}<button type="button" onClick={() => { if (window.confirm("Excluir este investimento da carteira?")) setItems((previous) => previous.filter((entry) => entry.id !== item.id)); }} className="rounded-xl border border-rose-200 bg-rose-100/40 px-3 py-2 text-xs text-rose-700 backdrop-blur-xl">Excluir</button></div>
        </div>
        {updatingId === item.id && <div className="mt-4 rounded-2xl border border-blue-200/70 bg-blue-50/50 p-4 backdrop-blur-xl">
          <p className="mb-3 text-sm font-semibold text-blue-900">Atualizar valor de {item.name}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-[#64748B]">Data da consulta<input type="date" value={updatedDate} onChange={(e) => setUpdatedDate(e.target.value)} className={`block w-full rounded-xl border border-white bg-white/75 p-3 text-sm text-[#26364D] ${attemptedUpdate && (!updatedDate) ? invalidStyle : ""}`} /></label>
            <label className="space-y-1 text-xs text-[#64748B]">Saldo atual informado pelo banco (R$)<input inputMode="decimal" value={updatedValue} onChange={(e) => setUpdatedValue(e.target.value)} className={`block w-full rounded-xl border border-white bg-white/75 p-3 text-sm text-[#26364D] ${attemptedUpdate && (parseMoneyToCents(updatedValue) === null || parseMoneyToCents(updatedValue)! < 0) ? invalidStyle : ""}`} /></label>
          </div>
          {updateError && <p role="alert" className="mt-2 rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-xs font-medium text-rose-700">{updateError}</p>}
          <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setUpdatingId(null)} className="rounded-xl border border-white bg-white/70 px-4 py-2 text-xs">Cancelar</button><button type="button" onClick={() => updateValue(item)} className="rounded-xl border border-blue-300 bg-blue-300/45 px-4 py-2 text-xs font-semibold text-blue-900 backdrop-blur-xl">Salvar atualização</button></div>
        </div>}
        {(item.valuations?.length ?? 0) > 1 && <div className="mt-3 border-t border-white/80 pt-3">
          <p className="mb-2 text-xs font-semibold text-[#64748B]">Histórico de atualizações</p>
          <div className="space-y-1">{(item.valuations ?? []).slice(1).reverse().map((point, index) => {
            const chronological = item.valuations ?? [];
            const position = chronological.length - 1 - index;
            const previous = chronological[position - 1];
            const change = point.valueCents - (previous?.valueCents ?? point.valueCents);
            return <div key={point.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B]"><span>{point.date.split("-").reverse().join("/")}</span><span>{formatCents(point.valueCents)} <span className={change >= 0 ? "text-emerald-700" : "text-rose-700"}>({change >= 0 ? "+" : ""}{formatCents(change)})</span></span></div>;
          })}</div>
          <p className="mt-2 text-[11px] text-[#94A0AF]">Variação entre consultas, não rendimento mensal. Aportes e resgates ainda precisam ser registrados separadamente.</p>
        </div>}
        </div>)}</div>}
    </div>
    <p className="text-xs text-[#94A0AF]">Caixinhas novas ficam sem saldo apurado até a integração. A vinculação dos aportes e resgates aos lançamentos OFX ainda não está ativa. Não registre aportes ou resgates como rendimento. Carteira manual: os valores atuais são informados por você. Nesta primeira versão, os investimentos não movimentam automaticamente o saldo bancário nem os totais de receitas e despesas.</p>
  </section>;
}
