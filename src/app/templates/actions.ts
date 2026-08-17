"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";
import { deleteTemplate, saveDraft, sendForReview } from "@/lib/templates-store";
import type { TemplateCategory } from "@/generated/prisma/client";

export type FormState = { error: string } | { ok: true } | null;

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

  try {
    await saveDraft(organization.id, {
      name: text(data, "name"),
      language: text(data, "language") || "ru",
      category: category || "UTILITY",
      headerText: text(data, "headerText"),
      bodyText: text(data, "bodyText"),
      footerText: text(data, "footerText"),
      examples: [text(data, "example1"), text(data, "example2"), text(data, "example3")],
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Не удалось сохранить шаблон." };
  }

  revalidatePath("/templates");
  return { ok: true };
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
