"use client";
import {useMemo,useState} from "react";
import type {Transaction} from "./transactions";
import type {Category} from "./categories-manager";
import {excelRules} from "./classification-preview";
import {formatCents} from "./lib/money";

const normalize=(value:string)=>value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR");
type Period="month"|"year"|"average";
type Level="category"|"subcategory";
export default function TopExpenses({transactions,categories}:{transactions:Transaction[];categories:Category[]}){
 const [period,setPeriod]=useState<Period>("month");
 const [level,setLevel]=useState<Level>("category");
 const now=new Date();
 const year=now.getFullYear();
 const month=String(now.getMonth()+1).padStart(2,"0");
 const expenseNames=useMemo(()=>new Set(excelRules.filter(rule=>rule[3]==="expense").map(rule=>normalize(rule[1]))),[]);
 const ranked=useMemo(()=>{
  const sums=new Map<string,number>();
  for(const t of transactions){
   if(t.type==="transfer"||t.internalTransferPairId||!t.date.startsWith(String(year)+"-"))continue;
   if(period==="month"&&!t.date.startsWith(year+"-"+month))continue;
   const byId=categories.find(c=>c.id===t.categoryId);
   const groupName=normalize(t.group||"");
   const sameName=categories.filter(c=>normalize(c.name)===groupName);
   const expenseCategory=sameName.find(c=>c.type==="expense");
   const expenseBySub=categories.find(c=>c.type==="expense"&&c.subcategories.some(sub=>sub.id===t.subcategoryId));
   const category=expenseBySub||(t.type==="income"&&expenseNames.has(groupName)?expenseCategory:undefined)||byId||expenseCategory||sameName.find(c=>c.type===t.type);
   const group=category?.name||t.group||"Sem categoria";
   const sub=category?.subcategories.find(x=>x.id===t.subcategoryId)?.name||t.subcategory||"Sem subcategoria";
   const transferText=[group,sub,t.group,t.description].map(normalize);
   if(transferText.some(x=>/transferenc|entre contas|faturas|pagamento (?:de |da )?fatura|pagto (?:de |da )?fatura|fatura (?:cartao|nubank|inter|credito)/.test(x)))continue;
   if(normalize(group)==="investimentos"&&/^(aplicacao|resgate)\b/.test(normalize(sub)))continue;
   if(!(category?.type==="expense"||expenseNames.has(normalize(group))||t.type==="expense"))continue;
   const key=level==="category"?group:group+" / "+sub;
   const signed=t.type==="income"?-t.amountCents:t.amountCents;
   sums.set(key,(sums.get(key)||0)+signed);
  }
  return Array.from(sums.entries()).map(([name,amount])=>({name,amount:period==="average"?Math.round(amount/12):amount})).filter(item=>item.amount>0).sort((a,b)=>b.amount-a.amount).slice(0,5);
 },[transactions,categories,period,level,year,month,expenseNames]);
 const maximum=Math.max(1,...ranked.map(x=>x.amount));
 const periodNames:{[key in Period]:string}={month:"Mês atual",year:"Ano",average:"Média mensal do ano"};
 return <section className="rounded-3xl border border-white/80 bg-white/45 p-5 shadow-[0_12px_38px_rgba(55,75,103,0.09),inset_0_1px_1px_rgba(255,255,255,0.9)] backdrop-blur-2xl sm:p-6">
  <div className="flex flex-wrap items-start justify-between gap-4">
   <div><h3 className="text-lg font-semibold text-[#26364D]">Top 5 despesas</h3><p className="mt-1 text-xs text-[#718096]">Maiores gastos líquidos · {periodNames[period]} · {year}</p></div>
   <div className="flex flex-wrap gap-2">
    <div className="flex rounded-xl border border-white/80 bg-white/35 p-1 backdrop-blur-xl">{([{id:"month",label:"Mês atual"},{id:"year",label:"Ano"},{id:"average",label:"Média anual"}] as const).map(option=><button key={option.id} type="button" aria-pressed={period===option.id} onClick={()=>setPeriod(option.id)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${period===option.id?"bg-white/90 text-[#26364D] shadow-sm":"text-[#718096] hover:bg-white/50"}`}>{option.label}</button>)}</div>
    <div className="flex rounded-xl border border-white/80 bg-white/35 p-1 backdrop-blur-xl">{([{id:"category",label:"Categorias"},{id:"subcategory",label:"Subcategorias"}] as const).map(option=><button key={option.id} type="button" aria-pressed={level===option.id} onClick={()=>setLevel(option.id)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${level===option.id?"bg-white/90 text-[#26364D] shadow-sm":"text-[#718096] hover:bg-white/50"}`}>{option.label}</button>)}</div>
   </div>
  </div>
  <div className="mt-6 space-y-4">{ranked.length?ranked.map((item,index)=><div key={item.name}>
   <div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate font-medium text-[#455A64]" title={item.name}><span className="mr-2 text-xs text-[#94A3B8]">{index+1}.</span>{item.name}</span><span className="shrink-0 font-semibold tabular-nums text-[#B45360]">{formatCents(item.amount)}</span></div>
   <div className="h-2.5 overflow-hidden rounded-full bg-white/60 shadow-inner"><div className="h-full rounded-full bg-gradient-to-r from-rose-300/85 via-rose-400/80 to-red-400/80 transition-all duration-300" style={{width:`${item.amount/maximum*100}%`}}/></div>
  </div>):<p className="rounded-xl border border-white/70 bg-white/40 p-5 text-sm text-[#718096]">Nenhuma despesa encontrada neste período.</p>}</div>
  {period==="average"&&<p className="mt-4 text-xs text-[#718096]">Média mensal do ano: total anual dividido por 12 meses.</p>}
 </section>;
}
