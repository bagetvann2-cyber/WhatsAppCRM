"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";
import { saveAutomation } from "@/lib/automation-store";
import { WEEKDAYS, type DaySchedule } from "@/lib/automation";

export type FormState = { error: string } | { ok: string } | null;

function text(data: FormData, field: string): string {
  const value = data.get(field);
  return typeof value === "string" ? value.trim() : "";
}

export async function saveAutomationAction(_prev: FormState, data: FormData): Promise<FormState> {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    return { error: "Настраивать автоответы может владелец или администратор." };
  }

  const schedule: DaySchedule[] = WEEKDAYS.map((_, index) => ({
    enabled: data.get(`day${index}`) === "on",
    from: text(data, `from${index}`) || "09:00",
    to: text(data, `to${index}`) || "19:00",
  }));

  await saveAutomation(organization.id, {
    greetingEnabled: data.get("greetingEnabled") === "on",
    greetingText: text(data, "greetingText"),
    awayEnabled: data.get("awayEnabled") === "on",
    awayText: text(data, "awayText"),
    timezone: text(data, "timezone") || "Asia/Almaty",
    schedule,
  });

  revalidatePath("/automation");
  return { ok: "Настройки сохранены." };
}
