"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";
import { MAX_PROFILE_CHARS, MAX_STUB_CHARS, TEST_CHAT_LIMIT } from "@/lib/ai-bot";
import {
  BadGeneratorAnswer,
  GENERATOR_LIMIT,
  MAX_DESCRIPTION_CHARS,
  MIN_DESCRIPTION_CHARS,
  generateProfile,
  sanitizeOrderFields,
  type GeneratedProfile,
} from "@/lib/profile-generator";
import { LlmError } from "@/lib/llm";
import { PROVIDER_INFO, defaultModel } from "@/lib/llm/catalog";
import { env } from "@/lib/env";
import { PROVIDERS, type ProviderId } from "@/lib/llm/types";
import { mismatchMessage, normalizeKey, probeKey } from "@/lib/llm/verify-key";
import { prisma } from "@/lib/db";
import { countUsage, finishUsage, getBot, loadOwnKey, removeOwnKey, reserveTestUsage, saveBot, saveOwnKey, setKeyError } from "@/lib/ai-bot-store";
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
  if (data.get("applyOrderFields") === "on" && (await getOrderFields(organization.id)).length === 0) {
    // Поля берём у готовой анкеты или из того, что собрал генератор; присланное браузером чистим.
    let proposed = findPreset(text(data, "presetId"))?.orderFields;
    if (!proposed) {
      try {
        proposed = sanitizeOrderFields(JSON.parse(text(data, "generatedFields") || "[]"));
      } catch {
        proposed = [];
      }
    }
    if (proposed.length > 0) {
      await saveOrderFields(organization.id, proposed);
    }
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

  // На ключе клиента проверки бесплатны для нас и без лимита. На нашем ключе они тратят наши
  // деньги: до начала пробного периода лимит общий на весь кабинет, потом суточный.
  const own = settings.usesOwnKey ? await loadOwnKey(organization.id) : null;
  if (own && "error" in own) {
    return { error: "Нужно заново ввести ваш API-ключ." };
  }
  const usageId = own
    ? null
    : await reserveTestUsage(organization.id, TEST_CHAT_LIMIT, settings.trialNotStarted, settings.provider, settings.model);
  if (!own && !usageId) {
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
      apiKey: own?.apiKey,
    });
    if (usageId) {
      await finishUsage(usageId, { inputTokens: result.inputTokens + result.cachedTokens, outputTokens: result.outputTokens });
    }

    return {
      answer: result.answer ?? "(помощник решил ничего не отвечать)",
      handoff: result.handoff ? (result.handoffReason ?? "без пояснения") : null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось получить ответ.";
    if (usageId) {
      await finishUsage(usageId, { error: message });
    }
    return { error: message };
  }
}

export type GenerateState = { error: string } | ({ left: number } & GeneratedProfile);

/**
 * Собирает анкету из описания владельца на нашем ключе. Ничего не сохраняет: результат
 * заполняет поля формы, владелец правит и жмёт «Сохранить».
 */
export async function generateProfileAction(description: string): Promise<GenerateState> {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    return { error: "Доступно владельцу или администратору." };
  }

  const text = description.trim();
  if (text.length < MIN_DESCRIPTION_CHARS) {
    return { error: `Опишите бизнес подробнее: хотя бы ${MIN_DESCRIPTION_CHARS} символов.` };
  }
  if (text.length > MAX_DESCRIPTION_CHARS) {
    return { error: `Описание не длиннее ${MAX_DESCRIPTION_CHARS} символов.` };
  }

  const settings = await getBot(organization.id);
  if (!settings.subscriptionActive) {
    return { error: "Подписка не оплачена: генератор недоступен." };
  }

  // Запись до вызова: упавший провайдер иначе можно дёргать в обход лимита.
  const usageId = await reserveTestUsage(organization.id, GENERATOR_LIMIT, settings.trialNotStarted, "ANTHROPIC", defaultModel("ANTHROPIC")!, "GENERATOR");
  if (!usageId) {
    return {
      error: settings.trialNotStarted
        ? "Сборки анкеты на нашем ключе закончились. Подключите канал — и они снова появятся каждый день."
        : "На сегодня сборки закончились. Завтра будет новый лимит.",
    };
  }

  try {
    const { profile, inputTokens, outputTokens } = await generateProfile(text, organization.id);
    await finishUsage(usageId, { inputTokens, outputTokens });
    const used = await countUsage(organization.id, "GENERATOR", settings.trialNotStarted);
    return { ...profile, left: Math.max(0, GENERATOR_LIMIT - used) };
  } catch (error) {
    const message = error instanceof BadGeneratorAnswer || error instanceof LlmError ? error.message : "Не удалось собрать анкету.";
    await finishUsage(usageId, { error: message });
    return { error: message };
  }
}

