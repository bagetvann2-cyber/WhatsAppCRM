import { prisma } from "@/lib/db";
import {
  DEFAULT_AWAY,
  DEFAULT_GREETING,
  DEFAULT_SCHEDULE,
  isWorkingTime,
  normalizeSchedule,
  type DaySchedule,
} from "@/lib/automation";
import { sendTextMessage } from "@/lib/whatsapp/client";

/** Второй автоответ «мы не работаем» в тот же вечер клиенту не нужен. */
const AWAY_COOLDOWN_HOURS = 8;

export type AutomationSettings = {
  greetingEnabled: boolean;
  greetingText: string;
  awayEnabled: boolean;
  awayText: string;
  timezone: string;
  schedule: DaySchedule[];
};

export async function getAutomation(organizationId: string): Promise<AutomationSettings> {
  const stored = await prisma.automation.findUnique({ where: { organizationId } });

  return {
    greetingEnabled: stored?.greetingEnabled ?? false,
    greetingText: stored?.greetingText ?? DEFAULT_GREETING,
    awayEnabled: stored?.awayEnabled ?? false,
    awayText: stored?.awayText ?? DEFAULT_AWAY,
    timezone: stored?.timezone ?? "Asia/Almaty",
    schedule: stored ? normalizeSchedule(stored.schedule) : DEFAULT_SCHEDULE,
  };
}

export async function saveAutomation(
  organizationId: string,
  settings: AutomationSettings,
): Promise<void> {
  const data = {
    greetingEnabled: settings.greetingEnabled,
    greetingText: settings.greetingText.trim() || DEFAULT_GREETING,
    awayEnabled: settings.awayEnabled,
    awayText: settings.awayText.trim() || DEFAULT_AWAY,
    timezone: settings.timezone,
    schedule: normalizeSchedule(settings.schedule),
  };

  await prisma.automation.upsert({
    where: { organizationId },
    update: data,
    create: { organizationId, ...data },
  });
}

export type AutoReply = { kind: "greeting" | "away"; text: string } | null;

/**
 * Решает, что ответить на входящее. Приветствие — только на самое первое
 * сообщение контакта: повторять его при каждом обращении навязчиво.
 * Автоответ «мы не работаем» — вне часов и не чаще раза в 8 часов на диалог.
 */
export function decideAutoReply(input: {
  settings: AutomationSettings;
  isFirstMessage: boolean;
  awayRepliedAt: Date | null;
  now?: Date;
}): AutoReply {
  const now = input.now ?? new Date();
  const { settings } = input;

  if (settings.greetingEnabled && input.isFirstMessage) {
    return { kind: "greeting", text: settings.greetingText };
  }

  if (!settings.awayEnabled) {
    return null;
  }
  if (isWorkingTime(settings.schedule, settings.timezone, now)) {
    return null;
  }

  const cooldownPassed =
    !input.awayRepliedAt ||
    now.getTime() - input.awayRepliedAt.getTime() >= AWAY_COOLDOWN_HOURS * 3600 * 1000;

  return cooldownPassed ? { kind: "away", text: settings.awayText } : null;
}

/**
 * Отправляет автоответ и сохраняет его как исходящее сообщение диалога —
 * оператор должен видеть, что робот уже написал клиенту.
 */
export async function runAutomation(input: {
  organizationId: string;
  conversationId: string;
  waId: string;
  now?: Date;
}): Promise<AutoReply> {
  const settings = await getAutomation(input.organizationId);
  if (!settings.greetingEnabled && !settings.awayEnabled) {
    return null;
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    select: { awayRepliedAt: true, _count: { select: { messages: true } } },
  });

  if (!conversation) {
    return null;
  }

  const reply = decideAutoReply({
    settings,
    // Входящее уже записано, поэтому первое обращение — это ровно одно сообщение.
    isFirstMessage: conversation._count.messages === 1,
    awayRepliedAt: conversation.awayRepliedAt,
    now: input.now,
  });

  if (!reply) {
    return null;
  }

  try {
    const { wamid } = await sendTextMessage(input.waId, reply.text);
    const now = input.now ?? new Date();

    await prisma.message.create({
      data: {
        wamid,
        conversationId: input.conversationId,
        direction: "OUTBOUND",
        type: "text",
        text: reply.text,
        status: "sent",
        timestamp: now,
      },
    });

    await prisma.conversation.update({
      where: { id: input.conversationId },
      data: {
        lastMessageAt: now,
        ...(reply.kind === "away" ? { awayRepliedAt: now } : {}),
      },
    });

    return reply;
  } catch {
    // Автоответ не должен ронять приём входящих: сообщение клиента уже сохранено.
    return null;
  }
}
