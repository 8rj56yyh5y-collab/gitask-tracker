"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toKop, parseAmount } from "@/lib/money.ts";
import {
  archiveCard,
  archiveCenter,
  assignTx,
  createCard,
  createCenter,
  deleteTx,
  insertTx,
  updateCardLimit,
} from "@/lib/repo.ts";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => {
  const v = Number(str(f, k));
  return str(f, k) && Number.isFinite(v) ? v : null;
};

function refresh() {
  for (const p of ["/", "/inbox", "/cards", "/centers", "/history"]) revalidatePath(p);
}

export async function addTransaction(f: FormData) {
  const amount = parseAmount(str(f, "amount"));
  if (!amount) throw new Error("Укажите сумму");
  const direction = str(f, "direction") === "in" ? 1 : -1;
  const date = str(f, "date");
  insertTx({
    amountKop: direction * toKop(amount),
    occurredAt: date ? new Date(date).toISOString() : undefined,
    cardId: num(f, "cardId"),
    costCenterId: num(f, "centerId"),
    forWhom: str(f, "forWhom"),
    counterparty: str(f, "counterparty"),
    description: str(f, "description"),
    source: "manual",
  });
  refresh();
  redirect(str(f, "next") || "/");
}

export async function assignTransaction(f: FormData) {
  const id = num(f, "id");
  const centerId = num(f, "centerId");
  if (!id || !centerId) throw new Error("Выберите подразделение");
  assignTx(id, centerId, str(f, "forWhom"), str(f, "description"));
  refresh();
  const next = str(f, "next");
  if (next) redirect(next);
}

export async function removeTransaction(f: FormData) {
  const id = num(f, "id");
  if (id) deleteTx(id);
  refresh();
}

export async function addCard(f: FormData) {
  const last4 = str(f, "last4").replace(/\D/g, "").slice(-4);
  if (last4.length !== 4) throw new Error("Нужны последние 4 цифры карты");
  createCard({
    bank: str(f, "bank") || "Банк",
    last4,
    owner: str(f, "owner"),
    kind: str(f, "kind") || "personal",
    monthly_limit: toKop(parseAmount(str(f, "limit")) ?? 0),
    mono_account_id: str(f, "monoAccount") || null,
  });
  refresh();
}

export async function setCardLimit(f: FormData) {
  const id = num(f, "id");
  if (id) updateCardLimit(id, toKop(parseAmount(str(f, "limit")) ?? 0));
  refresh();
}

export async function removeCard(f: FormData) {
  const id = num(f, "id");
  if (id) archiveCard(id);
  refresh();
}

export async function addCenter(f: FormData) {
  const name = str(f, "name");
  if (!name) throw new Error("Укажите название");
  createCenter(name, num(f, "parentId"), str(f, "color") || "#6b7280", toKop(parseAmount(str(f, "budget")) ?? 0), f.get("internal") === "on");
  refresh();
}

export async function removeCenter(f: FormData) {
  const id = num(f, "id");
  if (id) archiveCenter(id);
  refresh();
}
