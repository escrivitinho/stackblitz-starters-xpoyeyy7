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
  const sums=new Map<string,{current:number,annual:number}>();
  for(const t of transactions){
   if(t.type==="transfer"||t.internalTransferPairId||!t.date.startsWith(String(year)+"-"))continue;
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
   const existing=sums.get(key)||{current:0,annual:0};
   existing.annual+=signed;
   if(t.date.startsWith(year+"-"+month))existing.current+=signed;
   sums.set(key,existing);
  }
  const elapsedMonths=now.getMonth()+1;
  return Array.from(sums.entries()).map(([name,values])=>({name,amount:period==="month"?values.current:period==="year"?values.annual:Math.round(values.annual/elapsedMonths),average:Math.round(values.annual/elapsedMonths)})).filter(item=>item.amount>0).sort((a,b)=>b.amount-a.amount).slice(0,5);
 },[transactions,categories,period,level,year,month,expenseNames]);
 const maximum=Math.max(1,...ranked.map(x=>x.amount));
 const periodNames:{[key in Period]:string}={month:"Mês atual",year:"Ano",average:"Média mensal do ano"};
 return <section className="rounded-3xl border border-white/80 bg-white/45 p-5 shadow-[0_12px_38px_rgba(55,75,103,0.09),inset_0_1px_1px_rgba(255,255,255,0.9)] backdrop-blur-2xl sm:p-6">
  <div className="flex flex-wrap items-start justify-between gap-4">
   <div><h3 className="text-lg font-semibold text-[#26364D]">Para onde está indo seu dinheiro?</h3><p className="mt-1 text-sm text-[#64748B]">Estas são as 5 {level==="category"?"categorias":"subcategorias"} em que você mais gastou {period==="month"?"neste mês":period==="year"?"neste ano":"em média por mês"}.</p><p className="mt-1 text-xs text-[#94A3B8]">{periodNames[period]} · {year} · valores líquidos de reembolsos</p></div>
   <div className="flex flex-wrap gap-2">
    <div className="flex rounded-xl border border-white/80 bg-white/35 p-1 backdrop-blur-xl">{([{id:"month",label:"Mês atual"},{id:"year",label:"Ano"},{id:"average",label:"Média mensal"}] as const).map(option=><button key={option.id} type="button" aria-pressed={period===option.id} onClick={()=>setPeriod(option.id)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${period===option.id?"bg-white/90 text-[#26364D] shadow-sm":"text-[#718096] hover:bg-white/50"}`}>{option.label}</button>)}</div>
    <div className="flex rounded-xl border border-white/80 bg-white/35 p-1 backdrop-blur-xl">{([{id:"category",label:"Categorias"},{id:"subcategory",label:"Subcategorias"}] as const).map(option=><button key={option.id} type="button" aria-pressed={level===option.id} onClick={()=>setLevel(option.id)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${level===option.id?"bg-white/90 text-[#26364D] shadow-sm":"text-[#718096] hover:bg-white/50"}`}>{option.label}</button>)}</div>
   </div>
  </div>
  <div className="mt-6 space-y-4">{ranked.length?ranked.map((item,index)=><div key={item.name}>
   <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm"><span className="min-w-0 font-semibold text-[#455A64]" title={item.name}><span className="mr-2 text-xs text-[#94A3B8]">{index+1}.</span>{item.name}</span><div className="flex flex-wrap items-center gap-x-4 gap-y-1"><span className="font-semibold tabular-nums text-[#B45360]">{formatCents(item.amount)} <span className="text-xs font-normal text-[#718096]">{period==="month"?"neste mês":period==="year"?"no ano":"por mês"}</span></span><span className="text-xs tabular-nums text-[#64748B]">Média mensal: <strong className="text-[#455A64]">{formatCents(item.average)}</strong></span></div></div>
   <div className="h-2.5 overflow-hidden rounded-full bg-white/60 shadow-inner"><div className="h-full rounded-full bg-gradient-to-r from-rose-300/85 via-rose-400/80 to-red-400/80 transition-all duration-300" style={{width:`${item.amount/maximum*100}%`}}/></div>
  </div>):<p className="rounded-xl border border-white/70 bg-white/40 p-5 text-sm text-[#718096]">Nenhuma despesa encontrada neste período.</p>}</div>
  <p className="mt-4 text-xs text-[#718096]">Média mensal calculada sobre os meses decorridos do ano ({now.getMonth()+1} {now.getMonth()===0?"mês":"meses"}), incluindo meses sem gastos. Transferências e pagamentos de fatura não entram no cálculo.</p>
 </section>;
}
