"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";
import { prisma } from "@/lib/db";
import { createBroadcast, startBroadcast, stopBroadcast } from "@/lib/broadcasts";

export type FormState = { error: string } | { ok: true } | null;

function text(data: FormData, field: string): string {
  const value = data.get(field);
  return typeof value === "string" ? value.trim() : "";
}

export async function createBroadcastAction(_prev: FormState, data: FormData): Promise<FormState> {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    return { error: "Запускать рассылки может владелец или администратор." };
  }

  let broadcastId: string;
  try {
    const broadcast = await createBroadcast({
      organizationId: organization.id,
      templateId: text(data, "templateId"),
      name: text(data, "name"),
      segmentQuery: text(data, "segmentQuery"),
      segmentTagIds: [text(data, "segmentTagId")].filter(Boolean),
    });
    broadcastId = broadcast.id;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Не удалось создать рассылку." };
  }

  // Отправку делает воркер; здесь только проверки и постановка в очередь.
  try {
    await startBroadcast(organization.id, broadcastId);
  } catch (error) {
    // Запуск не удался — черновик не оставляем, иначе в списке повиснет мёртвая рассылка
    // (получатели уйдут каскадом).
    await prisma.broadcast.deleteMany({
      where: { id: broadcastId, organizationId: organization.id, status: "DRAFT" },
    });
    return { error: error instanceof Error ? error.message : "Не удалось запустить рассылку." };
  }

  revalidatePath("/broadcasts");
  return { ok: true };
}

export async function stopBroadcastAction(data: FormData): Promise<void> {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    return;
  }

  await stopBroadcast(organization.id, text(data, "id"));
  revalidatePath("/broadcasts");
}
