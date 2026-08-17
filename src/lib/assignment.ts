import { prisma } from "@/lib/db";
import { canManageTeam } from "@/lib/team";
import type { Role } from "@/generated/prisma/client";

/**
 * Ответственный за диалог. Назначение мягкое: оно не запрещает другим отвечать,
 * а показывает, кто уже взял клиента. Жёсткая блокировка в поддержке вредна —
 * оператор ушёл на обед, а клиент ждёт.
 */

export type Actor = { userId: string; role: Role };

export type AssignDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Кто кого может назначать. Руководитель распоряжается очередью целиком,
 * оператор — только собой: берёт свободный диалог и отпускает свой.
 */
export function canAssign(input: {
  actor: Actor;
  assigneeId: string | null;
  currentAssigneeId: string | null;
}): AssignDecision {
  if (canManageTeam(input.actor.role)) {
    return { allowed: true };
  }

  if (input.assigneeId === null) {
    return input.currentAssigneeId === input.actor.userId
      ? { allowed: true }
      : { allowed: false, reason: "Снять с диалога чужого оператора может только руководитель" };
  }

  if (input.assigneeId !== input.actor.userId) {
    return { allowed: false, reason: "Назначать других может только руководитель" };
  }

  if (input.currentAssigneeId && input.currentAssigneeId !== input.actor.userId) {
    return { allowed: false, reason: "Диалог уже взял другой оператор" };
  }

  return { allowed: true };
}

export type AssignResult =
  | { ok: true; assigneeId: string | null }
  | { ok: false; error: string };

/**
 * Меняет ответственного. Все проверки — в одном месте: и принадлежность
 * диалога компании, и членство назначаемого в ней, и права того, кто назначает.
 */
export async function assignConversation(input: {
  organizationId: string;
  conversationId: string;
  assigneeId: string | null;
  actor: Actor;
}): Promise<AssignResult> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, organizationId: input.organizationId },
    select: { id: true, assigneeId: true },
  });

  if (!conversation) {
    return { ok: false, error: "Диалог не найден" };
  }

  const decision = canAssign({
    actor: input.actor,
    assigneeId: input.assigneeId,
    currentAssigneeId: conversation.assigneeId,
  });

  if (!decision.allowed) {
    return { ok: false, error: decision.reason };
  }

  // Назначить можно только сотрудника этой компании: иначе через подставленный
  // id чужой пользователь попал бы в карточку диалога.
  if (input.assigneeId) {
    const member = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: input.assigneeId,
          organizationId: input.organizationId,
        },
      },
    });

    if (!member) {
      return { ok: false, error: "Этот сотрудник не работает в кабинете" };
    }
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      assigneeId: input.assigneeId,
      assignedAt: input.assigneeId ? new Date() : null,
    },
  });

  return { ok: true, assigneeId: input.assigneeId };
}

/** Сколько диалогов ждут человека: свободные и те, что вернул ИИ-помощник. */
export async function queueCounts(organizationId: string, userId: string) {
  const [mine, free] = await Promise.all([
    prisma.conversation.count({ where: { organizationId, assigneeId: userId } }),
    prisma.conversation.count({ where: { organizationId, assigneeId: null } }),
  ]);

  return { mine, free };
}
