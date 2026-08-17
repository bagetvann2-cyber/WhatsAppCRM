import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { hashPassword, normalizeEmail } from "@/lib/auth";
import type { Role } from "@/generated/prisma/client";

const INVITE_DAYS = 7;

/** Кто может звать людей в кабинет. Оператор — рабочая роль, а не управляющая. */
export function canManageTeam(role: Role): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export async function listMembers(organizationId: string) {
  return prisma.membership.findMany({
    where: { organizationId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function listInvites(organizationId: string) {
  return prisma.invite.findMany({
    where: { organizationId, acceptedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Создаёт одноразовую ссылку-приглашение. Почта не нужна: ссылку владелец
 * передаёт сотруднику сам — так не нужен почтовый сервис и борьба со спам-фильтрами.
 */
export async function createInvite(input: {
  organizationId: string;
  role: Role;
  hint?: string;
}) {
  return prisma.invite.create({
    data: {
      organizationId: input.organizationId,
      role: input.role,
      hint: input.hint?.trim() || null,
      token: crypto.randomBytes(24).toString("hex"),
      expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 3600 * 1000),
    },
  });
}

export async function revokeInvite(organizationId: string, id: string): Promise<void> {
  await prisma.invite.deleteMany({ where: { id, organizationId } });
}

export type InviteCheck =
  | { ok: true; invite: { id: string; role: Role; organizationName: string } }
  | { ok: false; reason: "not-found" | "expired" | "used" };

/** Проверка ссылки до того, как человек начнёт заполнять форму. */
export async function checkInvite(token: string): Promise<InviteCheck> {
  if (!token) {
    return { ok: false, reason: "not-found" };
  }

  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { organization: true },
  });

  if (!invite) {
    return { ok: false, reason: "not-found" };
  }
  if (invite.acceptedAt) {
    return { ok: false, reason: "used" };
  }
  if (invite.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    invite: { id: invite.id, role: invite.role, organizationName: invite.organization.name },
  };
}

/**
 * Принятие приглашения: создаёт пользователя и вводит его в компанию.
 * Ссылка гасится в той же транзакции, поэтому по одной ссылке войдёт ровно один человек.
 */
export async function acceptInvite(input: {
  token: string;
  email: string;
  password: string;
  name?: string;
}): Promise<{ userId: string }> {
  const check = await checkInvite(input.token);
  if (!check.ok) {
    const messages = {
      "not-found": "Ссылка недействительна. Попросите новую у владельца кабинета.",
      expired: "Срок действия ссылки истёк. Попросите новую у владельца кабинета.",
      used: "По этой ссылке уже зарегистрировались. Попросите новую у владельца кабинета.",
    } as const;
    throw new Error(messages[check.reason]);
  }

  const email = normalizeEmail(input.email);
  if (await prisma.user.findUnique({ where: { email } })) {
    throw new Error("Этот адрес уже зарегистрирован");
  }

  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    // Гасим ссылку условием на acceptedAt: если двое открыли её одновременно,
    // второй получит 0 обновлённых строк и до создания пользователя не дойдёт.
    const consumed = await tx.invite.updateMany({
      where: { id: check.invite.id, acceptedAt: null },
      data: { acceptedAt: new Date() },
    });

    if (consumed.count === 0) {
      throw new Error("По этой ссылке уже зарегистрировались. Попросите новую.");
    }

    const invite = await tx.invite.findUniqueOrThrow({ where: { id: check.invite.id } });

    const user = await tx.user.create({
      data: { email, passwordHash, name: input.name?.trim() || null },
    });

    await tx.membership.create({
      data: { userId: user.id, organizationId: invite.organizationId, role: invite.role },
    });

    return { userId: user.id };
  });
}
