"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseAmount, toKop } from "@/lib/money.ts";
import { parseAccount } from "@/lib/cash.ts";
import {
  addItem,
  closeList,
  createList,
  deleteItem,
  deleteList,
  getList,
  renameList,
  updateItem,
  type ShoppingItem,
} from "@/lib/shopping.ts";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const refresh = () => revalidatePath("/", "layout");

export async function createListAction(f: FormData) {
  // По одному товару в строке (запятая — часть числа: «0,5 кг»).
  const lines = str(f, "items").split(/\n|;/).map((s) => s.trim()).filter(Boolean);
  const id = createList(str(f, "title"), lines);
  refresh();
  redirect(`/shopping/${id}`);
}

/** Добавить товар из строки («Яйца 10 шт»). Возвращает список заново — клиент обновит экран. */
export async function addItemAction(listId: number, text: string): Promise<ShoppingItem[]> {
  for (const line of text.split(/\n|;/)) if (line.trim()) addItem(listId, line);
  refresh();
  return getList(listId)?.items ?? [];
}

export async function updateItemAction(
  id: number,
  d: { qty?: number | null; unit?: string; price?: string | null; bought?: boolean; name?: string },
): Promise<void> {
  updateItem(id, {
    ...d,
    price: d.price === undefined ? undefined : d.price ? toKop(parseAmount(d.price) ?? 0) : null,
  });
  refresh();
}

export async function deleteItemAction(id: number): Promise<void> {
  deleteItem(id);
  refresh();
}

export async function renameListAction(f: FormData) {
  const id = Number(f.get("id"));
  renameList(id, str(f, "title"), str(f, "store"));
  refresh();
  redirect(`/shopping/${id}`);
}

export async function deleteListAction(f: FormData) {
  deleteList(Number(f.get("id")));
  refresh();
  redirect("/shopping");
}

export async function closeListAction(f: FormData) {
  const id = Number(f.get("id"));
  const acc = parseAccount(str(f, "account"));
  const totalText = str(f, "total");
  const { txId, nextListId } = closeList(id, {
    total: totalText ? toKop(parseAmount(totalText) ?? 0) : null,
    centerId: Number(f.get("centerId")) || 0,
    categoryId: Number(f.get("categoryId")) || null,
    cardId: acc && "card" in acc ? acc.card : null,
    cashboxId: acc && "cashbox" in acc ? acc.cashbox : null,
    carryOver: f.get("carryOver") === "on",
  });
  refresh();
  redirect(nextListId ? `/shopping/${nextListId}?from=${id}` : `/shopping?closed=${txId}`);
}
