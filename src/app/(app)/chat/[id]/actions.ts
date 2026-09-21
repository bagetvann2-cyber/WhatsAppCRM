"use server";

import { revalidatePath } from "next/cache";
import { assignConversation } from "@/lib/assignment";
import { messageEvents } from "@/lib/events";
import { returnConversationToBot } from "@/lib/ai-bot-store";
import { requireUser } from "@/lib/session";

export type AssignState = { error: string } | null;

/**
 * Смена ответственного за диалог. Пустое значение — снять ответственного
 * и вернуть диалог в общую очередь.
 */
export async function assignAction(_prev: AssignState, data: FormData): Promise<AssignState> {
  const { user, organization, role } = await requireUser();

  const conversationId = String(data.get("conversationId") ?? "");
  const raw = data.get("assigneeId");
  const assigneeId = typeof raw === "string" && raw !== "" ? raw : null;

  const result = await assignConversation({
    organizationId: organization.id,
    conversationId,
    assigneeId,
    actor: { userId: user.id, role },
  });

  if (!result.ok) {
    return { error: result.error };
  }

  // Список диалогов у коллег обновится сам: у них открыт тот же поток событий.
  messageEvents.emit("update", { conversationId });
  revalidatePath("/", "layout");
  return null;
}

/** Кнопка «Вернуть боту»: ИИ-помощник снова отвечает клиенту в этом диалоге. */
export async function returnToBotAction(data: FormData): Promise<void> {
  const { organization } = await requireUser();
  const conversationId = String(data.get("conversationId") ?? "");

  if (await returnConversationToBot(organization.id, conversationId)) {
    messageEvents.emit("update", { conversationId });
    revalidatePath("/", "layout");
  }
}
