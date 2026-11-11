"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseAmount, toKop } from "@/lib/money.ts";
import { parseAccount } from "@/lib/cash.ts";
import { readReceipt } from "@/lib/ai.ts";
import {
  addItem,
  applyReceipt,
  closeList,
  closeListPlain,
  reopenList,
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

/** Новый пустой список одним нажатием. */
export async function quickListAction() {
  const id = createList("");
  refresh();
  redirect(`/shopping/${id}?new=1`);
}

export async function closePlainAction(f: FormData) {
  const id = Number(f.get("id"));
  const next = closeListPlain(id, f.get("carryOver") === "on");
  refresh();
  redirect(next ? `/shopping/${next}?from=${id}` : "/shopping?done=1");
}

export async function reopenListAction(f: FormData) {
  const id = Number(f.get("id"));
  reopenList(id);
  refresh();
  redirect(`/shopping/${id}`);
}

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
    mergeTxId: Number(f.get("merge")) || null,
  });
  refresh();
  redirect(nextListId ? `/shopping/${nextListId}?from=${id}` : `/shopping?closed=${txId}`);
}

/** Прочитать фото чека и разложить в список (существующий или новый). */
export async function scanReceiptAction(f: FormData): Promise<{ listId?: number; error?: string }> {
  const file = f.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Выберите фото чека" };
  if (file.size > 7 * 1024 * 1024) return { error: "Фото слишком большое — попробуйте ещё раз" };
  const type = (["image/jpeg", "image/png", "image/webp", "image/gif"] as const).find((t) => t === file.type) ?? "image/jpeg";
  try {
    const data = await readReceipt(Buffer.from(await file.arrayBuffer()).toString("base64"), type);
    const listId = applyReceipt(data, Number(f.get("listId")) || null);
    refresh();
    return { listId };
  } catch (e) {
    console.error("Receipt scan failed:", e);
    return { error: e instanceof Error && /[а-яё]/i.test(e.message) ? e.message : "Не получилось прочитать чек. Попробуйте ещё раз или введите вручную." };
  }
}
