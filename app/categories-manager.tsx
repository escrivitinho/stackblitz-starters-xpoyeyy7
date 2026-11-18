"use client";

import { useState } from "react";

export type CategoryType = "income" | "expense" | "transfer";

export type Category = {
  id: string;
  name: string;
  type: CategoryType;
  subcategories: string[];
};

type Props = {
  categories: Category[];
  onChange: (categories: Category[]) => void;
};

const typeLabels: Record<CategoryType, string> = {
  income: "Receita",
  expense: "Despesa",
  transfer: "Transferência",
};

const typeStyles: Record<CategoryType, string> = {
  income: "bg-emerald-50 text-emerald-700",
  expense: "bg-rose-50 text-rose-700",
  transfer: "bg-blue-50 text-blue-700",
};

export default function CategoriesManager({ categories, onChange }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CategoryType>("expense");
  const [subcategory, setSubcategory] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const selected = categories.find((category) => category.id === selectedId) ?? null;

  function resetForm() {
    setName("");
    setType("expense");
    setSubcategory("");
    setEditingId(null);
    setError("");
  }

  function saveCategory() {
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Informe o nome da categoria.");
      return;
    }
    const duplicate = categories.some(
      (category) =>
        category.type === type &&
        category.name.toLocaleLowerCase("pt-BR") === cleanName.toLocaleLowerCase("pt-BR") &&
        category.id !== editingId
    );
    if (duplicate) {
      setError("Já existe uma categoria com esse nome para este tipo.");
      return;
    }

    if (editingId) {
      onChange(categories.map((category) =>
        category.id === editingId ? { ...category, name: cleanName, type } : category
      ));
      setSelectedId(editingId);
    } else {
      const created: Category = {
        id: `category-${Date.now()}`,
        name: cleanName,
        type,
        subcategories: [],
      };
      onChange([...categories, created]);
      setSelectedId(created.id);
    }
    resetForm();
  }

  function editCategory(category: Category) {
    setEditingId(category.id);
    setName(category.name);
    setType(category.type);
    setError("");
  }

  function removeCategory(category: Category) {
    if (!confirm(`Excluir a categoria "${category.name}" e suas subcategorias?`)) return;
    onChange(categories.filter((item) => item.id !== category.id));
    if (selectedId === category.id) setSelectedId(null);
    if (editingId === category.id) resetForm();
  }

  function addSubcategory() {
    const clean = subcategory.trim();
    if (!selected || !clean) return;
    if (selected.subcategories.some((item) => item.toLocaleLowerCase("pt-BR") === clean.toLocaleLowerCase("pt-BR"))) {
      setError("Essa subcategoria já existe nesta categoria.");
      return;
    }
    onChange(categories.map((category) =>
      category.id === selected.id
        ? { ...category, subcategories: [...category.subcategories, clean] }
        : category
    ));
    setSubcategory("");
    setError("");
  }

  function removeSubcategory(value: string) {
    if (!selected) return;
    onChange(categories.map((category) =>
      category.id === selected.id
        ? { ...category, subcategories: category.subcategories.filter((item) => item !== value) }
        : category
    ));
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {(["income", "expense", "transfer"] as CategoryType[]).map((item) => (
          <div key={item} className="rounded-3xl border border-white/90 bg-white/65 p-5 shadow-sm backdrop-blur-2xl">
            <p className="text-sm text-[#77879B]">Categorias de {typeLabels[item].toLowerCase()}s</p>
            <p className="mt-3 text-2xl font-semibold text-[#263D59]">{categories.filter((category) => category.type === item).length}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-3xl border border-white/90 bg-white/65 p-5 shadow-sm backdrop-blur-2xl md:p-6">
          <div className="mb-5">
            <h3 className="font-semibold text-[#26364D]">{editingId ? "Editar categoria" : "Nova categoria"}</h3>
            <p className="mt-1 text-xs text-[#94A0AF]">Organize suas receitas, despesas e transferências.</p>
          </div>
          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-xs font-medium text-[#64748B]">Nome da categoria</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Alimentação" className="w-full rounded-xl border border-[#E2E8F0] bg-white/80 px-4 py-3 text-sm outline-none focus:border-[#7898BF]" />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-medium text-[#64748B]">Tipo</span>
              <select value={type} onChange={(event) => setType(event.target.value as CategoryType)} className="w-full rounded-xl border border-[#E2E8F0] bg-white/80 px-4 py-3 text-sm outline-none">
                <option value="expense">Despesa</option>
                <option value="income">Receita</option>
                <option value="transfer">Transferência</option>
              </select>
            </label>
            {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
            <div className="flex flex-wrap justify-end gap-3">
              {editingId && <button onClick={resetForm} className="rounded-xl border border-[#E2E8F0] bg-white/70 px-4 py-3 text-sm text-[#64748B]">Cancelar</button>}
              <button onClick={saveCategory} className="rounded-xl bg-[#294263] px-5 py-3 text-sm font-medium text-white hover:bg-[#203653]">{editingId ? "Salvar alterações" : "Adicionar categoria"}</button>
            </div>
          </div>

          <div className="mt-7 border-t border-[#E9EEF4] pt-5">
            <h4 className="mb-3 text-sm font-semibold text-[#354B68]">Categorias cadastradas</h4>
            {categories.length === 0 ? <p className="py-6 text-center text-sm text-[#94A0AF]">Nenhuma categoria cadastrada.</p> : (
              <div className="space-y-2">
                {categories.map((category) => (
                  <div key={category.id} className={`rounded-2xl border p-3 ${selectedId === category.id ? "border-[#9AB2D0] bg-[#EDF4FC]" : "border-[#E9EEF4] bg-white/55"}`}>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setSelectedId(category.id); setError(""); }} className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-sm font-semibold text-[#354B68]">{category.name}</span>
                        <span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-medium ${typeStyles[category.type]}`}>{typeLabels[category.type]}</span>
                      </button>
                      <button onClick={() => editCategory(category)} title="Editar nome da categoria" className="rounded-lg border border-[#DCE5EF] bg-white/80 px-3 py-2 text-xs font-medium text-[#526B8B] hover:bg-white">✎ Editar nome</button>
                      <button onClick={() => removeCategory(category)} className="rounded-lg px-2 py-2 text-xs text-rose-500 hover:bg-rose-50">Excluir</button>
                    </div>
                    {category.subcategories.length > 0 ? (
                      <div className="ml-2 mt-3 space-y-1 border-l-2 border-[#DCE5EF] pl-3">
                        {category.subcategories.map((item) => (
                          <button key={item} onClick={() => setSelectedId(category.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-[#71839A] hover:bg-white/80">
                            <span className="text-[#A4B3C5]">↳</span>
                            <span>{item}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="ml-2 mt-2 text-[11px] text-[#A0ACBA]">Nenhuma subcategoria cadastrada</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/90 bg-white/65 p-5 shadow-sm backdrop-blur-2xl md:p-6">
          <h3 className="font-semibold text-[#26364D]">Subcategorias</h3>
          <p className="mt-1 text-xs text-[#94A0AF]">Selecione uma categoria para gerenciar suas subdivisões.</p>
          {!selected ? (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E7EEF7] text-2xl text-[#526F96]">⌁</div>
              <p className="mt-4 text-sm font-medium text-[#52627A]">Nenhuma categoria selecionada</p>
              <p className="mt-1 max-w-xs text-xs leading-5 text-[#94A0AF]">Escolha uma categoria na lista ao lado para adicionar ou remover subcategorias.</p>
            </div>
          ) : (
            <>
              <div className="mt-5 rounded-2xl bg-[#EDF4FC] p-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-[#7890AD]">Categoria selecionada</p>
                <p className="mt-1 font-semibold text-[#354B68]">{selected.name}</p>
              </div>
              <div className="mt-5 flex gap-2">
                <input value={subcategory} onChange={(event) => setSubcategory(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addSubcategory(); }} placeholder="Nova subcategoria" className="min-w-0 flex-1 rounded-xl border border-[#E2E8F0] bg-white/80 px-4 py-3 text-sm outline-none focus:border-[#7898BF]" />
                <button onClick={addSubcategory} className="rounded-xl bg-[#294263] px-4 py-3 text-sm font-medium text-white hover:bg-[#203653]">Adicionar</button>
              </div>
              {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
              <div className="mt-5 space-y-2">
                {selected.subcategories.length === 0 ? <p className="py-8 text-center text-sm text-[#94A0AF]">Ainda não há subcategorias.</p> : selected.subcategories.map((item) => (
                  <div key={item} className="flex items-center justify-between rounded-xl border border-[#E9EEF4] bg-white/55 px-4 py-3">
                    <span className="text-sm text-[#52627A]">{item}</span>
                    <button onClick={() => removeSubcategory(item)} className="text-xs text-rose-500 hover:text-rose-700">Remover</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
