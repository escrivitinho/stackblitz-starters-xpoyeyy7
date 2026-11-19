"use client";

const folders = [
  { label: "Extratos · Caixa", path: "FINANCEIRO / FINANCEIRO 2026 / EXTRATOS / CAIXA", format: "OFX" },
  { label: "Extratos · Inter", path: "FINANCEIRO / FINANCEIRO 2026 / EXTRATOS / INTER", format: "OFX" },
  { label: "Extratos · Nubank", path: "FINANCEIRO / FINANCEIRO 2026 / EXTRATOS / NUBANK", format: "OFX" },
  { label: "Faturas de cartões", path: "FINANCEIRO / FINANCEIRO 2026 / FATURAS", format: "CSV" },
];

export default function DriveSettings() {
  return (
    <section className="mt-5 rounded-3xl border border-white/90 bg-white/65 p-6 shadow-sm backdrop-blur-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#26364D]">Google Drive</h2>
          <p className="mt-2 text-sm text-[#707780]">Preparação da sincronização manual de extratos e faturas.</p>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">Não conectado</span>
      </div>
      <div className="mt-5 rounded-2xl border border-[#E5EAF0] bg-white/70 p-4">
        <p className="text-sm font-semibold text-[#26364D]">Pastas planejadas</p>
        <p className="mt-1 text-xs text-[#77879B]">Estas pastas são apenas referências. Nenhum acesso foi concedido e nenhum arquivo foi lido.</p>
        <div className="mt-3 space-y-3">
          {folders.map((folder) => (
            <div key={folder.path} className="flex flex-wrap items-start justify-between gap-2 border-t border-[#E5EAF0] pt-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#26364D]">{folder.label}</p>
                <p className="break-words text-xs text-[#77879B]">{folder.path}</p>
              </div>
              <span className="rounded-lg bg-[#F1F5F9] px-2 py-1 text-xs text-[#526F96]">{folder.format}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 rounded-2xl bg-[#F4F7FA] p-4">
        <p className="text-sm font-semibold text-[#26364D]">Próximas etapas</p>
        <p className="mt-2 text-sm leading-6 text-[#64748B]">Conectar sua conta Google com autorização OAuth, escolher as pastas e conferir novos arquivos antes de importar. Para encontrar automaticamente arquivos adicionados às pastas, precisaremos avaliar a permissão de leitura do Drive.</p>
        <p className="mt-2 text-xs text-[#77879B]">A sincronização ainda não está ativa. Seus lançamentos continuam armazenados apenas neste navegador; mantenha backups JSON atualizados.</p>
      </div>
    </section>
  );
}
