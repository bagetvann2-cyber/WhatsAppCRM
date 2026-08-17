import crypto from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "@/lib/db";
import type { Membership, Organization, Role, User } from "@/generated/prisma/client";

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SESSION_DAYS = 30;

/** Хеш пароля: scrypt со случайной солью. Формат — «соль:хеш» в hex. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `${salt}:${derived.toString("hex")}`;
}

/** Сравнение постоянного времени: по длительности проверки пароль не подобрать. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, "hex");
  if (expected.length !== KEY_LENGTH) {
    return false;
  }

  const derived = await scrypt(password, salt, KEY_LENGTH);
  return crypto.timingSafeEqual(expected, derived);
}

/** Почта — единственный вход в аккаунт, поэтому нормализуем её один раз и везде. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type RegisterInput = {
  organizationName: string;
  email: string;
  password: string;
  name?: string;
};

/**
 * Регистрация: создаёт компанию и её первого пользователя в роли владельца.
 * Организация и владелец появляются только вместе — кабинета без компании не бывает.
 */
export async function registerOrganization(input: RegisterInput): Promise<{
  user: User;
  organization: Organization;
  membership: Membership;
}> {
  const email = normalizeEmail(input.email);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error("Этот адрес уже зарегистрирован");
  }

  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: input.organizationName.trim() },
    });

    const user = await tx.user.create({
      data: { email, passwordHash, name: input.name?.trim() || null },
    });

    const membership = await tx.membership.create({
      data: { userId: user.id, organizationId: organization.id, role: "OWNER" },
    });

    return { user, organization, membership };
  });
}

/** Проверка пары почта-пароль. Возвращает null при любой неудаче, не уточняя причину. */
export async function signIn(email: string, password: string): Promise<User | null> {
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
  if (!user) {
    return null;
  }

  return (await verifyPassword(password, user.passwordHash)) ? user : null;
}

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);

  await prisma.session.create({ data: { token, userId, expiresAt } });
  return token;
}

export async function destroySession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } });
}

export type CurrentUser = {
  user: User;
  organization: Organization;
  role: Role;
};

/**
 * Разворачивает токен сессии в пользователя вместе с его организацией и ролью.
 * Организация нужна на каждом запросе — по ней фильтруются все данные.
 */
export async function userFromSessionToken(token: string): Promise<CurrentUser | null> {
  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          memberships: {
            include: { organization: true },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!session || session.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  const membership = session.user.memberships[0];
  if (!membership) {
    return null;
  }

  const { memberships: _memberships, ...user } = session.user;

  return {
    user: user as User,
    organization: membership.organization,
    role: membership.role,
  };
}
