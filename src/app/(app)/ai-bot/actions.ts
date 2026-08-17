"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";
import { getBot, resetUsage, saveBot } from "@/lib/ai-bot-store";
import { askBot } from "@/lib/ai-client";

export type FormState = { error: string } | { ok: string } | null;
export type TestState = { error: string } | { answer: string; handoff: string | null } | null;

function text(data: FormData, field: string): string {
  const value = data.get(field);
  return typeof value === "string" ? value.trim() : "";
}

export async function saveBotAction(_prev: FormState, data: FormData): Promise<FormState> {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    return { error: "Настраивать помощника может владелец или администратор." };
  }

  const profile = text(data, "companyProfile");
  if (!profile) {
    return { error: "Заполните анкету — без неё помощнику нечего отвечать." };
  }

  const limit = Number(text(data, "answersLimit"));

  await saveBot(organization.id, {
    enabled: data.get("enabled") === "on",
    model: text(data, "model") || "claude-opus-5",
    companyProfile: profile,
    rules: text(data, "rules"),
    answersLimit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 100,
  });

  revalidatePath("/ai-bot");
  return { ok: "Настройки сохранены." };
}

export async function resetUsageAction(): Promise<void> {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    return;
  }

  await resetUsage(organization.id);
  revalidatePath("/ai-bot");
}

/**
 * Тест-чат: прогоняет вопрос через помощника, ничего не отправляя клиенту
 * и не списывая из пакета. Нужен, чтобы проверить анкету до включения.
 */
export async function testBotAction(_prev: TestState, data: FormData): Promise<TestState> {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    return { error: "Доступно владельцу или администратору." };
  }

  const question = text(data, "question");
  if (!question) {
    return { error: "Напишите вопрос, который задал бы клиент." };
  }

  const settings = await getBot(organization.id);
  if (!settings.companyProfile.trim()) {
    return { error: "Сначала заполните анкету и сохраните её." };
  }

  try {
    const result = await askBot({
      model: settings.model,
      companyProfile: settings.companyProfile,
      rules: settings.rules,
      history: [{ role: "user", text: question }],
    });

    return {
      answer: result.answer ?? "(помощник решил ничего не отвечать)",
      handoff: result.handoff ? (result.handoffReason ?? "без пояснения") : null,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Не удалось получить ответ." };
  }
}
