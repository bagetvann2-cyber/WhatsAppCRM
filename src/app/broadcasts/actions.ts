"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";
import { createBroadcast, runBroadcast, stopBroadcast } from "@/lib/broadcasts";

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

  try {
    const broadcast = await createBroadcast({
      organizationId: organization.id,
      templateId: text(data, "templateId"),
      name: text(data, "name"),
      segmentQuery: text(data, "segmentQuery"),
    });

    // Отправка идёт в фоне: страница не должна ждать всю очередь.
    void runBroadcast(organization.id, broadcast.id).catch(() => {});
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Не удалось создать рассылку." };
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
