"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";
import {
  createTag,
  deleteTag,
  importContacts,
  parseContactsCsv,
  toggleTag,
  updateContact,
} from "@/lib/contacts";
import { setUnsubscribed } from "@/lib/unsubscribe";

export type FormState = { error: string } | { ok: string } | null;

function text(data: FormData, field: string): string {
  const value = data.get(field);
  return typeof value === "string" ? value.trim() : "";
}

export async function createTagAction(_prev: FormState, data: FormData): Promise<FormState> {
  const { organization } = await requireUser();

  try {
    await createTag(organization.id, text(data, "name"));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Не удалось создать метку." };
  }

  revalidatePath("/contacts");
  return { ok: "Метка добавлена." };
}

/** Вариант без состояния — для формы, где ошибку показывать негде. */
export async function addTagAction(data: FormData): Promise<void> {
  const { organization } = await requireUser();
  const name = text(data, "name");
  if (!name) {
    return;
  }

  await createTag(organization.id, name);
  revalidatePath("/contacts");
}

export async function deleteTagAction(data: FormData): Promise<void> {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    return;
  }

  await deleteTag(organization.id, text(data, "tagId"));
  revalidatePath("/contacts");
}

export async function toggleTagAction(data: FormData): Promise<void> {
  const { organization } = await requireUser();
  await toggleTag(organization.id, text(data, "contactId"), text(data, "tagId"));
  revalidatePath("/contacts");
}

/**
 * Отписать контакт или вернуть его в рассылки. Возврат — по просьбе клиента:
 * сам он снять отписку не может, для этого и нужен оператор.
 */
export async function toggleUnsubscribeAction(data: FormData): Promise<void> {
  const { organization } = await requireUser();

  await setUnsubscribed({
    organizationId: organization.id,
    contactId: text(data, "contactId"),
    unsubscribed: data.get("unsubscribed") === "on",
    source: "оператор",
  });

  revalidatePath("/contacts");
}

export async function saveContactAction(data: FormData): Promise<void> {
  const { organization } = await requireUser();
  await updateContact(organization.id, text(data, "contactId"), {
    name: text(data, "name"),
    note: text(data, "note"),
  });
  revalidatePath("/contacts");
}

export async function importAction(_prev: FormState, data: FormData): Promise<FormState> {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    return { error: "Импортировать контакты может владелец или администратор." };
  }

  const raw = text(data, "csv");
  if (!raw) {
    return { error: "Вставьте список номеров." };
  }

  const { rows, skipped } = parseContactsCsv(raw);
  if (rows.length === 0) {
    return { error: "Не нашёл ни одного номера. Первым в строке должен идти телефон." };
  }

  const { created, updated } = await importContacts(organization.id, rows);
  revalidatePath("/contacts");

  const parts = [`добавлено ${created}`];
  if (updated > 0) {
    parts.push(`дополнено имён ${updated}`);
  }
  if (skipped > 0) {
    parts.push(`пропущено строк ${skipped}`);
  }

  return { ok: `Импорт завершён: ${parts.join(", ")}.` };
}
