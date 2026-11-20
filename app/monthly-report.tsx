"use client";
import { useMemo, useState } from "react";
import type { Transaction } from "./transactions";
import type { Category } from "./categories-manager";
import { excelRules } from "./classification-preview";
import { formatCents } from "./lib/money";

const monthNames=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const money=(n:number)=>formatCents(n);
export default function MonthlyReport({transactions,categories}:{transactions:Transaction[];categories:Category[]}){
 const years=useMemo(()=>Array.from(new Set(transactions.filter(t=>/^\d{4}-\d{2}-\d{2}$/.test(t.date)).map(t=>Number(t.date.slice(0,4))))).sort((a,b)=>b-a),[transactions]);
 const [selectedYear,setSelectedYear]=useState<number|null>(null);
 const [reportTab,setReportTab]=useState<"charts"|"analytic"|"monthly">("charts");
 const year=selectedYear!==null&&years.includes(selectedYear)?selectedYear:(years[0]??new Date().getFullYear());
 const classified=useMemo(()=>{
  const normalize=(value:string)=>value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR");
  // A planilha é a fonte da natureza das categorias: algumas entradas OFX
  // foram importadas como "income" apesar de serem estornos de despesas.
  const expenseNames=new Set(excelRules.filter(rule=>rule[3]==="expense").map(rule=>normalize(rule[1])));
  return transactions.map(t=>{
   const byId=categories.find(c=>c.id===t.categoryId);
   const groupName=normalize(t.group||"");
   const sameName=categories.filter(c=>normalize(c.name)===groupName);
   const expenseCategory=sameName.find(c=>c.type==="expense");
   const expenseBySubcategory=categories.find(c=>c.type==="expense"&&c.subcategories.some(sub=>sub.id===t.subcategoryId));
   const category=expenseBySubcategory || (t.type==="income"&&expenseNames.has(groupName)?expenseCategory:undefined) || byId || expenseCategory || sameName.find(c=>c.type===t.type);
   const categoryName=category?.name||t.group;
   const subcategory=category?.subcategories.find(sub=>sub.id===t.subcategoryId)?.name||t.subcategory;
   const isExpense=t.type!=="transfer"&&(expenseNames.has(normalize(categoryName))||category?.type==="expense");
   const normalizedGroup=normalize(t.group||"");
   const normalizedCategory=normalize(categoryName);
   const normalizedSubcategory=normalize(subcategory||"");
   // A importação OFX pode marcar como receita uma transferência entre contas.
   // Respeitar a categoria/subcategoria original mesmo quando a categoria foi
   // associada a um tipo "income" na migração.
   const normalizedDescription=normalize(t.description||"");
   const transferCategory=/transferenc|transferencias|transfer entre contas|entre contas|faturas/.test(normalizedGroup)||
    /transferenc|transferencias|transfer entre contas|entre contas|faturas/.test(normalizedCategory)||
    /transferenc|transferencias|transfer entre contas|entre contas|faturas/.test(normalizedSubcategory);
   const cardPayment=/pagamento (?:de |da )?fatura|pagto (?:de |da )?fatura|pgt[o.]? (?:de |da )?fatura|fatura (?:cartao|nubank|inter|credito)|pagamento (?:cartao|cartao de credito)|debito automatico (?:cartao|fatura)/.test(normalizedDescription)||
    /pagamento (?:de |da )?fatura|pagto (?:de |da )?fatura|fatura do cartao/.test(normalizedSubcategory);
   const isTransfer=t.type==="transfer"||category?.type==="transfer"||transferCategory||cardPayment;
   const isInvestmentMovement=normalize(categoryName)==="investimentos"&&/^(aplicacao|resgate)\b/.test(normalize(subcategory||""));
   const type=isTransfer||isInvestmentMovement?"transfer":isExpense?"expense":category?.type==="income"?"income":t.type;
   const direction=t.type==="income"?1:t.type==="expense"?-1:0;
   const signedAmount=type==="income"?direction*t.amountCents:type==="expense"?-direction*t.amountCents:0;
   return {transaction:t,type,signedAmount,group:categoryName,subcategory};
  });
 },[transactions,categories]);
 const monthly=useMemo(()=>Array.from({length:12},(_,index)=>{
  const prefix=year+"-"+String(index+1).padStart(2,"0");
  const items=classified.filter(({transaction:t,type})=>t.date.startsWith(prefix)&&!t.internalTransferPairId&&t.type!=="transfer"&&type!=="transfer");
  const income=items.filter(t=>t.type==="income").reduce((sum,t)=>sum+t.signedAmount,0);
  const expense=items.filter(t=>t.type==="expense").reduce((sum,t)=>sum+t.signedAmount,0);
  return {month:monthNames[index],income,expense,balance:income-expense,count:items.length};
 }),[classified,year]);
 const categoryRows=useMemo(()=>{
  const data=classified.filter(({transaction:t,type})=>t.date.startsWith(String(year)+"-")&&!t.internalTransferPairId&&t.type!=="transfer"&&type!=="transfer");
  return (["income","expense"] as const).map(type=>{
   const rows=new Map<string,{name:string;months:number[];subs:Map<string,number[]>}>();
   for(const t of data.filter(x=>x.type===type)){
    const month=Number(t.transaction.date.slice(5,7))-1;
    if(month<0||month>11)continue;
    const category=(t.group||"Sem categoria").trim()||"Sem categoria";
    const sub=(t.subcategory||"Sem subcategoria").trim()||"Sem subcategoria";
    if(!rows.has(category))rows.set(category,{name:category,months:Array(12).fill(0),subs:new Map()});
    const row=rows.get(category)!;
    row.months[month]+=t.signedAmount;
    if(!row.subs.has(sub))row.subs.set(sub,Array(12).fill(0));
    row.subs.get(sub)![month]+=t.signedAmount;
   }
   return {type,rows:Array.from(rows.values()).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"))};
  });
 },[classified,year]);
 const [collapsedCategories,setCollapsedCategories]=useState<string[]>([]);
 const allCategoryKeys=categoryRows.flatMap(section=>section.rows.map(row=>section.type+"-"+row.name));
 const allCollapsed=allCategoryKeys.length>0&&allCategoryKeys.every(key=>collapsedCategories.includes(key));
 const totalFor=(values:number[])=>values.reduce((a,b)=>a+b,0);
 const monthsWithEntries=monthly.filter(m=>m.count>0).length||1;
 const totalIncome=monthly.reduce((n,m)=>n+m.income,0),totalExpense=monthly.reduce((n,m)=>n+m.expense,0);
 const max=Math.max(1,...monthly.flatMap(m=>[m.income,m.expense]));
 return <div className="space-y-6">
  <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-2xl font-semibold text-[#26364D]">Receitas e despesas mês a mês</h2><p className="mt-1 text-sm text-[#718096]">Evolução financeira baseada nos lançamentos cadastrados. Transferências entre contas próprias não entram nos totais.</p></div><label className="flex items-center gap-2 text-sm text-[#526B8B]">Ano <select value={year} onChange={e=>setSelectedYear(Number(e.target.value))} className="rounded-xl border border-[#DCE5EF] bg-white px-4 py-2">{(years.length?years:[year]).map(y=><option key={y} value={y}>{y}</option>)}</select></label></div>
  <div className="flex w-fit gap-1 rounded-2xl border border-white/80 bg-white/45 p-1.5 shadow-[0_8px_24px_rgba(57,75,99,0.07)] backdrop-blur-2xl" role="tablist" aria-label="Visualização do relatório">{([{id:"charts",name:"Gráficos"},{id:"analytic",name:"Analítico"},{id:"monthly",name:"Detalhamento mensal"}] as const).map(tab=><button key={tab.id} type="button" role="tab" aria-selected={reportTab===tab.id} onClick={()=>setReportTab(tab.id)} className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${reportTab===tab.id?"bg-white/85 text-[#26364D] shadow-[0_4px_16px_rgba(46,68,91,0.13)] ring-1 ring-white":"text-[#718096] hover:bg-white/45"}`}>{tab.name}</button>)}</div>
  {reportTab==="charts"&&<>
  <div className="grid gap-4 sm:grid-cols-3">{[{name:"Receitas no ano",value:totalIncome,color:"text-emerald-700"},{name:"Despesas no ano",value:totalExpense,color:"text-rose-700"},{name:"Resultado no ano",value:totalIncome-totalExpense,color:totalIncome>=totalExpense?"text-emerald-700":"text-rose-700"}].map(item=><div key={item.name} className="rounded-2xl border border-white bg-white/70 p-5 shadow-sm"><p className="text-sm text-[#718096]">{item.name}</p><p className={`mt-2 text-xl font-semibold ${item.color}`}>{money(item.value)}</p></div>)}</div>
  <section className="rounded-3xl border border-white bg-white/70 p-5 shadow-sm"><h3 className="font-semibold text-[#26364D]">Comparativo mensal</h3><div className="mt-2 flex gap-5 text-xs text-[#64748B]"><span>🟢 Receitas</span><span>🔴 Despesas</span></div><div className="mt-6 grid grid-cols-12 gap-1.5 sm:gap-3">{monthly.map(m=><div key={m.month} className="min-w-0 text-center" title={`${m.month}: receitas ${money(m.income)}; despesas ${money(m.expense)}`}><div className="flex h-40 items-end justify-center gap-0.5 sm:gap-1"><div className="w-2.5 rounded-t bg-emerald-500 sm:w-4" style={{height:`${m.income/max*100}%`}}/><div className="w-2.5 rounded-t bg-rose-400 sm:w-4" style={{height:`${m.expense/max*100}%`}}/></div><p className="mt-2 text-[10px] text-[#64748B] sm:text-xs">{m.month}</p></div>)}</div></section>
</>}
  {reportTab==="monthly"&&<>
  <section className="overflow-x-auto rounded-3xl border border-white bg-white/70 p-5 shadow-sm"><h3 className="mb-4 font-semibold text-[#26364D]">Detalhamento por mês</h3><table className="w-full min-w-[550px] text-sm"><thead><tr className="border-b border-[#E2E8F0] text-left text-xs text-[#718096]"><th className="py-3">Mês</th><th className="py-3 text-right">Receitas</th><th className="py-3 text-right">Despesas</th><th className="py-3 text-right">Resultado</th></tr></thead><tbody>{monthly.map(m=><tr key={m.month} className="border-b border-[#EDF0F4] last:border-0"><td className="py-3 font-medium text-[#35445A]">{m.month}</td><td className="py-3 text-right text-emerald-700">{money(m.income)}</td><td className="py-3 text-right text-rose-700">{money(m.expense)}</td><td className={`py-3 text-right font-semibold ${m.balance>=0?"text-emerald-700":"text-rose-700"}`}>{money(m.balance)}</td></tr>)}</tbody><tfoot><tr className="border-t-2 border-[#DCE5EF] font-semibold"><td className="pt-4">Total</td><td className="pt-4 text-right">{money(totalIncome)}</td><td className="pt-4 text-right">{money(totalExpense)}</td><td className="pt-4 text-right">{money(totalIncome-totalExpense)}</td></tr></tfoot></table></section>
</>}
  {reportTab==="analytic"&&<div className="space-y-6">
   <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[#718096]">Categorias e subcategorias por mês, separadas por tipo de movimentação.</p><button type="button" onClick={()=>setCollapsedCategories(allCollapsed?[]:allCategoryKeys)} className="rounded-xl border border-white/90 bg-white/75 px-4 py-2 text-xs font-semibold text-[#455A64] shadow-sm backdrop-blur-xl transition hover:bg-white">{allCollapsed?"Expandir todas as subcategorias":"Recolher todas as subcategorias"}</button></div>
   {categoryRows.map(section=>{ const totalFill=section.type==="income"?"bg-[#A9DBB5]/85":"bg-[#F0ABB4]/85"; return <section key={section.type} className={`overflow-x-auto rounded-3xl border p-5 shadow-[0_12px_36px_rgba(52,72,99,0.08)] backdrop-blur-2xl ${section.type==="income"?"border-[#C8E6C9]/70 bg-[#E5F3E6]/35":"border-[#FFCDD2]/70 bg-[#FCE8E8]/35"}`}>
    <h3 className={`mb-2 text-lg font-semibold ${section.type==="income"?"text-[#1B5E20]":"text-[#B71C1C]"}`}>{section.type==="income"?"Receitas":"Despesas"}</h3>
    <p className="mb-4 text-xs text-[#718096]">Subcategorias abertas por padrão. Clique em cada categoria para recolher ou expandir.</p>
   <table className="w-full min-w-[1250px] border-collapse text-xs">
    <thead><tr className="border-b border-[#DCE5EF] text-[#526B8B]"><th className="sticky left-0 z-10 min-w-[210px] bg-transparent py-3 pr-4 text-left backdrop-blur-xl">Categoria / Subcategoria</th>{monthNames.map(m=><th key={m} className="px-2 py-3 text-right">{m}</th>)}<th className="px-2 py-3 text-right">Total anual</th><th className="px-2 py-3 text-right">Média mensal</th></tr></thead>

    <tbody>

     <tr key={section.type+"-heading"} className={section.type==="income"?"bg-[#E5F3E6]/80 font-bold text-[#1B5E20]":"bg-[#FCE8E8]/80 font-bold text-[#B71C1C]"}><td colSpan={15} className="px-3 py-3">{section.type==="income"?"RECEITAS":"DESPESAS"}</td></tr>
     {section.rows.map(row=>{
      const key=section.type+"-"+row.name;const expanded=!collapsedCategories.includes(key);
      const categoryFill=section.type==="income"?"bg-[#C9E8D1]/85":"bg-[#F5C6CC]/85";
      const subcategoryFill=section.type==="income"?"bg-[#E7F5E9]/80":"bg-[#FCE7EA]/80";
      const totalFill=section.type==="income"?"bg-[#A9DBB5]/85":"bg-[#F0ABB4]/85";
      return <><tr key={key} className={`border-b-2 border-white/75 font-semibold ${section.type==="income"?"text-[#1B5E20]":"text-[#B71C1C]"}`}>
       <td className={`sticky left-0 py-2 pr-4 ${categoryFill}`}><button type="button" className="text-left hover:text-blue-700" onClick={()=>setCollapsedCategories(current=>expanded?[...current,key]:current.filter(k=>k!==key))}>{expanded?"▾":"▸"} {row.name}</button></td>
       {row.months.map((v,i)=><td key={i} className={`px-2 py-2 text-right ${categoryFill}`}>{v?money(v):"—"}</td>)}<td className={`px-2 py-2 text-right ${categoryFill}`}>{money(totalFor(row.months))}</td><td className={`px-2 py-2 text-right ${categoryFill}`}>{money(Math.round(totalFor(row.months)/monthsWithEntries))}</td>
      </tr>
      {expanded&&Array.from(row.subs.entries()).sort((a,b)=>a[0].localeCompare(b[0],"pt-BR")).map(([name,values])=><tr key={key+"-"+name} className={`border-b-2 border-white/75 ${section.type==="income"?"text-[#2E7D32]":"text-[#C62828]"}`}><td className={`sticky left-0 py-2 pl-5 pr-4 ${subcategoryFill}`}>{name}</td>{values.map((v,i)=><td key={i} className={`px-2 py-2 text-right ${subcategoryFill}`}>{v?money(v):"—"}</td>)}<td className={`px-2 py-2 text-right ${subcategoryFill}`}>{money(totalFor(values))}</td><td className={`px-2 py-2 text-right ${subcategoryFill}`}>{money(Math.round(totalFor(values)/monthsWithEntries))}</td></tr>)}</>;
     })}
     <tr key={section.type+"-total"} className={`border-t-2 border-white/80 font-bold ${section.type==="income"?"bg-[#C8E6C9]/65 text-[#1B5E20]":"bg-[#FFCDD2]/65 text-[#B71C1C]"}`}><td className={`sticky left-0 py-3 ${totalFill}`}>{section.type==="income"?"TOTAL RECEITAS":"TOTAL DESPESAS"}</td>{monthly.map((m,i)=><td key={i} className={`px-2 py-3 text-right ${totalFill}`}>{money(section.type==="income"?m.income:m.expense)}</td>)}<td className={`px-2 py-3 text-right ${totalFill}`}>{money(section.type==="income"?totalIncome:totalExpense)}</td><td className={`px-2 py-3 text-right ${totalFill}`}>{money(Math.round((section.type==="income"?totalIncome:totalExpense)/monthsWithEntries))}</td></tr>

    </tbody>
   </table>
   </section>})}
  </div>}
 </div>;
}
