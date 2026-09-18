import { prisma } from "@/lib/db";
import { askBot, type ChatTurn } from "@/lib/ai-client";
import { alertPlatformError } from "@/lib/alerts";
import {
  MAX_HISTORY_MESSAGE_CHARS,
  OUTCOMES,
  pickStub,
  shouldBotReply,
  type BotOutcome,
  type BotSettings,
} from "@/lib/ai-bot";
import { getSubscription, isSubscriptionActive } from "@/lib/billing-store";
import { isReplyWindowOpen } from "@/lib/conversation-window";
import { sendChannelText } from "@/lib/channels";
import { defaultModel, resolveModel } from "@/lib/llm/catalog";
import { LlmError } from "@/lib/llm/errors";
import type { ProviderId } from "@/lib/llm/types";
import { getOrderFields, upsertDraftOrderFields } from "@/lib/orders-store";

/** Сколько последних сообщений диалога уходит боту как контекст. */
const HISTORY_DEPTH = 12;

/** Повторную заглушку в тот же диалог не шлём: клиент, которому ответили «ждите», ждёт. */
const STUB_REPEAT_MS = 6 * 3600 * 1000;

function addMonth(date: Date): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + 1);
  return next;
}

export type BotState = BotSettings & {
  exists: boolean;
  provider: ProviderId;
  subscriptionActive: boolean;
  /** Кабинет ещё не подключил канал: пробные дни не идут, а лимиты на нашем ключе не должны быть бессрочными. */
  trialNotStarted: boolean;
  /** Когда пакет обнулится сам. */
  periodResetsAt: Date;
};

export async function getBot(organizationId: string): Promise<BotState> {
  const [stored, subscription] = await Promise.all([
    prisma.aiBot.findUnique({ where: { organizationId } }),
    getSubscription(organizationId),
  ]);
  const provider = stored?.provider ?? "ANTHROPIC";
  const periodEnds = addMonth(stored?.answersPeriodStart ?? new Date());
  // Месяц прошёл: пакет обнулится при ближайшем ответе (reserveAnswer), а показываем уже новый.
  const expired = periodEnds.getTime() <= Date.now();

  return {
    exists: stored !== null,
    provider,
    enabled: stored?.enabled ?? false,
    // null в базе — «модель каталога по умолчанию»; наружу отдаём уже конкретную.
    model: resolveModel(provider, stored?.model ?? null) ?? "",
    companyProfile: stored?.companyProfile ?? "",
    rules: stored?.rules ?? null,
    stubText: stored?.stubText ?? null,
    stubTextKz: stored?.stubTextKz ?? null,
    answersLimit: subscription.plan.aiAnswersPerMonth,
    answersUsed: expired ? 0 : (stored?.answersUsed ?? 0),
    subscriptionActive: isSubscriptionActive(subscription),
    trialNotStarted: subscription.status === "TRIAL" && subscription.trialEndsAt === null,
    periodResetsAt: expired ? addMonth(new Date()) : periodEnds,
  };
}

export type BotEdit = {
  enabled: boolean;
  model: string;
  companyProfile: string;
  rules: string | null;
  stubText?: string | null;
  stubTextKz?: string | null;
};

export async function saveBot(organizationId: string, settings: BotEdit): Promise<void> {
  const data = {
    enabled: settings.enabled,
    // Модель по умолчанию храним как null: смена победителя замера не должна требовать миграции.
    model: settings.model === defaultModel("ANTHROPIC") ? null : settings.model,
    companyProfile: settings.companyProfile.trim(),
    rules: settings.rules?.trim() || null,
    stubText: settings.stubText?.trim() || null,
    stubTextKz: settings.stubTextKz?.trim() || null,
  };

  await prisma.aiBot.upsert({
    where: { organizationId },
    update: data,
    create: { organizationId, ...data },
  });
}

/**
 * Занимает один ответ из пакета до обращения к нейросети. Проверка, сброс по истечении
 * месяца и списание — один запрос: два воркера на границе месяца не сбросят счётчик
 * дважды, а на границе пакета не превысят его. Возвращает начало периода, в котором
 * ответ занят (нужен для возврата), или null, если пакет исчерпан.
 */
export async function reserveAnswer(organizationId: string, limit: number): Promise<Date | null> {
  const rows = await prisma.$queryRaw<{ answersPeriodStart: Date }[]>`
    UPDATE "AiBot" SET
      "answersUsed" = CASE WHEN "answersPeriodStart" <= timezone('UTC', now()) - interval '1 month'
        THEN 1 ELSE "answersUsed" + 1 END,
      "answersPeriodStart" = CASE WHEN "answersPeriodStart" <= timezone('UTC', now()) - interval '1 month'
        THEN timezone('UTC', now()) ELSE "answersPeriodStart" END
    WHERE "organizationId" = ${organizationId}
      AND (CASE WHEN "answersPeriodStart" <= timezone('UTC', now()) - interval '1 month'
        THEN 0 ELSE "answersUsed" END) < ${limit}
    RETURNING "answersPeriodStart"`;

  return rows[0]?.answersPeriodStart ?? null;
}

