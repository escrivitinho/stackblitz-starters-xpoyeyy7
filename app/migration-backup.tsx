"use client";
import { useState } from "react";

const storageKey = "moneo-finance-v1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const collections = ["accounts","transactions","categories","descriptionRules","cardEntries","pendingTransactions","rejectedTransferPairs"] as const;

export default function MigrationBackup({ token }: { token: string }) {
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [failed,setFailed]=useState(false);
 function snapshot() {
   const raw=window.localStorage.getItem(storageKey);
   if(!raw) throw new Error("Nenhum dado local encontrado neste endereço. Abra o MONEO no endereço que contém seu histórico.");
   const payload: unknown=JSON.parse(raw);
   if(!payload || typeof payload!=="object" || Array.isArray(payload)) throw new Error("Backup local inválido.");
   const data=payload as Record<string,unknown>;
   const counts: Record<string, number> = Object.fromEntries(collections.map(name => { const value = data[name]; return [name, Array.isArray(value) ? value.length : 0]; }));
   return {payload:data,counts};
 }
 function download() {
   try {
     const data=snapshot();
     const blob=new Blob([JSON.stringify({format:"moneo-finance-v1",exportedAt:new Date().toISOString(),...data},null,2)],{type:"application/json"});
     const href=URL.createObjectURL(blob);
     const anchor=document.createElement("a");anchor.href=href;anchor.download="moneo-backup-"+new Date().toISOString().slice(0,10)+".json";anchor.click();
     URL.revokeObjectURL(href);setFailed(false);setMessage("Backup JSON gerado. Guarde o arquivo em local seguro.");
   }catch(e){setFailed(true);setMessage(e instanceof Error?e.message:"Falha ao gerar backup.");}
 }
 async function upload(){
   if(!url||!key)return;
   setBusy(true);setMessage("");setFailed(false);
   try{
     const data=snapshot();
     if(!window.confirm("Enviar uma cópia dos dados DESTE navegador para o Supabase? Nada será apagado ou substituído. Confira se este endereço contém seu histórico completo."))return;
     const user=await fetch(url+"/auth/v1/user",{headers:{apikey:key,Authorization:"Bearer "+token}});
     if(!user.ok)throw new Error("Sessão expirada. Entre novamente com Google.");
     const profile=await user.json();
     if(!profile.id)throw new Error("Não foi possível identificar seu usuário.");
     const response=await fetch(url+"/rest/v1/moneo_migration_snapshots?select=id,counts,created_at",{
       method:"POST",headers:{apikey:key,Authorization:"Bearer "+token,"Content-Type":"application/json",Prefer:"return=representation"},
       body:JSON.stringify({owner_id:profile.id,source_origin:window.location.origin,payload:data.payload,counts:data.counts})
     });
     if(!response.ok){
       const detail=await response.json().catch(()=>({}));
       throw new Error("Falha ao gravar no Supabase (HTTP "+response.status+"). "+(typeof detail.message==="string"?detail.message:"Confira se executou o SQL de snapshots."));
     }
     const rows=await response.json();
     const id=rows?.[0]?.id;
     if(!id)throw new Error("Servidor não confirmou o identificador do backup.");
     const verify=await fetch(url+"/rest/v1/moneo_migration_snapshots?id=eq."+encodeURIComponent(id)+"&select=id,counts",{
       headers:{apikey:key,Authorization:"Bearer "+token}
     });
     if(!verify.ok)throw new Error("Backup enviado, mas não foi possível conferir a leitura.");
     const stored=await verify.json();
     if(stored.length!==1||collections.some(name=>stored[0].counts?.[name]!==data.counts[name]))
       throw new Error("Backup enviado, mas a conferência das contagens falhou. Não prossiga sem revisar.");
     setMessage("Cópia online criada e contagens conferidas! ID: "+id+". O MONEO ainda usa o armazenamento local.");
   }catch(e){setFailed(true);setMessage(e instanceof Error?e.message:"Erro inesperado na migração.");}
   finally{setBusy(false);}
 }
 return <section className="mx-auto mb-5 w-full max-w-6xl rounded-2xl border border-[#C9D9EA] bg-white/85 p-4 text-[#263D59] shadow-sm">
   <h2 className="text-base font-semibold">Migração segura · Etapa 1 de 2</h2>
   <p className="mt-1 text-sm text-[#63768D]">Primeiro faça o download do backup; depois envie uma cópia para o Supabase. Nenhum dado local será apagado.</p>
   <div className="mt-3 flex flex-wrap gap-2">
     <button onClick={download} className="rounded-xl border border-[#C9D9EA] bg-white px-4 py-2 text-sm font-medium">1. Baixar backup JSON</button>
     <button disabled={busy} onClick={upload} className="rounded-xl bg-[#263D59] px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{busy?"Enviando e conferindo…":"2. Criar cópia no Supabase"}</button>
   </div>
   {message&&<p role="status" className={"mt-3 break-words text-sm "+(failed?"text-rose-700":"text-emerald-700")}>{message}</p>}
 </section>;
}
