"use client";
import {useState} from "react";
import type {Category} from "./categories-manager";
export type DescriptionRule={id:string;term:string;categoryId:string;subcategoryId:string};
export const normalizeRuleText=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
export function matchDescriptionRule(description:string,rules:DescriptionRule[],categories:Category[]){
 const text=normalizeRuleText(description);
 return [...rules].filter(r=>r.term.trim()&&text.includes(normalizeRuleText(r.term))&&categories.some(c=>c.id===r.categoryId&&c.subcategories.some(s=>s.id===r.subcategoryId))).sort((a,b)=>b.term.length-a.term.length)[0];
}
export default function DescriptionRules({rules,onChange,categories}:{rules:DescriptionRule[];onChange:(rules:DescriptionRule[])=>void;categories:Category[]}){
 const [term,setTerm]=useState("");
 const [categoryId,setCategoryId]=useState("");
 const [subcategoryId,setSubcategoryId]=useState("");
 const [error,setError]=useState("");
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