/** Возвращает занятый ответ, если запрос к нейросети не состоялся; только в том же периоде. */
export async function refundAnswer(organizationId: string, periodStart: Date): Promise<void> {
  await prisma.aiBot.updateMany({
    where: { organizationId, answersUsed: { gt: 0 }, answersPeriodStart: periodStart },
    data: { answersUsed: { decrement: 1 } },
  });
}

export async function listReplies(organizationId: string, take = 20) {
  return prisma.aiReply.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export type BotRun =
  | { status: "skipped"; reason: string }
  | { status: "answered"; text: string }
  | { status: "handoff"; reason: string | null }
  | { status: "failed"; error: string };

type Conversation = NonNullable<Awaited<ReturnType<typeof loadConversation>>>;

async function loadConversation(conversationId: string) {
  return prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      handedOffAt: true,
      windowExpiresAt: true,
      channel: true,
      messages: {
        orderBy: { timestamp: "desc" },
        take: HISTORY_DEPTH,
        select: { direction: true, text: true, type: true },
      },
    },
  });
}

/** История приходит от свежих к старым, боту нужен обычный порядок и первым сообщение клиента. */
function buildHistory(messages: Conversation["messages"]): ChatTurn[] {
  const history: ChatTurn[] = messages
    .slice()
    .reverse()
    .map((message) => ({
      role: message.direction === "INBOUND" ? ("user" as const) : ("assistant" as const),
      text: (message.text ?? `[${message.type}]`).slice(0, MAX_HISTORY_MESSAGE_CHARS),
    }));

  while (history.length > 0 && history[0].role !== "user") {
    history.shift();
  }
  return history;
}

/** Отправляет клиенту текст и запоминает его в переписке как обычное исходящее. */
async function sendToClient(input: {
  conversationId: string;
  channel: Conversation["channel"];
  to: string;
  text: string;
}): Promise<void> {
  const { externalMessageId } = await sendChannelText({
    channel: input.channel,
    to: input.to,
    text: input.text,
  });
  const now = new Date();

  await prisma.message.create({
    data: {
      externalMessageId,
      channelId: input.channel.id,
      conversationId: input.conversationId,
      direction: "OUTBOUND",
      type: "text",
      text: input.text,
      status: "sent",
      timestamp: now,
    },
  });

  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { lastMessageAt: now },
  });
}

/**
 * Бот включён, но ответить не может: клиенту уходит заглушка, а не тишина. Диалог
 * при этом остаётся за ботом (handedOffAt не трогаем): причина временная, и после её
 * устранения бот должен снова отвечать. Повтор гасится по журналу.
 * Возвращает текст, который ушёл, или null.
 */
async function sendStub(input: {
  settings: BotSettings;
  conversationId: string;
  channel: Conversation["channel"];
  to: string;
  question: string;
}): Promise<string | null> {
  const recent = await prisma.aiReply.findFirst({
    where: {
      conversationId: input.conversationId,
      stub: true,
      createdAt: { gte: new Date(Date.now() - STUB_REPEAT_MS) },
    },
    select: { id: true },
  });
  if (recent) {
    return null;
  }

  const text = pickStub(input.settings, input.question);
  try {
    await sendToClient({ conversationId: input.conversationId, channel: input.channel, to: input.to, text });
  } catch {
    // Заглушка не ушла: повторять её при следующем сообщении можно, дедупликации нет.
    return null;
  }
  return text;
}

function outcomeForError(error: unknown): BotOutcome {
  return error instanceof LlmError ? `llm-${error.code}` : "llm-unavailable";
}

/**
 * Отвечает клиенту от имени компании. Вызывается после того, как входящее
 * сообщение уже сохранено, поэтому сбой здесь не теряет само сообщение.
 */
