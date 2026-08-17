import { prisma } from "@/lib/db";
import { toMetaPayload, validateTemplate, type TemplateDraft } from "@/lib/templates";
import { submitTemplate } from "@/lib/whatsapp/client";
import type { TemplateStatus } from "@/generated/prisma/client";
import type { TemplateUpdate } from "@/lib/whatsapp/parse";

export async function listTemplates(organizationId: string) {
  return prisma.messageTemplate.findMany({
    where: { organizationId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

export type StoredTemplate = Awaited<ReturnType<typeof listTemplates>>[number];

/** Сохраняет черновик. На модерацию он уходит отдельным действием. */
export async function saveDraft(organizationId: string, draft: TemplateDraft) {
  const errors = validateTemplate(draft);
  if (errors.length > 0) {
    throw new Error(errors[0]);
  }

  const existing = await prisma.messageTemplate.findFirst({
    where: { organizationId, name: draft.name.trim(), language: draft.language },
  });
  if (existing) {
    throw new Error("Шаблон с таким названием и языком уже есть.");
  }

  return prisma.messageTemplate.create({
    data: {
      organizationId,
      name: draft.name.trim(),
      language: draft.language,
      category: draft.category,
      headerText: draft.headerText?.trim() || null,
      bodyText: draft.bodyText.trim(),
      footerText: draft.footerText?.trim() || null,
      examples: draft.examples.filter((value) => value.trim() !== ""),
    },
  });
}

export async function deleteTemplate(organizationId: string, id: string): Promise<void> {
  // Одобренный шаблон удаляем только у себя: в Meta он живёт своей жизнью.
  await prisma.messageTemplate.deleteMany({ where: { id, organizationId } });
}

/**
 * Отправляет шаблон на модерацию. Meta отвечает статусом сразу, а окончательное
 * решение приходит вебхуком — иногда через минуты, иногда через сутки.
 */
export async function sendForReview(organizationId: string, id: string) {
  const template = await prisma.messageTemplate.findFirst({ where: { id, organizationId } });
  if (!template) {
    throw new Error("Шаблон не найден.");
  }
  if (template.status !== "DRAFT" && template.status !== "REJECTED") {
    throw new Error("На модерацию можно отправить только черновик или отклонённый шаблон.");
  }

  const number = await prisma.whatsappNumber.findFirst({ where: { organizationId } });
  if (!number?.wabaId) {
    throw new Error(
      "Сначала подключите номер WhatsApp — шаблоны создаются в аккаунте компании в Meta.",
    );
  }

  const payload = toMetaPayload({
    name: template.name,
    language: template.language,
    category: template.category,
    headerText: template.headerText,
    bodyText: template.bodyText,
    footerText: template.footerText,
    examples: template.examples,
  });

  const { metaId, status } = await submitTemplate(number.wabaId, payload);

  return prisma.messageTemplate.update({
    where: { id: template.id },
    data: {
      metaId,
      status: normalizeStatus(status),
      rejectedReason: null,
      submittedAt: new Date(),
    },
  });
}

const KNOWN: TemplateStatus[] = ["PENDING", "APPROVED", "REJECTED", "PAUSED", "DISABLED"];

function normalizeStatus(value: string): TemplateStatus {
  const upper = value.toUpperCase() as TemplateStatus;
  return KNOWN.includes(upper) ? upper : "PENDING";
}

/**
 * Применяет решение модерации из вебхука. Ищем по metaId, а если его ещё нет —
 * по имени и языку: Meta иногда присылает решение раньше, чем мы записали ответ.
 */
export async function applyTemplateUpdate(update: TemplateUpdate): Promise<void> {
  const status = normalizeStatus(update.event);

  const updated = await prisma.messageTemplate.updateMany({
    where: { metaId: update.metaId },
    data: { status, rejectedReason: update.reason },
  });

  if (updated.count === 0 && update.name) {
    await prisma.messageTemplate.updateMany({
      where: { name: update.name, language: update.language },
      data: { status, rejectedReason: update.reason, metaId: update.metaId || undefined },
    });
  }
}
