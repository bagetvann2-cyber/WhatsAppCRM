"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";
import { MAX_PROFILE_CHARS, MAX_STUB_CHARS, TEST_CHAT_LIMIT } from "@/lib/ai-bot";
import { finishUsage, getBot, reserveTestUsage, saveBot } from "@/lib/ai-bot-store";
import { askBot } from "@/lib/ai-client";
import { getOrderFields, saveOrderFields } from "@/lib/orders-store";
import { findPlaceholders, findPreset } from "@/lib/profile-presets";

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

  const rules = text(data, "rules");
  // От размера анкеты зависит цена каждого ответа: без потолка один клиент делает бота дорогим.
  if (profile.length + rules.length > MAX_PROFILE_CHARS) {
    return { error: `Анкета вместе с правилами не длиннее ${MAX_PROFILE_CHARS} символов.` };
  }
  const stubText = text(data, "stubText");
  const stubTextKz = text(data, "stubTextKz");
  if (stubText.length > MAX_STUB_CHARS || stubTextKz.length > MAX_STUB_CHARS) {
    return { error: `Текст для клиента не длиннее ${MAX_STUB_CHARS} символов.` };
  }

  // Иначе бот честно напишет клиенту «доставка стоит [уточните: цена доставки]».
  const enabled = data.get("enabled") === "on";
  const unfilled = findPlaceholders(profile, rules).length;
  if (enabled && unfilled > 0) {
    return { error: `Помощник сейчас отвечает клиентам — сначала заполните места «[уточните: …]»: ${unfilled}.` };
  }

  await saveBot(organization.id, {
    enabled,
    model: text(data, "model") || "claude-sonnet-5",
    companyProfile: profile,
    rules,
    stubText,
    stubTextKz,
  });

  // Поля заказа из готовой анкеты: только если у организации своих ещё нет, чужие не затираем.
  const preset = data.get("applyOrderFields") === "on" ? findPreset(text(data, "presetId")) : undefined;
  if (preset && (await getOrderFields(organization.id)).length === 0) {
    await saveOrderFields(organization.id, preset.orderFields);
  }

  revalidatePath("/ai-bot");
  revalidatePath("/orders");
  return {
    ok: unfilled > 0 ? `Сохранено. Помощник не включён: осталось заполнить мест — ${unfilled}.` : "Настройки сохранены.",
  };
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

  if (question.length > 1500) {
    return { error: "Вопрос слишком длинный: до 1500 символов." };
  }

  // Тест-чат идёт на нашем ключе и тратит наши деньги: до начала пробного периода лимит
  // общий на весь кабинет, потом суточный.
  const usageId = await reserveTestUsage(
    organization.id,
    TEST_CHAT_LIMIT,
    settings.trialNotStarted,
    settings.provider,
    settings.model,
  );
  if (!usageId) {
    return {
      error: settings.trialNotStarted
        ? "Проверки на нашем ключе закончились. Подключите канал — и они снова появятся каждый день."
        : "На сегодня проверки закончились. Завтра будет новый лимит.",
    };
  }

  try {
    const result = await askBot({
      provider: settings.provider,
      model: settings.model,
      companyProfile: settings.companyProfile,
      rules: settings.rules,
      history: [{ role: "user", text: question }],
      org: organization.id,
    });
    await finishUsage(usageId, { inputTokens: result.inputTokens + result.cachedTokens, outputTokens: result.outputTokens });

    return {
      answer: result.answer ?? "(помощник решил ничего не отвечать)",
      handoff: result.handoff ? (result.handoffReason ?? "без пояснения") : null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось получить ответ.";
    await finishUsage(usageId, { error: message });
    return { error: message };
  }
}