export type KeyState = { error: string } | { ok: string } | { mismatch: string } | null;

/** Модель на своём ключе: любой id, но без пробелов и разумной длины. */
const MODEL_ID = /^[\w./:@-]{1,100}$/;

/**
 * Сохраняет ключ клиента вместе с провайдером и моделью. Сначала один пробный вызов:
 * неверный ключ, модель без инструментов или мёртвый провайдер не сохраняются. Сам ключ
 * в ответ не возвращается, поле формы после сохранения очищается.
 */
export async function saveApiKeyAction(_prev: KeyState, data: FormData): Promise<KeyState> {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    return { error: "Подключать ключ может владелец или администратор." };
  }

  const provider = text(data, "provider") as ProviderId;
  if (!PROVIDERS.includes(provider)) {
    return { error: "Выберите нейросеть." };
  }
  const apiKey = normalizeKey(text(data, "apiKey"));
  if (!apiKey) {
    return { error: "Вставьте API-ключ." };
  }

  // Ключ от другой нейросети: спрашиваем, а не отказываем, префиксы бывают у новых ключей другими.
  const mismatch = mismatchMessage(provider, apiKey);
  if (mismatch && data.get("force") !== "on") {
    return { mismatch };
  }

  const model = text(data, "model") || defaultModel(provider) || "";
  if (!model) {
    return { error: `Для ${PROVIDER_INFO[provider].label} укажите название модели.` };
  }
  if (!MODEL_ID.test(model)) {
    return { error: "Название модели: латинские буквы, цифры и символы . / : - _, без пробелов." };
  }

  const probe = await probeKey(provider, apiKey, model);
  await prisma.aiUsage.create({
    data: {
      organizationId: organization.id,
      kind: "PROBE",
      provider,
      model,
      inputTokens: probe.ok ? probe.usage.input : 0,
      outputTokens: probe.ok ? probe.usage.output : 0,
      error: probe.ok ? null : probe.message,
    },
  });
  if (!probe.ok) {
    return { error: probe.message };
  }

  await saveOwnKey(organization.id, { provider, apiKey, model });
  revalidatePath("/ai-bot");
  return { ok: `Ключ ${PROVIDER_INFO[provider].label} проверен и сохранён.` };
}

/** Убирает ключ клиента: бот возвращается на наш ключ и пакет по тарифу. */
export async function removeApiKeyAction(): Promise<KeyState> {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    return { error: "Отключать ключ может владелец или администратор." };
  }
  await removeOwnKey(organization.id);
  revalidatePath("/ai-bot");
  return { ok: "Ключ удалён. Помощник отвечает на тарифе." };
}

/** «Проверить снова»: тот же пробный вызов по сохранённому ключу; ошибка снимается, если ключ заработал. */
export async function recheckApiKeyAction(): Promise<KeyState> {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    return { error: "Доступно владельцу или администратору." };
  }

  const own = await loadOwnKey(organization.id);
  if (!own) {
    return { error: "Свой ключ не подключён." };
  }
  if ("error" in own) {
    return { error: "Нужно заново ввести ваш API-ключ." };
  }

  const settings = await getBot(organization.id);
  const probe = await probeKey(own.provider, own.apiKey, settings.model);
  if (!probe.ok) {
    // Сбой провайдера ключ не портит: ошибку ключа ставим только по его собственным кодам.
    if (probe.code === "auth" || probe.code === "quota" || probe.code === "model") {
      await setKeyError(organization.id, probe.code, true);
    }
    return { error: probe.message };
  }
  await setKeyError(organization.id, null, true);
  revalidatePath("/ai-bot");
  return { ok: "Ключ работает." };
}

/** Выбор нейросети на тарифе (без своего ключа): только та, для которой у платформы есть ключ. */
export async function saveProviderAction(_prev: KeyState, data: FormData): Promise<KeyState> {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    return { error: "Выбирать нейросеть может владелец или администратор." };
  }

  const provider = text(data, "provider") as ProviderId;
  if (!PROVIDERS.includes(provider) || PROVIDER_INFO[provider].ownKeyOnly || !env.platformKey(provider)) {
    return { error: "Эта нейросеть на тарифе пока недоступна: подключите свой ключ." };
  }

  const settings = await getBot(organization.id);
  if (settings.usesOwnKey) {
    return { error: "Сначала отключите свой ключ." };
  }

  // Модель на тарифе одна на провайдера (по умолчанию из каталога): null в базе.
  await prisma.aiBot.upsert({
    where: { organizationId: organization.id },
    update: { provider, model: null },
    create: { organizationId: organization.id, companyProfile: "", provider },
  });
  revalidatePath("/ai-bot");
  return { ok: `Помощник отвечает через ${PROVIDER_INFO[provider].label}.` };
}