export async function runAiBot(input: {
  organizationId: string;
  conversationId: string;
  /** Адресат в терминах канала: номер телефона у WhatsApp, chat_id у Telegram. */
  to: string;
}): Promise<BotRun> {
  const settings = await getBot(input.organizationId);
  const conversation = await loadConversation(input.conversationId);

  if (!conversation) {
    return { status: "skipped", reason: "нет такого диалога" };
  }

  const history = buildHistory(conversation.messages);
  const question = [...history].reverse().find((turn) => turn.role === "user")?.text ?? "";
  const windowOpen = isReplyWindowOpen(conversation.channel, conversation);

  // Заглушка уходит только в открытое окно и только на реальное сообщение клиента.
  async function stub(
    outcome: BotOutcome,
    extra: { error?: string; httpStatus?: number; providerCode?: string } = {},
    force = false,
  ) {
    if ((!force && !OUTCOMES[outcome].sendsStub) || !windowOpen || !question) {
      return null;
    }
    const text = await sendStub({
      settings,
      conversationId: input.conversationId,
      channel: conversation!.channel,
      to: input.to,
      question,
    });
    if (text) {
      await prisma.aiReply.create({
        data: {
          organizationId: input.organizationId,
          conversationId: input.conversationId,
          question,
          answer: text,
          stub: true,
          outcome,
          provider: settings.provider,
          model: settings.model,
          ...extra,
        },
      });
    }
    return text;
  }

  const decision = shouldBotReply({
    settings,
    handedOffAt: conversation.handedOffAt,
    subscriptionActive: settings.subscriptionActive,
  });
  if (!decision.reply) {
    await stub(decision.reason);
    return { status: "skipped", reason: decision.reason };
  }

  // Вне 24-часового окна WhatsApp не даст отправить свободный текст: бот тихо
  // промолчит, а не потратит пакет ответов на заведомо неотправляемое.
  if (!windowOpen) {
    return { status: "skipped", reason: "window-closed" };
  }
  if (history.length === 0) {
    return { status: "skipped", reason: "в диалоге нет сообщений клиента" };
  }

  // Ответ занимается до запроса: параллельные воркеры не превысят пакет.
  const periodStart = await reserveAnswer(input.organizationId, settings.answersLimit);
  if (!periodStart) {
    await stub("quota");
    return { status: "skipped", reason: "quota" };
  }

  const orderFields = await getOrderFields(input.organizationId);

  let result: Awaited<ReturnType<typeof askBot>>;
  try {
    result = await askBot({
      provider: settings.provider,
      model: settings.model,
      companyProfile: settings.companyProfile,
      rules: settings.rules,
      history,
      orderFields,
    });
  } catch (error) {
    // Запроса не было или он не дал ответа: занятый ответ возвращается в пакет.
    await refundAnswer(input.organizationId, periodStart);
    await alertPlatformError(settings.provider, error);

    const outcome = outcomeForError(error);
    const message = error instanceof LlmError ? error.message : "Не удалось получить ответ";
    const extra = {
      error: message,
      httpStatus: error instanceof LlmError ? error.status : undefined,
      providerCode: error instanceof LlmError ? error.providerCode : undefined,
    };

    const stubText = await stub(outcome, extra);
    if (!stubText) {
      await prisma.aiReply.create({
        data: {
          organizationId: input.organizationId,
          conversationId: input.conversationId,
          question,
          outcome,
          provider: settings.provider,
          model: settings.model,
          ...extra,
        },
      });
    }

    return { status: "failed", error: message };
  }

  try {
    // Заглушка вместо тишины: модель передала диалог человеку и ничего не написала.
    const handoffStub = result.handoff && !result.answer ? await stub("handoff", {}, true) : null;

    await prisma.aiReply.create({
      data: {
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        question,
        answer: result.answer,
        handoff: result.handoff,
        handoffReason: result.handoffReason,
        outcome: result.handoff ? "handoff" : "answered",
        provider: result.provider ?? settings.provider,
        model: result.model ?? settings.model,
        latencyMs: result.latencyMs,
        inputTokens: result.inputTokens,
        cachedTokens: result.cachedTokens,
        outputTokens: result.outputTokens,
      },
    });

    if (result.orderFields) {
      // Черновик заказа — побочная запись, её сбой не должен портить уже
      // готовый ответ клиенту.
      await upsertDraftOrderFields({
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        fields: result.orderFields,
        fieldDefs: orderFields,
      }).catch(() => {});
    }

    if (result.handoff) {
      await prisma.conversation.update({
        where: { id: input.conversationId },
        data: { handedOffAt: new Date() },
      });
    }

    if (result.answer) {
      await sendToClient({
        conversationId: input.conversationId,
        channel: conversation.channel,
        to: input.to,
        text: result.answer,
      });
    }

    if (result.handoff) {
      return { status: "handoff", reason: result.handoffReason };
    }
    return { status: "answered", text: result.answer ?? handoffStub ?? "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось отправить ответ";

    await prisma.aiReply.create({
      data: {
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        question,
        error: message,
        outcome: "send-failed",
        provider: settings.provider,
        model: settings.model,
      },
    });

    return { status: "failed", error: message };
  }
}

/** Начало календарных суток по Алматы (UTC+5, летнего времени нет). */
function startOfDayAlmaty(now = new Date()): Date {
  const shifted = new Date(now.getTime() + 5 * 3600 * 1000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 5 * 3600 * 1000);
}

/**
 * Занимает одну проверку в тест-чате на нашем ключе. Запись создаётся до вызова модели:
 * упавший провайдер иначе можно дёргать в обход лимита. Возвращает id записи или null,
 * если лимит выбран.
 */
export async function reserveTestUsage(
  organizationId: string,
  limit: number,
  lifetime: boolean,
  provider: ProviderId,
  model: string,
): Promise<string | null> {
  const used = await prisma.aiUsage.count({
    where: { organizationId, kind: "TEST", ...(lifetime ? {} : { createdAt: { gte: startOfDayAlmaty() } }) },
  });
  if (used >= limit) {
    return null;
  }
  const row = await prisma.aiUsage.create({ data: { organizationId, kind: "TEST", provider, model } });
  return row.id;
}

export async function finishUsage(
  id: string,
  result: { inputTokens?: number; outputTokens?: number; error?: string },
): Promise<void> {
  await prisma.aiUsage.update({
    where: { id },
    data: { inputTokens: result.inputTokens ?? 0, outputTokens: result.outputTokens ?? 0, error: result.error ?? null },
  });
}
