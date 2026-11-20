"use client";
import {useMemo,useState} from "react";
import type {Category} from "./categories-manager";
export type DescriptionRule={id:string;term:string;categoryId:string;subcategoryId:string};
export const normalizeRuleText=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
export function matchDescriptionRule(description:string,rules:DescriptionRule[],categories:Category[]){
 const text=normalizeRuleText(description);
 return [...rules].filter(r=>r.term.trim()&&text.includes(normalizeRuleText(r.term))&&categories.some(c=>c.id===r.categoryId&&c.subcategories.some(s=>s.id===r.subcategoryId))).sort((a,b)=>b.term.length-a.term.length)[0];
}
type BulkRow={line:number;term:string;category:string;subcategory:string;categoryId?:string;subcategoryId?:string;issue?:string};
function parseBulk(text:string):Array<{line:number;term:string;category:string;subcategory:string}> {
 return text.split(/\r?\n/).flatMap((raw,index)=>{
  const line=raw.trim();
  if(!line || /^\|?\s*:?-{3,}/.test(line))return [];
  let parts:string[];
  if(line.startsWith("|"))parts=line.replace(/^\|/,"").replace(/\|$/,"").split("|").map(x=>x.trim().replace(/^\*\*(.*)\*\*$/,"$1"));
  else if(line.includes("\t"))parts=line.split("\t").map(x=>x.trim());
  else if(line.includes(";"))parts=line.split(";").map(x=>x.trim());
  else return [{line:index+1,term:line,category:"",subcategory:""}];
  if(normalizeRuleText(parts[0]||"").replace(/[_\s]/g,"")==="palavrachave")return [];
  return [{line:index+1,term:parts[0]||"",category:parts[1]||"",subcategory:parts[2]||""}];
 });
}
export default function DescriptionRules({rules,onChange,categories}:{rules:DescriptionRule[];onChange:(rules:DescriptionRule[])=>void;categories:Category[]}){
 const [term,setTerm]=useState("");
 const [categoryId,setCategoryId]=useState("");
 const [subcategoryId,setSubcategoryId]=useState("");
 const [error,setError]=useState("");
 const [bulkText,setBulkText]=useState("");
 const [bulkMessage,setBulkMessage]=useState("");
 const bulkRows=useMemo(()=>{
  const parsed=parseBulk(bulkText);
  const grouped=new Map<string,Set<string>>();
  for(const row of parsed){
   const key=normalizeRuleText(row.term);
   if(!key)continue;
   if(!grouped.has(key))grouped.set(key,new Set());
   grouped.get(key)!.add(normalizeRuleText(row.category)+"|"+normalizeRuleText(row.subcategory));
  }
  const seen=new Set<string>();
  return parsed.map(row=>{
   const key=normalizeRuleText(row.term);
   const cat=categories.find(c=>normalizeRuleText(c.name)===normalizeRuleText(row.category));
   const sub=cat?.subcategories.find(x=>normalizeRuleText(x.name)===normalizeRuleText(row.subcategory));
   let issue="";
   if(!row.term||!row.category)issue="Descrição ou categoria ausente";
   else if((grouped.get(key)?.size||0)>1)issue="Classificações conflitantes para a mesma descrição";
   else if(seen.has(key))issue="Descrição repetida na lista";
   else if(rules.some(r=>normalizeRuleText(r.term)===key))issue="Regra já cadastrada";
   else if(!cat)issue="Categoria não encontrada";
   else if(!row.subcategory)issue="Subcategoria não informada";
   else if(!sub)issue="Subcategoria não encontrada nesta categoria";
   seen.add(key);
   return {...row,categoryId:cat?.id,subcategoryId:sub?.id,issue};
  });
 },[bulkText,categories,rules]);
 const validBulk=bulkRows.filter(r=>!r.issue);
 function importBulk(){
  if(!validBulk.length)return;
  onChange([...rules,...validBulk.map((r,i)=>({id:"rule-bulk-"+Date.now()+"-"+i,term:r.term,categoryId:r.categoryId!,subcategoryId:r.subcategoryId!}))]);
  setBulkText("");
  setBulkMessage(validBulk.length+" regras adicionadas. Aguarde a confirmação 'Salvo no Supabase' antes de sair.");
 }

 const category=categories.find(c=>c.id===categoryId);
 function add(){
  const clean=term.trim();
  if(!clean||!categoryId||!subcategoryId){setError("Informe a descrição, a categoria e a subcategoria.");return;}
  if(rules.some(r=>normalizeRuleText(r.term)===normalizeRuleText(clean))){setError("Essa descrição já possui uma regra.");return;}
  onChange([...rules,{id:"rule-"+Date.now(),term:clean,categoryId,subcategoryId}]);
  setTerm("");setError("");
 }
 return <div className="space-y-5">
  <div className="rounded-3xl border border-white/80 bg-white/60 p-5 shadow-sm backdrop-blur-2xl">
   <h3 className="text-lg font-semibold text-[#263D59]">Importar regras em lote</h3>
   <p className="mt-1 text-sm text-[#64748B]">Cole três colunas: Palavra_Chave, Categoria e Subcategoria. Aceita tabela Markdown, texto separado por tabulação (Excel/Sheets) ou ponto e vírgula. A importação não cria categorias novas.</p>
   <textarea value={bulkText} onChange={e=>{setBulkText(e.target.value);setBulkMessage("");}} rows={7} placeholder={"Palavra_Chave\\tCategoria\\tSubcategoria\\nNetflix\\tAssinaturas\\tStreaming"} className="mt-4 w-full rounded-xl border border-[#DDE5EE] bg-white/90 p-3 font-mono text-xs outline-none" />
   {bulkRows.length>0&&<div className="mt-3 space-y-2">
    <p className="text-sm font-semibold text-[#263D59]">{validBulk.length} prontas para importar · {bulkRows.length-validBulk.length} precisam de revisão</p>
    <div className="max-h-64 overflow-auto rounded-xl border border-[#DDE5EE] bg-white/70">
     <table className="w-full text-left text-xs"><thead><tr className="border-b"><th className="p-2">Linha</th><th className="p-2">Descrição</th><th className="p-2">Categoria / Subcategoria</th><th className="p-2">Resultado</th></tr></thead><tbody>
     {bulkRows.map((row,i)=><tr key={i} className="border-b border-slate-100"><td className="p-2">{row.line}</td><td className="p-2">{row.term}</td><td className="p-2">{row.category} / {row.subcategory||"—"}</td><td className={"p-2 "+(row.issue?"text-amber-700":"text-emerald-700")}>{row.issue||"Pronta"}</td></tr>)}
     </tbody></table>
    </div>
   </div>}
   <button type="button" disabled={!validBulk.length} onClick={importBulk} className="mt-4 rounded-xl bg-[#344D70] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">Cadastrar {validBulk.length} regras válidas</button>
   {bulkMessage&&<p role="status" className="mt-3 text-sm text-emerald-700">{bulkMessage}</p>}
   <p className="mt-2 text-xs text-[#64748B]">Linhas conflitantes, repetidas ou sem correspondência são ignoradas e exibidas na prévia. Ajuste os nomes ou cadastre a subcategoria antes de importar.</p>
  </div>
  <div className="rounded-3xl border border-white/80 bg-white/60 p-5 shadow-sm backdrop-blur-2xl">
   <h3 className="text-lg font-semibold text-[#263D59]">Classificação automática por descrição</h3>
   <p className="mt-1 text-sm text-[#64748B]">Cadastre uma palavra ou expressão que apareça na descrição. Ao digitá-la em um novo lançamento, a categoria e a subcategoria serão preenchidas automaticamente.</p>
   <div className="mt-5 grid gap-3 md:grid-cols-3">
    <label className="space-y-1 text-sm text-[#52627A]">Descrição contém<input value={term} onChange={e=>setTerm(e.target.value)} placeholder="Ex.: Netflix" className="w-full rounded-xl border border-[#DDE5EE] bg-white/80 p-3 outline-none"/></label>
    <label className="space-y-1 text-sm text-[#52627A]">Categoria<select value={categoryId} onChange={e=>{setCategoryId(e.target.value);setSubcategoryId("");}} className="w-full rounded-xl border border-[#DDE5EE] bg-white/80 p-3"><option value="">Selecione</option>{categories.filter(c=>c.type!=="transfer").map(c=><option key={c.id} value={c.id}>{c.name} ({c.type==="income"?"Receita":"Despesa"})</option>)}</select></label>
    <label className="space-y-1 text-sm text-[#52627A]">Subcategoria<select value={subcategoryId} onChange={e=>setSubcategoryId(e.target.value)} className="w-full rounded-xl border border-[#DDE5EE] bg-white/80 p-3"><option value="">Selecione</option>{category?.subcategories.map(sub=><option key={sub.id} value={sub.id}>{sub.name}</option>)}</select></label>
   </div>
   {error&&<p className="mt-3 text-sm text-rose-700">{error}</p>}
   <button type="button" onClick={add} className="mt-4 rounded-xl bg-[#344D70] px-5 py-3 text-sm font-semibold text-white">+ Cadastrar regra</button>
  </div>
  <div className="rounded-3xl border border-white/80 bg-white/60 p-5 shadow-sm backdrop-blur-2xl">
   <h4 className="font-semibold text-[#263D59]">Regras cadastradas ({rules.length})</h4>
   <div className="mt-3 space-y-2">{rules.length?rules.map(rule=>{const cat=categories.find(c=>c.id===rule.categoryId);const sub=cat?.subcategories.find(x=>x.id===rule.subcategoryId);return <div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/80 bg-white/60 p-3 text-sm"><div><strong className="text-[#263D59]">{rule.term}</strong><span className="ml-2 text-[#64748B]">→ {cat?.name||"Categoria removida"} / {sub?.name||"Subcategoria removida"}</span></div><button type="button" onClick={()=>onChange(rules.filter(x=>x.id!==rule.id))} className="rounded-lg px-3 py-2 text-rose-700 hover:bg-rose-50">Excluir</button></div>}):<p className="text-sm text-[#64748B]">Nenhuma regra cadastrada ainda.</p>}</div>
  </div>
 </div>;
}
