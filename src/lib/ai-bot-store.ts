import { prisma } from "@/lib/db";
import { askBot, type ChatTurn } from "@/lib/ai-client";
import { shouldBotReply, type BotSettings } from "@/lib/ai-bot";
import { isReplyWindowOpen } from "@/lib/conversation-window";
import { sendChannelText } from "@/lib/channels";
import { getOrderFields, upsertDraftOrderFields } from "@/lib/orders-store";

/** Сколько последних сообщений диалога уходит боту как контекст. */
const HISTORY_DEPTH = 12;

export async function getBot(organizationId: string): Promise<BotSettings & { exists: boolean }> {
  const stored = await prisma.aiBot.findUnique({ where: { organizationId } });

  return {
    exists: stored !== null,
    enabled: stored?.enabled ?? false,
    model: stored?.model ?? "claude-opus-5",
    companyProfile: stored?.companyProfile ?? "",
    rules: stored?.rules ?? null,
    answersLimit: stored?.answersLimit ?? 100,
    answersUsed: stored?.answersUsed ?? 0,
  };
}

export async function saveBot(
  organizationId: string,
  settings: Omit<BotSettings, "answersUsed">,
): Promise<void> {
  const data = {
    enabled: settings.enabled,
    model: settings.model,
    companyProfile: settings.companyProfile.trim(),
    rules: settings.rules?.trim() || null,
    answersLimit: settings.answersLimit,
  };

  await prisma.aiBot.upsert({
    where: { organizationId },
    update: data,
    create: { organizationId, ...data },
  });
}

/** Обнуляет счётчик — например, когда клиент докупил пакет. */
export async function resetUsage(organizationId: string): Promise<void> {
  await prisma.aiBot.updateMany({ where: { organizationId }, data: { answersUsed: 0 } });
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

  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
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

  if (!conversation) {
    return { status: "skipped", reason: "нет такого диалога" };
  }

  const decision = shouldBotReply({ settings, handedOffAt: conversation.handedOffAt });
  if (!decision.reply) {
    return { status: "skipped", reason: decision.reason };
  }

  // Вне 24-часового окна WhatsApp не даст отправить свободный текст — бот
  // тихо промолчит, а не потратит пакет ответов на заведомо неотправляемое.
  if (!isReplyWindowOpen(conversation.channel, conversation)) {
    return { status: "skipped", reason: "window-closed" };
  }

  // История приходит от свежих к старым — боту нужен обычный порядок.
  const history: ChatTurn[] = conversation.messages
    .slice()
    .reverse()
    .map((message) => ({
      role: message.direction === "INBOUND" ? ("user" as const) : ("assistant" as const),
      text: message.text ?? `[${message.type}]`,
    }));

  // Первым должно идти сообщение клиента, иначе Claude отклонит запрос.
  while (history.length > 0 && history[0].role !== "user") {
    history.shift();
  }
  if (history.length === 0) {
    return { status: "skipped", reason: "в диалоге нет сообщений клиента" };
  }

  const question = [...history].reverse().find((turn) => turn.role === "user")?.text ?? "";
  const orderFields = await getOrderFields(input.organizationId);

  try {
    const result = await askBot({
      model: settings.model,
      companyProfile: settings.companyProfile,
      rules: settings.rules,
      history,
      orderFields,
    });

    // Ответ засчитывается в пакет независимо от исхода: запрос оплачен в любом случае.
    await prisma.aiBot.updateMany({
      where: { organizationId: input.organizationId },
      data: { answersUsed: { increment: 1 } },
    });

    await prisma.aiReply.create({
      data: {
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        question,
        answer: result.answer,
        handoff: result.handoff,
        handoffReason: result.handoffReason,
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
      const { externalMessageId } = await sendChannelText({
        channel: conversation.channel,
        to: input.to,
        text: result.answer,
      });
      const now = new Date();

      await prisma.message.create({
        data: {
          externalMessageId,
          channelId: conversation.channel.id,
          conversationId: input.conversationId,
          direction: "OUTBOUND",
          type: "text",
          text: result.answer,
          status: "sent",
          timestamp: now,
        },
      });

      await prisma.conversation.update({
        where: { id: input.conversationId },
        data: { lastMessageAt: now },
      });
    }

    if (result.handoff) {
      return { status: "handoff", reason: result.handoffReason };
    }
    return { status: "answered", text: result.answer ?? "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось получить ответ";

    await prisma.aiReply.create({
      data: {
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        question,
        error: message,
      },
    });

    return { status: "failed", error: message };
  }
}
