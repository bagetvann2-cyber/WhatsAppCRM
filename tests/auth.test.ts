import { afterAll, beforeEach, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import {
  createSession,
  hashPassword,
  registerOrganization,
  userFromSessionToken,
  verifyEmailToken,
  verifyPassword,
  signIn,
} from "@/lib/auth";

const email = "owner@test-auth.kz";

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { endsWith: "@test-auth.kz" } } });
  await prisma.organization.deleteMany({ where: { name: { startsWith: "Тест-организация" } } });
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("пароль хешируется и проверяется", async () => {
  const hash = await hashPassword("правильный-пароль");

  expect(hash).not.toContain("правильный-пароль");
  expect(await verifyPassword("правильный-пароль", hash)).toBe(true);
  expect(await verifyPassword("другой-пароль", hash)).toBe(false);
});

test("один и тот же пароль даёт разные хеши", async () => {
  const first = await hashPassword("пароль");
  const second = await hashPassword("пароль");

  expect(first).not.toBe(second);
  expect(await verifyPassword("пароль", first)).toBe(true);
  expect(await verifyPassword("пароль", second)).toBe(true);
});

test("испорченный хеш не пропускает и не роняет проверку", async () => {
  expect(await verifyPassword("пароль", "мусор")).toBe(false);
  expect(await verifyPassword("пароль", "")).toBe(false);
});

test("регистрация создаёт организацию, пользователя и делает его владельцем", async () => {
  const { user, organization, membership } = await registerOrganization({
    organizationName: "Тест-организация Айгерим",
    email,
    password: "пароль-12345",
    name: "Айгерим",
  });

  expect(organization.name).toBe("Тест-организация Айгерим");
  expect(user.email).toBe(email);
  expect(membership.role).toBe("OWNER");
  expect(await verifyPassword("пароль-12345", user.passwordHash)).toBe(true);
});

test("повторная регистрация на ту же почту отклоняется", async () => {
  await registerOrganization({
    organizationName: "Тест-организация Один",
    email,
    password: "пароль-12345",
  });

  await expect(
    registerOrganization({
      organizationName: "Тест-организация Два",
      email,
      password: "другой-пароль",
    }),
  ).rejects.toThrow(/уже зарегистрирован/i);
});

test("почта нечувствительна к регистру и пробелам", async () => {
  await registerOrganization({
    organizationName: "Тест-организация Регистр",
    email: "  OWNER@Test-Auth.KZ  ",
    password: "пароль-12345",
  });

  const stored = await prisma.user.findUnique({ where: { email } });
  expect(stored).not.toBeNull();

  const signedIn = await signIn("Owner@Test-Auth.kz", "пароль-12345");
  expect(signedIn?.email).toBe(email);
});

test("регистрация выдаёт токен подтверждения и не подтверждает почту сразу", async () => {
  const { user } = await registerOrganization({
    organizationName: "Тест-организация Токен",
    email,
    password: "пароль-12345",
  });

  expect(user.emailVerifiedAt).toBeNull();
  expect(user.verificationToken).toBeTruthy();
  expect(user.verificationTokenExpiresAt?.getTime()).toBeGreaterThan(Date.now());
});

test("verifyEmailToken подтверждает по верному токену и гасит его", async () => {
  const { user } = await registerOrganization({
    organizationName: "Тест-организация Подтверждение",
    email,
    password: "пароль-12345",
  });

  const verified = await verifyEmailToken(user.verificationToken!);
  expect(verified?.emailVerifiedAt).not.toBeNull();

  // Токен одноразовый: повторный переход по ссылке уже ничего не находит.
  expect(await verifyEmailToken(user.verificationToken!)).toBeNull();
});

test("verifyEmailToken отклоняет пустой, чужой и просроченный токен", async () => {
  const { user } = await registerOrganization({
    organizationName: "Тест-организация Просрочка Почты",
    email,
    password: "пароль-12345",
  });

  expect(await verifyEmailToken("")).toBeNull();
  expect(await verifyEmailToken("нет-такого-токена")).toBeNull();

  await prisma.user.update({
    where: { id: user.id },
    data: { verificationTokenExpiresAt: new Date(Date.now() - 1000) },
  });
  expect(await verifyEmailToken(user.verificationToken!)).toBeNull();
});

test("вход с верным паролем возвращает пользователя, с неверным — null", async () => {
  await registerOrganization({
    organizationName: "Тест-организация Вход",
    email,
    password: "пароль-12345",
  });

  expect(await signIn(email, "пароль-12345")).not.toBeNull();
  expect(await signIn(email, "не-тот-пароль")).toBeNull();
  expect(await signIn("никого@test-auth.kz", "пароль-12345")).toBeNull();
});

test("сессия по токену возвращает пользователя с его организацией", async () => {
  const { user, organization } = await registerOrganization({
    organizationName: "Тест-организация Сессия",
    email,
    password: "пароль-12345",
  });

  const token = await createSession(user.id);
  const current = await userFromSessionToken(token);

  expect(current?.user.id).toBe(user.id);
  expect(current?.organization.id).toBe(organization.id);
  expect(current?.role).toBe("OWNER");
});

test("неизвестный и просроченный токен не пускают", async () => {
  const { user } = await registerOrganization({
    organizationName: "Тест-организация Просрочка",
    email,
    password: "пароль-12345",
  });

  expect(await userFromSessionToken("нет-такого-токена")).toBeNull();
  expect(await userFromSessionToken("")).toBeNull();

  const token = await createSession(user.id);
  await prisma.session.update({
    where: { token },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });

  expect(await userFromSessionToken(token)).toBeNull();
});
