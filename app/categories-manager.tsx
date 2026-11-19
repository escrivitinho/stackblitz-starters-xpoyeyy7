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
  const [subcategoryDrafts, setSubcategoryDrafts] = useState<Record<string, string>>({});
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [editingSubcategory, setEditingSubcategory] = useState<{ categoryId: string; originalName: string } | null>(null);
  const [editingSubcategoryName, setEditingSubcategoryName] = useState("");
  const [error, setError] = useState("");

  function resetForm() {
    setName("");
    setError("");
  }

  function selectTab(nextType: CategoryType) {
    setType(nextType);
    setError("");
    setEditingCategoryId(null);
    setEditingSubcategory(null);
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
        category.name.toLocaleLowerCase("pt-BR") === cleanName.toLocaleLowerCase("pt-BR")
    );
    if (duplicate) {
      setError("Já existe uma categoria com esse nome para este tipo.");
      return;
    }

    const created: Category = {
      id: `category-${Date.now()}`,
      name: cleanName,
      type,
      subcategories: [],
    };
    onChange([created, ...categories]);
    resetForm();
  }

  function startEditingCategory(category: Category) {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
    setError("");
  }

  function saveCategoryName(category: Category) {
    const cleanName = editingCategoryName.trim();
    if (!cleanName) {
      setError("O nome da categoria não pode ficar vazio.");
      return;
    }
    const duplicate = categories.some(
      (item) =>
        item.id !== category.id &&
        item.type === category.type &&
        item.name.toLocaleLowerCase("pt-BR") === cleanName.toLocaleLowerCase("pt-BR")
    );
    if (duplicate) {
      setError("Já existe uma categoria com esse nome para este tipo.");
      return;
    }
    onChange(categories.map((item) => item.id === category.id ? { ...item, name: cleanName } : item));
    setEditingCategoryId(null);
    setEditingCategoryName("");
    setError("");
  }

  function removeCategory(category: Category) {
    if (!confirm(`Excluir a categoria "${category.name}" e suas subcategorias?`)) return;
    onChange(categories.filter((item) => item.id !== category.id));
    if (editingCategoryId === category.id) setEditingCategoryId(null);
  }

  function addSubcategory(categoryId: string) {
    const clean = (subcategoryDrafts[categoryId] ?? "").trim();
    const category = categories.find((item) => item.id === categoryId);
    if (!category || !clean) return;
    if (category.subcategories.some((item) => item.toLocaleLowerCase("pt-BR") === clean.toLocaleLowerCase("pt-BR"))) {
      setError("Essa subcategoria já existe nesta categoria.");
      return;
    }
    onChange(categories.map((item) =>
      item.id === categoryId
        ? { ...item, subcategories: [...item.subcategories, clean] }
        : item
    ));
    setSubcategoryDrafts((drafts) => ({ ...drafts, [categoryId]: "" }));
    setError("");
  }

  function startEditingSubcategory(categoryId: string, value: string) {
    setEditingSubcategory({ categoryId, originalName: value });
    setEditingSubcategoryName(value);
    setError("");
  }

  function saveSubcategoryName() {
    if (!editingSubcategory) return;
    const clean = editingSubcategoryName.trim();
    if (!clean) {
      setError("O nome da subcategoria não pode ficar vazio.");
      return;
    }
    const category = categories.find((item) => item.id === editingSubcategory.categoryId);
    if (!category) return;
    const duplicate = category.subcategories.some(
      (item) =>
        item !== editingSubcategory.originalName &&
        item.toLocaleLowerCase("pt-BR") === clean.toLocaleLowerCase("pt-BR")
    );
    if (duplicate) {
      setError("Essa subcategoria já existe nesta categoria.");
      return;
    }
    onChange(categories.map((item) =>
      item.id === category.id
        ? {
            ...item,
            subcategories: item.subcategories.map((sub) =>
              sub === editingSubcategory.originalName ? clean : sub
            ),
          }
        : item
    ));
    setEditingSubcategory(null);
    setEditingSubcategoryName("");
    setError("");
  }

  function removeSubcategory(categoryId: string, value: string) {
    onChange(categories.map((category) =>
      category.id === categoryId
        ? { ...category, subcategories: category.subcategories.filter((item) => item !== value) }
        : category
    ));
    if (editingSubcategory?.categoryId === categoryId && editingSubcategory.originalName === value) {
      setEditingSubcategory(null);
    }
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

      <div className="flex flex-wrap gap-2 rounded-2xl border border-[#E2E8F0] bg-white/65 p-2" role="tablist" aria-label="Tipos de categorias">
        {(["income", "expense", "transfer"] as CategoryType[]).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={type === item}
            onClick={() => selectTab(item)}
            className={`rounded-xl px-5 py-3 text-sm font-medium transition ${type === item ? "bg-[#294263] text-white shadow-sm" : "text-[#526B8B] hover:bg-white"}`}
          >
            {item === "income" ? "Receitas" : item === "expense" ? "Despesas" : "Transferências"}
            <span className={`ml-2 text-xs ${type === item ? "text-white/75" : "text-[#94A0AF]"}`}>
              {categories.filter((category) => category.type === item).length}
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6">
        <section className="rounded-3xl border border-white/90 bg-white/65 p-5 shadow-sm backdrop-blur-2xl md:p-6">
          <div className="mb-5">
            <h3 className="font-semibold text-[#26364D]">Nova categoria</h3>
            <p className="mt-1 text-xs text-[#94A0AF]">Adicione uma categoria de {typeLabels[type].toLowerCase()}.</p>
          </div>
          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-xs font-medium text-[#64748B]">Nome da categoria</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Alimentação" className="w-full rounded-xl border border-[#E2E8F0] bg-white/80 px-4 py-3 text-sm outline-none focus:border-[#7898BF]" />
            </label>
            {error && !editingCategoryId && !editingSubcategory && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
            <div className="flex justify-end">
              <button onClick={saveCategory} className="rounded-xl bg-[#294263] px-5 py-3 text-sm font-medium text-white hover:bg-[#203653]">Adicionar categoria</button>
            </div>
          </div>

          <div className="mt-7 border-t border-[#E9EEF4] pt-5">
            <h4 className="mb-3 text-sm font-semibold text-[#354B68]">Categorias de {typeLabels[type].toLowerCase()} cadastradas</h4>
            {categories.filter((category) => category.type === type).length === 0 ? <p className="py-6 text-center text-sm text-[#94A0AF]">Nenhuma categoria cadastrada nesta aba.</p> : (
              <div className="space-y-2">
                {categories.filter((category) => category.type === type).map((category) => (
                  <div key={category.id} className="rounded-2xl border border-[#E9EEF4] bg-white/55 p-3">
                    <div className="flex items-center gap-2">
                      {editingCategoryId === category.id ? (
                        <div className="min-w-0 flex-1 space-y-2">
                          <input
                            autoFocus
                            value={editingCategoryName}
                            onChange={(event) => { setEditingCategoryName(event.target.value); setError(""); }}
                            onKeyDown={(event) => { if (event.key === "Enter") saveCategoryName(category); if (event.key === "Escape") setEditingCategoryId(null); }}
                            className="w-full rounded-lg border border-[#B8C9DC] bg-white px-3 py-2 text-sm text-[#354B68] outline-none focus:border-[#7898BF]"
                          />
                          {error && <p className="text-xs text-rose-600">{error}</p>}
                          <div className="flex gap-2">
                            <button onClick={() => saveCategoryName(category)} className="rounded-lg bg-[#294263] px-3 py-1.5 text-xs font-medium text-white">Salvar</button>
                            <button onClick={() => { setEditingCategoryId(null); setError(""); }} className="rounded-lg border border-[#DCE5EF] bg-white px-3 py-1.5 text-xs text-[#64748B]">Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setError("")} className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-sm font-semibold text-[#354B68]">{category.name}</span>
                          <span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-medium ${typeStyles[category.type]}`}>{typeLabels[category.type]}</span>
                        </button>
                      )}
                      {editingCategoryId !== category.id && (
                        <>
                          <button onClick={() => startEditingCategory(category)} title="Editar nome da categoria" className="rounded-lg border border-[#DCE5EF] bg-white/80 px-3 py-2 text-xs font-medium text-[#526B8B] hover:bg-white">✎ Editar</button>
                          <button onClick={() => removeCategory(category)} className="rounded-lg px-2 py-2 text-xs text-rose-500 hover:bg-rose-50">Excluir</button>
                        </>
                      )}
                    </div>
                    <div className="ml-2 mt-3 space-y-2 border-l-2 border-[#DCE5EF] pl-3">
                      {category.subcategories.length > 0 ? category.subcategories.map((item) => (
                        <div key={item} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                          <span className="text-xs text-[#A4B3C5]">↳</span>
                          {editingSubcategory?.categoryId === category.id && editingSubcategory.originalName === item ? (
                            <div className="min-w-0 flex-1 space-y-2">
                              <input
                                autoFocus
                                value={editingSubcategoryName}
                                onChange={(event) => { setEditingSubcategoryName(event.target.value); setError(""); }}
                                onKeyDown={(event) => { if (event.key === "Enter") saveSubcategoryName(); if (event.key === "Escape") { setEditingSubcategory(null); setError(""); } }}
                                className="w-full rounded-lg border border-[#B8C9DC] bg-white px-3 py-2 text-sm text-[#52627A] outline-none focus:border-[#7898BF]"
                              />
                              {error && <p className="text-xs text-rose-600">{error}</p>}
                              <div className="flex gap-2">
                                <button onClick={saveSubcategoryName} className="rounded-lg bg-[#294263] px-3 py-1.5 text-xs font-medium text-white">Salvar</button>
                                <button onClick={() => { setEditingSubcategory(null); setError(""); }} className="rounded-lg border border-[#DCE5EF] bg-white px-3 py-1.5 text-xs text-[#64748B]">Cancelar</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <span className="min-w-0 flex-1 text-sm text-[#52627A]">{item}</span>
                              <button onClick={() => startEditingSubcategory(category.id, item)} className="rounded-lg border border-[#DCE5EF] bg-white/80 px-3 py-1.5 text-xs font-medium text-[#526B8B] hover:bg-white">✎ Editar</button>
                              <button onClick={() => removeSubcategory(category.id, item)} className="rounded-lg px-2 py-1.5 text-xs text-rose-500 hover:bg-rose-50">Excluir</button>
                            </>
                          )}
                        </div>
                      )) : (
                        <p className="px-2 py-1 text-[11px] text-[#A0ACBA]">Nenhuma subcategoria cadastrada</p>
                      )}
                      <div className="flex gap-2 px-2 pt-1">
                        <input
                          value={subcategoryDrafts[category.id] ?? ""}
                          onChange={(event) => { setSubcategoryDrafts((drafts) => ({ ...drafts, [category.id]: event.target.value })); setError(""); }}
                          onKeyDown={(event) => { if (event.key === "Enter") addSubcategory(category.id); }}
                          placeholder="Nova subcategoria"
                          className="min-w-0 flex-1 rounded-lg border border-[#E2E8F0] bg-white/80 px-3 py-2 text-xs outline-none focus:border-[#7898BF]"
                        />
                        <button onClick={() => addSubcategory(category.id)} className="rounded-lg bg-[#294263] px-3 py-2 text-xs font-medium text-white hover:bg-[#203653]">Adicionar</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
