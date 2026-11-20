"use client";
import { useMemo, useState } from "react";
import type { Transaction } from "./transactions";
import type { Category } from "./categories-manager";

// Primeira etapa: regras verificadas na aba De_Para_Categorias.
// Transferências e conflitos não são reclassificados automaticamente.
const source = [
["99 Ride","Transporte","Aplicativo de Corrida","expense"],
["99app","Transporte","Aplicativo de Corrida","expense"],
["99food","Alimentação","Delivery","expense"],
["Amazonprimebr","Assinaturas","Streaming","expense"],
["Apple.Com/Bill","Assinaturas","Serviços Digitais","expense"],
["Applecombill","Assinaturas","Serviços Digitais","expense"],
["Blocksrvt.Com","Despesas com Arquitetura","Software & Serviços","expense"],
["Burger King","Alimentação","Fast Food","expense"],
["Burguer King","Alimentação","Fast Food","expense"],
["Ccr Metro Bahia","Transporte","Transporte Público","expense"],
["Claro Flex","Contas","Telefonia","expense"],
["Clickbus","Transporte","Passagem de Ônibus","expense"],
["Cobasi","Pets","Pet Shop","expense"],
["Ebn*Spotify","Assinaturas","Streaming","expense"],
["EBW*Spotify","Assinaturas","Streaming","expense"],
["iFood","Alimentação","Delivery","expense"],
["Netflix","Assinaturas","Streaming","expense"],
["OI FIBRA","Contas","Internet","expense"],
["Openai","Assinaturas","Inteligência Artificial","expense"],
["Spotify","Assinaturas","Streaming","expense"],
["Uber Uber *Trip Help.U","Transporte","Aplicativo de Corrida","expense"],
["Uber","Transporte","Aplicativo de Corrida","expense"],
["Pagto Salario","Renda","Salário","income"],
["CREDITO JUROS","Renda","Rendimento","income"],
["CORRECAO MONETARIA","Renda","Rendimento","income"],
] as const;
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
type Proposal = { transaction: Transaction; category: Category; subcategory: Category["subcategories"][number]; keyword: string };
export default function ClassificationPreview({ transactions, categories, onApply }: { transactions: Transaction[]; categories: Category[]; onApply: (ids: number[], categoryId: string, subcategoryId: string) => void }) {
 const [show, setShow] = useState(false);
 const [confirmed, setConfirmed] = useState(false);
 const { proposals, skipped } = useMemo(() => {
  const proposals: Proposal[] = []; let skipped = 0;
  for (const transaction of transactions) {
   if (transaction.source === "manual" || transaction.type === "transfer" || transaction.internalTransferPairId || transaction.categoryId || transaction.subcategoryId) continue;
   const matches = source.filter(([word, , , type]) => type === transaction.type && normalize(transaction.description).includes(normalize(word)));
   if (!matches.length) continue;
   const destinations = new Set(matches.map(([,cat,sub]) => normalize(cat)+"|"+normalize(sub)));
   if (destinations.size !== 1) { skipped++; continue; }
   const [word, cat, sub] = [...matches].sort((a,b)=>b[0].length-a[0].length)[0];
   const category = categories.find(c => c.type === transaction.type && normalize(c.name) === normalize(cat));
   const subcategory = category?.subcategories.find(s => normalize(s.name) === normalize(sub));
   if (!category || !subcategory) { skipped++; continue; }
   proposals.push({ transaction, category, subcategory, keyword: word });
  }
  return { proposals, skipped };
 }, [transactions, categories]);
 return <div className="rounded-3xl border border-white/90 bg-white/60 p-5 shadow-sm backdrop-blur-2xl">
  <h3 className="text-sm font-semibold text-[#26364D]">De-para · prévia de classificação</h3>
  <p className="mt-2 text-xs leading-5 text-[#64748B]">Etapa piloto com 25 regras do Excel. Apenas receitas e despesas ainda sem IDs de classificação; transferências, regras conflitantes e categorias inexistentes são preservadas para revisão.</p>
  <button type="button" onClick={()=>{setShow(v=>!v);setConfirmed(false)}} className="mt-3 rounded-xl border border-blue-300 bg-blue-200/50 px-4 py-2 text-xs font-semibold text-blue-900 backdrop-blur-xl">{show ? "Ocultar prévia" : "Analisar lançamentos"}</button>
  {show && <div className="mt-4 space-y-3">
   <p className="text-sm text-[#26364D]"><strong>{proposals.length}</strong> lançamento(s) elegíveis · {skipped} correspondência(s) exigem revisão</p>
   <div className="max-h-64 space-y-2 overflow-auto">{proposals.slice(0,100).map(p=><div key={p.transaction.id} className="rounded-xl border border-white bg-white/70 p-3 text-xs"><strong>{p.transaction.description}</strong><p className="mt-1 text-[#64748B]">{p.category.name} → {p.subcategory.name} · regra: {p.keyword}</p></div>)}</div>
   {proposals.length > 100 && <p className="text-xs text-[#64748B]">Exibindo os primeiros 100 resultados; a confirmação contempla todos os elegíveis.</p>}
   {proposals.length > 0 && <><label className="flex items-center gap-2 text-xs text-[#526B8B]"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> Conferi a prévia e autorizo classificar os lançamentos elegíveis</label><button type="button" disabled={!confirmed} onClick={()=>{for(const p of proposals) onApply([p.transaction.id],p.category.id,p.subcategory.id);setConfirmed(false);setShow(false)}} className="rounded-xl border border-blue-300 bg-blue-300/55 px-4 py-2 text-xs font-semibold text-blue-900 disabled:opacity-40">Aplicar classificações</button></>}
  </div>}
 </div>;
}
