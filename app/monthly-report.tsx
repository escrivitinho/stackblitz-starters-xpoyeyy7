"use client";
import { useMemo, useState } from "react";
import type { Transaction } from "./transactions";
import { formatCents } from "./lib/money";

const monthNames=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const money=(n:number)=>formatCents(n);
export default function MonthlyReport({transactions}:{transactions:Transaction[]}){
 const years=useMemo(()=>Array.from(new Set(transactions.filter(t=>/^\d{4}-\d{2}-\d{2}$/.test(t.date)).map(t=>Number(t.date.slice(0,4))))).sort((a,b)=>b-a),[transactions]);
 const [selectedYear,setSelectedYear]=useState<number|null>(null);
 const [reportTab,setReportTab]=useState<"charts"|"analytic">("charts");
 const year=selectedYear!==null&&years.includes(selectedYear)?selectedYear:(years[0]??new Date().getFullYear());
 const monthly=useMemo(()=>Array.from({length:12},(_,index)=>{
  const prefix=year+"-"+String(index+1).padStart(2,"0");
  const items=transactions.filter(t=>t.date.startsWith(prefix)&&!t.internalTransferPairId&&t.type!=="transfer");
  const income=items.filter(t=>t.type==="income").reduce((sum,t)=>sum+t.amountCents,0);
  const expense=items.filter(t=>t.type==="expense").reduce((sum,t)=>sum+t.amountCents,0);
  return {month:monthNames[index],income,expense,balance:income-expense,count:items.length};
 }),[transactions,year]);
 const categoryRows=useMemo(()=>{
  const data=transactions.filter(t=>t.date.startsWith(String(year)+"-")&&!t.internalTransferPairId&&t.type!=="transfer");
  return (["income","expense"] as const).map(type=>{
   const rows=new Map<string,{name:string;months:number[];subs:Map<string,number[]>}>();
   for(const t of data.filter(x=>x.type===type)){
    const month=Number(t.date.slice(5,7))-1;
    if(month<0||month>11)continue;
    const category=(t.group||"Sem categoria").trim()||"Sem categoria";
    const sub=(t.subcategory||"Sem subcategoria").trim()||"Sem subcategoria";
    if(!rows.has(category))rows.set(category,{name:category,months:Array(12).fill(0),subs:new Map()});
    const row=rows.get(category)!;
    row.months[month]+=t.amountCents;
    if(!row.subs.has(sub))row.subs.set(sub,Array(12).fill(0));
    row.subs.get(sub)![month]+=t.amountCents;
   }
   return {type,rows:Array.from(rows.values()).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"))};
  });
 },[transactions,year]);
 const [collapsedCategories,setCollapsedCategories]=useState<string[]>([]);
 const allCategoryKeys=categoryRows.flatMap(section=>section.rows.map(row=>section.type+"-"+row.name));
 const allCollapsed=allCategoryKeys.length>0&&allCategoryKeys.every(key=>collapsedCategories.includes(key));
 const totalFor=(values:number[])=>values.reduce((a,b)=>a+b,0);
 const monthsWithEntries=monthly.filter(m=>m.count>0).length||1;
 const totalIncome=monthly.reduce((n,m)=>n+m.income,0),totalExpense=monthly.reduce((n,m)=>n+m.expense,0);
 const max=Math.max(1,...monthly.flatMap(m=>[m.income,m.expense]));
 return <div className="space-y-6">
  <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-2xl font-semibold text-[#26364D]">Receitas e despesas mês a mês</h2><p className="mt-1 text-sm text-[#718096]">Evolução financeira baseada nos lançamentos cadastrados. Transferências entre contas próprias não entram nos totais.</p></div><label className="flex items-center gap-2 text-sm text-[#526B8B]">Ano <select value={year} onChange={e=>setSelectedYear(Number(e.target.value))} className="rounded-xl border border-[#DCE5EF] bg-white px-4 py-2">{(years.length?years:[year]).map(y=><option key={y} value={y}>{y}</option>)}</select></label></div>
  <div className="flex w-fit gap-1 rounded-2xl border border-white/80 bg-white/45 p-1.5 shadow-[0_8px_24px_rgba(57,75,99,0.07)] backdrop-blur-2xl" role="tablist" aria-label="Visualização do relatório">{([{id:"charts",name:"Gráficos"},{id:"analytic",name:"Analítico"}] as const).map(tab=><button key={tab.id} type="button" role="tab" aria-selected={reportTab===tab.id} onClick={()=>setReportTab(tab.id)} className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${reportTab===tab.id?"bg-white/85 text-[#26364D] shadow-[0_4px_16px_rgba(46,68,91,0.13)] ring-1 ring-white":"text-[#718096] hover:bg-white/45"}`}>{tab.name}</button>)}</div>
  {reportTab==="charts"&&<>
  <div className="grid gap-4 sm:grid-cols-3">{[{name:"Receitas no ano",value:totalIncome,color:"text-emerald-700"},{name:"Despesas no ano",value:totalExpense,color:"text-rose-700"},{name:"Resultado no ano",value:totalIncome-totalExpense,color:totalIncome>=totalExpense?"text-emerald-700":"text-rose-700"}].map(item=><div key={item.name} className="rounded-2xl border border-white bg-white/70 p-5 shadow-sm"><p className="text-sm text-[#718096]">{item.name}</p><p className={`mt-2 text-xl font-semibold ${item.color}`}>{money(item.value)}</p></div>)}</div>
  <section className="rounded-3xl border border-white bg-white/70 p-5 shadow-sm"><h3 className="font-semibold text-[#26364D]">Comparativo mensal</h3><div className="mt-2 flex gap-5 text-xs text-[#64748B]"><span>🟢 Receitas</span><span>🔴 Despesas</span></div><div className="mt-6 grid grid-cols-12 gap-1.5 sm:gap-3">{monthly.map(m=><div key={m.month} className="min-w-0 text-center" title={`${m.month}: receitas ${money(m.income)}; despesas ${money(m.expense)}`}><div className="flex h-40 items-end justify-center gap-0.5 sm:gap-1"><div className="w-2.5 rounded-t bg-emerald-500 sm:w-4" style={{height:`${m.income/max*100}%`}}/><div className="w-2.5 rounded-t bg-rose-400 sm:w-4" style={{height:`${m.expense/max*100}%`}}/></div><p className="mt-2 text-[10px] text-[#64748B] sm:text-xs">{m.month}</p></div>)}</div></section>
</>
  {reportTab==="analytic"&&<>
  <section className="overflow-x-auto rounded-3xl border border-white bg-white/70 p-5 shadow-sm"><h3 className="mb-4 font-semibold text-[#26364D]">Detalhamento por mês</h3><table className="w-full min-w-[550px] text-sm"><thead><tr className="border-b border-[#E2E8F0] text-left text-xs text-[#718096]"><th className="py-3">Mês</th><th className="py-3 text-right">Receitas</th><th className="py-3 text-right">Despesas</th><th className="py-3 text-right">Resultado</th></tr></thead><tbody>{monthly.map(m=><tr key={m.month} className="border-b border-[#EDF0F4] last:border-0"><td className="py-3 font-medium text-[#35445A]">{m.month}</td><td className="py-3 text-right text-emerald-700">{money(m.income)}</td><td className="py-3 text-right text-rose-700">{money(m.expense)}</td><td className={`py-3 text-right font-semibold ${m.balance>=0?"text-emerald-700":"text-rose-700"}`}>{money(m.balance)}</td></tr>)}</tbody><tfoot><tr className="border-t-2 border-[#DCE5EF] font-semibold"><td className="pt-4">Total</td><td className="pt-4 text-right">{money(totalIncome)}</td><td className="pt-4 text-right">{money(totalExpense)}</td><td className="pt-4 text-right">{money(totalIncome-totalExpense)}</td></tr></tfoot></table></section>
</>
  {reportTab==="analytic"&&<section className="overflow-x-auto rounded-3xl border border-white/80 bg-white/55 p-5 shadow-[0_12px_36px_rgba(52,72,99,0.08)] backdrop-blur-2xl">
   <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-[#26364D]">Receitas e despesas por categoria e subcategoria</h3><button type="button" onClick={()=>setCollapsedCategories(allCollapsed?[]:allCategoryKeys)} className="rounded-xl border border-white/90 bg-white/75 px-4 py-2 text-xs font-semibold text-[#455A64] shadow-sm transition hover:bg-white">{allCollapsed?"Expandir todas as subcategorias":"Recolher todas as subcategorias"}</button></div>
   <p className="mb-4 mt-1 text-xs text-[#718096]">Todas as subcategorias aparecem inicialmente. Clique em uma categoria para recolher ou expandir. A média considera os meses com movimentações.</p>
   <table className="w-full min-w-[1250px] border-collapse text-xs">
    <thead><tr className="border-b border-[#DCE5EF] text-[#526B8B]"><th className="sticky left-0 z-10 min-w-[210px] bg-white py-3 pr-4 text-left">Categoria / Subcategoria</th>{monthNames.map(m=><th key={m} className="px-2 py-3 text-right">{m}</th>)}<th className="px-2 py-3 text-right">Total anual</th><th className="px-2 py-3 text-right">Média mensal</th></tr></thead>
    <tbody>{categoryRows.map(section=><>
     <tr key={section.type+"-heading"} className={section.type==="income"?"bg-[#E5F3E6]/80 font-bold text-[#1B5E20]":"bg-[#FCE8E8]/80 font-bold text-[#B71C1C]"}><td colSpan={15} className="px-3 py-3">{section.type==="income"?"RECEITAS":"DESPESAS"}</td></tr>
     {section.rows.map(row=>{
      const key=section.type+"-"+row.name;const expanded=!collapsedCategories.includes(key);
      return <><tr key={key} className={`border-b border-white/80 font-semibold ${section.type==="income"?"bg-[#F1F8E9]/65 text-[#1B5E20]":"bg-[#FFEBEE]/65 text-[#B71C1C]"}`}>
       <td className={`sticky left-0 py-2 pr-4 backdrop-blur-xl ${section.type==="income"?"bg-[#F1F8E9]/90":"bg-[#FFEBEE]/90"}`}><button type="button" className="text-left hover:text-blue-700" onClick={()=>setCollapsedCategories(current=>expanded?[...current,key]:current.filter(k=>k!==key))}>{expanded?"▾":"▸"} {row.name}</button></td>
       {row.months.map((v,i)=><td key={i} className="px-2 py-2 text-right">{v?money(v):"—"}</td>)}<td className="px-2 py-2 text-right">{money(totalFor(row.months))}</td><td className="px-2 py-2 text-right">{money(Math.round(totalFor(row.months)/monthsWithEntries))}</td>
      </tr>
      {expanded&&Array.from(row.subs.entries()).sort((a,b)=>a[0].localeCompare(b[0],"pt-BR")).map(([name,values])=><tr key={key+"-"+name} className={`border-b border-white/70 ${section.type==="income"?"text-[#2E7D32]":"text-[#C62828]"}`}><td className={`sticky left-0 py-2 pl-5 pr-4 backdrop-blur-xl ${section.type==="income"?"bg-[#F6FBF4]/90":"bg-[#FFF8F8]/90"}`}>{name}</td>{values.map((v,i)=><td key={i} className="px-2 py-2 text-right">{v?money(v):"—"}</td>)}<td className="px-2 py-2 text-right">{money(totalFor(values))}</td><td className="px-2 py-2 text-right">{money(Math.round(totalFor(values)/monthsWithEntries))}</td></tr>)}</>;
     })}
     <tr key={section.type+"-total"} className={`border-t-2 border-white/80 font-bold ${section.type==="income"?"bg-[#C8E6C9]/65 text-[#1B5E20]":"bg-[#FFCDD2]/65 text-[#B71C1C]"}`}><td className={`sticky left-0 py-3 backdrop-blur-xl ${section.type==="income"?"bg-[#C8E6C9]/90":"bg-[#FFCDD2]/90"}`}>{section.type==="income"?"TOTAL RECEITAS":"TOTAL DESPESAS"}</td>{monthly.map((m,i)=><td key={i} className="px-2 py-3 text-right">{money(section.type==="income"?m.income:m.expense)}</td>)}<td className="px-2 py-3 text-right">{money(section.type==="income"?totalIncome:totalExpense)}</td><td className="px-2 py-3 text-right">{money(Math.round((section.type==="income"?totalIncome:totalExpense)/monthsWithEntries))}</td></tr>
    </>)}</tbody>
   </table>
  </section>}
 </div>;
}
