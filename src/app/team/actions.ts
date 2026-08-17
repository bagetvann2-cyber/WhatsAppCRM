"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";
import { requireUser } from "@/lib/session";
import { acceptInvite, canManageTeam, createInvite, revokeInvite } from "@/lib/team";
import type { Role } from "@/generated/prisma/client";

export type FormState = { error: string } | null;

function text(data: FormData, field: string): string {
  const value = data.get(field);
  return typeof value === "string" ? value.trim() : "";
}

export async function createInviteAction(_prev: FormState, data: FormData): Promise<FormState> {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    return { error: "Приглашать сотрудников может только владелец или администратор." };
  }

  const requested = text(data, "role");
  const inviteRole: Role = requested === "ADMIN" ? "ADMIN" : "OPERATOR";

  await createInvite({
    organizationId: organization.id,
    role: inviteRole,
    hint: text(data, "hint"),
  });

  revalidatePath("/team");
  return null;
}

export async function revokeInviteAction(data: FormData): Promise<void> {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    return;
  }

  await revokeInvite(organization.id, text(data, "id"));
  revalidatePath("/team");
}

export async function acceptInviteAction(_prev: FormState, data: FormData): Promise<FormState> {
  const token = text(data, "token");
  const email = text(data, "email");
  const password = text(data, "password");
  const name = text(data, "name");

  if (!email || !password) {
    return { error: "Введите почту и пароль." };
  }
  if (password.length < 8) {
    return { error: "Пароль должен быть не короче 8 символов." };
  }

  let userId: string;
  try {
    ({ userId } = await acceptInvite({ token, email, password, name }));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Не удалось принять приглашение." };
  }

  await setSessionCookie(await createSession(userId));
  redirect("/");
}
