"use server";

import { revalidatePath } from "next/cache";
import { PERIODS, type Period } from "@/lib/billing";
import {
  cancelInvoice,
  createSubscriptionInvoice,
  createTopUpInvoice,
  markInvoicePaid,
  type InvoiceMethod,
} from "@/lib/billing-store";
import { requireUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";

export type BillingState = { error: string } | { ok: string } | null;

function text(data: FormData, field: string): string {
  const value = data.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function method(data: FormData): InvoiceMethod {
  return text(data, "method") === "bank" ? "bank" : "kaspi";
}

/** Деньгами кабинета распоряжается владелец или администратор, не оператор. */
async function requireManager() {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    return null;
  }
  return organization;
}

export async function topUpAction(_prev: BillingState, data: FormData): Promise<BillingState> {
  const organization = await requireManager();
  if (!organization) {
    return { error: "Пополнять баланс может владелец или администратор." };
  }

  const amount = Number(text(data, "amount"));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Укажите сумму пополнения в тенге." };
  }

  try {
    const invoice = await createTopUpInvoice({
      organizationId: organization.id,
      amount: Math.round(amount),
      method: method(data),
    });

    revalidatePath("/billing");
    return {
      ok: `Счёт №${invoice.number} выставлен. Баланс пополнится, когда деньги дойдут.`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Не удалось выставить счёт." };
  }
}

export async function subscribeAction(_prev: BillingState, data: FormData): Promise<BillingState> {
  const organization = await requireManager();
  if (!organization) {
    return { error: "Менять тариф может владелец или администратор." };
  }

  const months = Number(text(data, "months")) as Period;
  if (!PERIODS.includes(months)) {
    return { error: "Выберите период оплаты." };
  }

  try {
    const invoice = await createSubscriptionInvoice({
      organizationId: organization.id,
      planCode: text(data, "planCode"),
      months,
      operators: Number(text(data, "operators")) || 1,
      method: method(data),
    });

    revalidatePath("/billing");
    return {
      ok: `Счёт №${invoice.number} на ${invoice.description} выставлен. Тариф включится после оплаты.`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Не удалось выставить счёт." };
  }
}

export async function cancelInvoiceAction(data: FormData): Promise<void> {
  const organization = await requireManager();
  if (!organization) {
    return;
  }

  await cancelInvoice(organization.id, text(data, "invoiceId"));
  revalidatePath("/billing");
}

/**
 * Заглушка приёма оплаты. Пока Kaspi и банк не подключены, оплату
 * подтверждает человек — эта же функция вызовется из их вебхука.
 * В боевом кабинете кнопки нет: там платит клиент, а не оператор.
 */
export async function confirmPaymentAction(data: FormData): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const organization = await requireManager();
  if (!organization) {
    return;
  }

  await markInvoicePaid(organization.id, text(data, "invoiceId"));
  revalidatePath("/billing");
}
