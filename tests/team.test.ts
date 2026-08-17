import { afterAll, beforeEach, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { registerOrganization, signIn } from "@/lib/auth";
import {
  acceptInvite,
  canManageTeam,
  checkInvite,
  createInvite,
  listInvites,
  listMembers,
  revokeInvite,
} from "@/lib/team";

const domain = "@test-team.kz";
let organizationId: string;

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { endsWith: domain } } });
  await prisma.organization.deleteMany({ where: { name: { startsWith: "Команда-тест" } } });
}

beforeEach(async () => {
  await cleanup();
  const { organization } = await registerOrganization({
    organizationName: "Команда-тест Клиника",
    email: `owner${domain}`,
    password: "пароль-владельца",
    name: "Айгерим",
  });
  organizationId = organization.id;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("управлять командой может владелец и администратор, оператор — нет", () => {
  expect(canManageTeam("OWNER")).toBe(true);
  expect(canManageTeam("ADMIN")).toBe(true);
  expect(canManageTeam("OPERATOR")).toBe(false);
});

test("после регистрации в компании один участник — владелец", async () => {
  const members = await listMembers(organizationId);

  expect(members).toHaveLength(1);
  expect(members[0].role).toBe("OWNER");
  expect(members[0].user.email).toBe(`owner${domain}`);
});

test("приглашение создаётся с токеном и сроком, и видно в списке активных", async () => {
  const invite = await createInvite({
    organizationId,
    role: "OPERATOR",
    hint: "Для Ержана",
  });

  expect(invite.token).toHaveLength(48);
  expect(invite.expiresAt.getTime()).toBeGreaterThan(Date.now());
  expect(invite.acceptedAt).toBeNull();

  const active = await listInvites(organizationId);
  expect(active.map((i) => i.id)).toContain(invite.id);
  expect(active[0].hint).toBe("Для Ержана");
});

test("по ссылке видно компанию и роль до заполнения формы", async () => {
  const invite = await createInvite({ organizationId, role: "OPERATOR" });
  const check = await checkInvite(invite.token);

  expect(check).toEqual({
    ok: true,
    invite: { id: invite.id, role: "OPERATOR", organizationName: "Команда-тест Клиника" },
  });
});

test("принятие приглашения вводит человека в компанию с нужной ролью", async () => {
  const invite = await createInvite({ organizationId, role: "OPERATOR" });

  await acceptInvite({
    token: invite.token,
    email: `operator${domain}`,
    password: "пароль-оператора",
    name: "Ержан",
  });

  const members = await listMembers(organizationId);
  expect(members).toHaveLength(2);
  expect(members[1].role).toBe("OPERATOR");
  expect(members[1].user.name).toBe("Ержан");

  expect(await signIn(`operator${domain}`, "пароль-оператора")).not.toBeNull();
});

test("повторное использование ссылки отклоняется", async () => {
  const invite = await createInvite({ organizationId, role: "OPERATOR" });

  await acceptInvite({
    token: invite.token,
    email: `first${domain}`,
    password: "пароль-первого",
  });

  await expect(
    acceptInvite({
      token: invite.token,
      email: `second${domain}`,
      password: "пароль-второго",
    }),
  ).rejects.toThrow(/уже зарегистрировались/i);

  expect(await listMembers(organizationId)).toHaveLength(2);
});

test("просроченная ссылка не принимается", async () => {
  const invite = await createInvite({ organizationId, role: "OPERATOR" });
  await prisma.invite.update({
    where: { id: invite.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });

  expect(await checkInvite(invite.token)).toEqual({ ok: false, reason: "expired" });
  await expect(
    acceptInvite({ token: invite.token, email: `late${domain}`, password: "пароль" }),
  ).rejects.toThrow(/срок действия/i);
});

test("выдуманная ссылка не принимается", async () => {
  expect(await checkInvite("нет-такого-токена")).toEqual({ ok: false, reason: "not-found" });
  expect(await checkInvite("")).toEqual({ ok: false, reason: "not-found" });
});

test("занятый адрес почты по приглашению не проходит", async () => {
  const invite = await createInvite({ organizationId, role: "OPERATOR" });

  await expect(
    acceptInvite({ token: invite.token, email: `owner${domain}`, password: "пароль" }),
  ).rejects.toThrow(/уже зарегистрирован/i);

  // Ссылка при неудаче не должна сгореть
  expect(await checkInvite(invite.token)).toMatchObject({ ok: true });
});

test("отозванная ссылка перестаёт работать", async () => {
  const invite = await createInvite({ organizationId, role: "ADMIN" });
  await revokeInvite(organizationId, invite.id);

  expect(await checkInvite(invite.token)).toEqual({ ok: false, reason: "not-found" });
});

test("чужую ссылку отозвать нельзя", async () => {
  const invite = await createInvite({ organizationId, role: "ADMIN" });
  const stranger = await registerOrganization({
    organizationName: "Команда-тест Чужая",
    email: `stranger${domain}`,
    password: "пароль-чужого",
  });

  await revokeInvite(stranger.organization.id, invite.id);

  expect(await checkInvite(invite.token)).toMatchObject({ ok: true });
});
