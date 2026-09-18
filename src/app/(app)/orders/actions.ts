"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";
import { getOrderFields, saveOrderFields, setOrderStatus, updateOrderField } from "@/lib/orders-store";
import type { OrderFieldType } from "@/lib/orders";

export type FormState = { error: string } | { ok: string } | null;

function text(data: FormData, field: string): string {
  const value = data.get(field);
  return typeof value === "string" ? value.trim() : "";
}

export async function saveOrderFieldsAction(_prev: FormState, data: FormData): Promise<FormState> {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    return { error: "Настраивать поля заказа может владелец или администратор." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text(data, "fields") || "[]");
  } catch {
    return { error: "Не удалось сохранить поля." };
  }

  if (!Array.isArray(parsed)) {
    return { error: "Не удалось сохранить поля." };
  }

  const fields = parsed
    .map((raw) => {
      const row = raw as Record<string, unknown>;
      const label = typeof row.label === "string" ? row.label.trim() : "";
      const type = typeof row.type === "string" ? (row.type as OrderFieldType) : "TEXT";
      const options = Array.isArray(row.options)
        ? row.options.map(String).map((o) => o.trim()).filter(Boolean)
        : null;

      return {
        id: typeof row.id === "string" && row.id ? row.id : undefined,
        label,
        type,
        options: type === "SELECT" ? options : null,
        required: Boolean(row.required),
      };
    })
    .filter((field) => field.label);

  await saveOrderFields(organization.id, fields);
  revalidatePath("/orders");
  return { ok: "Поля сохранены." };
}

export async function saveOrderAction(_prev: FormState, data: FormData): Promise<FormState> {
  const { organization } = await requireUser();

  const orderId = text(data, "orderId");
  const intent = text(data, "intent");
  if (!orderId) {
    return { error: "Заказ не найден." };
  }

  if (intent === "cancel") {
    await setOrderStatus(organization.id, orderId, "CANCELLED");
    revalidatePath("/orders");
    return { ok: "Заказ отменён." };
  }

  const fieldDefs = await getOrderFields(organization.id);
  for (const field of fieldDefs) {
    const value = data.get(`field_${field.id}`);
    if (typeof value === "string") {
      await updateOrderField(organization.id, orderId, field.id, value);
    }
  }

  if (intent === "confirm") {
    await setOrderStatus(organization.id, orderId, "CONFIRMED");
  }

  revalidatePath("/orders");
  return { ok: intent === "confirm" ? "Заказ подтверждён." : "Сохранено." };
}
