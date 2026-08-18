"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";
import { deleteTemplate, saveDraft, sendForReview } from "@/lib/templates-store";
import type { TemplateCategory } from "@/generated/prisma/client";

export type FormState = { error: string } | { ok: "draft" | "sent" } | null;

/** Сколько подстановок читаем из формы. Столько же кнопок предлагает редактор. */
const MAX_VARIABLES = 10;

function text(data: FormData, field: string): string {
  const value = data.get(field);
  return typeof value === "string" ? value.trim() : "";
}

export async function createTemplateAction(_prev: FormState, data: FormData): Promise<FormState> {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    return { error: "Создавать шаблоны может владелец или администратор." };
  }

  const category = text(data, "category") as TemplateCategory;
  const examples = Array.from({ length: MAX_VARIABLES }, (_, index) =>
    text(data, `example${index + 1}`),
  );

  let created;
  try {
    created = await saveDraft(organization.id, {
      name: text(data, "name"),
      language: text(data, "language") || "ru",
      category: category || "UTILITY",
      headerText: text(data, "headerText"),
      bodyText: text(data, "bodyText"),
      footerText: text(data, "footerText"),
      examples,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Не удалось сохранить шаблон." };
  }

  revalidatePath("/templates");

  if (text(data, "intent") !== "review") {
    return { ok: "draft" };
  }

  // Отправку разделяем с сохранением намеренно: Meta может отказать в приёме
  // (номер не подключён, лимит шаблонов), и терять из-за этого набранный
  // текст нельзя — он уже лежит черновиком.
  try {
    await sendForReview(organization.id, created.id);
  } catch (error) {
    return {
      error: `Шаблон сохранён черновиком, но на проверку не ушёл: ${
        error instanceof Error ? error.message : "Meta не ответила"
      }`,
    };
  }

  revalidatePath("/templates");
  return { ok: "sent" };
}

export async function sendForReviewAction(data: FormData): Promise<void> {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    return;
  }

  try {
    await sendForReview(organization.id, text(data, "id"));
  } catch {
    // Ошибку показываем на странице через статус шаблона: он останется черновиком.
  }

  revalidatePath("/templates");
}

export async function deleteTemplateAction(data: FormData): Promise<void> {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    return;
  }

  await deleteTemplate(organization.id, text(data, "id"));
  revalidatePath("/templates");
}
