import { afterAll, beforeEach, expect, test } from "vitest";
import { assignConversation, canAssign, queueCounts } from "@/lib/assignment";
import { prisma } from "@/lib/db";
import { listConversations } from "@/lib/conversations";
import { saveIncomingMessage } from "@/lib/ingest";
import { createTestOrg, dropTestOrg } from "./helpers";

const phoneNumberId = "PNID-ASSIGN";
const strangerNumberId = "PNID-ASSIGN-2";

let organizationId: string;
let ownerId: string;
let operatorId: string;
let otherOperatorId: string;

async function member(email: string, role: "OWNER" | "OPERATOR", name: string) {
  const user = await prisma.user.create({
    data: { email, passwordHash: "x", name },
  });
  await prisma.membership.create({ data: { userId: user.id, organizationId, role } });
  return user.id;
}

async function conversation(waId: string, wamid: string) {
  const result = await saveIncomingMessage({
    channelType: "WHATSAPP",
    externalMessageId: `${phoneNumberId}.${wamid}`,
    from: waId,
    profileName: "Клиент",
    channelExternalId: phoneNumberId,
    type: "text",
    text: "Здравствуйте",
    media: null,
    timestamp: new Date(),
  });

  if (!result.stored) {
    throw new Error("сообщение должно сохраниться");
  }
  return result.conversationId;
}

beforeEach(async () => {
  await dropTestOrg(phoneNumberId);
  await prisma.user.deleteMany({ where: { email: { endsWith: "@assign.test" } } });

  organizationId = (await createTestOrg(phoneNumberId)).id;
  ownerId = await member("owner@assign.test", "OWNER", "Владелец");
  operatorId = await member("operator@assign.test", "OPERATOR", "Асель");
  otherOperatorId = await member("other@assign.test", "OPERATOR", "Ержан");
});

afterAll(async () => {
  await dropTestOrg(phoneNumberId);
  await dropTestOrg(strangerNumberId);
  await prisma.user.deleteMany({ where: { email: { endsWith: "@assign.test" } } });
  await prisma.$disconnect();
});

test("руководитель распоряжается очередью, оператор — только собой", () => {
  const owner = { userId: "owner", role: "OWNER" as const };
  const operator = { userId: "op", role: "OPERATOR" as const };

  expect(canAssign({ actor: owner, assigneeId: "кто-угодно", currentAssigneeId: "чужой" })).toEqual({
    allowed: true,
  });
  expect(canAssign({ actor: owner, assigneeId: null, currentAssigneeId: "чужой" })).toEqual({
    allowed: true,
  });

  // Свободный диалог оператор берёт себе
  expect(canAssign({ actor: operator, assigneeId: "op", currentAssigneeId: null })).toEqual({
    allowed: true,
  });
  // И отпускает свой
  expect(canAssign({ actor: operator, assigneeId: null, currentAssigneeId: "op" })).toEqual({
    allowed: true,
  });

  // Но не отбирает чужой и не назначает других
  expect(canAssign({ actor: operator, assigneeId: "op", currentAssigneeId: "чужой" })).toMatchObject(
    { allowed: false },
  );
  expect(canAssign({ actor: operator, assigneeId: "другой", currentAssigneeId: null })).toMatchObject(
    { allowed: false },
  );
  expect(canAssign({ actor: operator, assigneeId: null, currentAssigneeId: "чужой" })).toMatchObject(
    { allowed: false },
  );
});

test("оператор берёт свободный диалог и отпускает его", async () => {
  const id = await conversation("77011110001", "IN.1");

  const taken = await assignConversation({
    organizationId,
    conversationId: id,
    assigneeId: operatorId,
    actor: { userId: operatorId, role: "OPERATOR" },
  });
  expect(taken).toEqual({ ok: true, assigneeId: operatorId });

  const withOwner = await prisma.conversation.findUniqueOrThrow({ where: { id } });
  expect(withOwner.assigneeId).toBe(operatorId);
  expect(withOwner.assignedAt).not.toBeNull();

  const freed = await assignConversation({
    organizationId,
    conversationId: id,
    assigneeId: null,
    actor: { userId: operatorId, role: "OPERATOR" },
  });
  expect(freed).toEqual({ ok: true, assigneeId: null });

  const after = await prisma.conversation.findUniqueOrThrow({ where: { id } });
  expect(after.assigneeId).toBeNull();
  expect(after.assignedAt).toBeNull();
});

test("чужой диалог оператор не отбирает, а руководитель переназначает", async () => {
  const id = await conversation("77011110002", "IN.2");

  await assignConversation({
    organizationId,
    conversationId: id,
    assigneeId: otherOperatorId,
    actor: { userId: ownerId, role: "OWNER" },
  });

  const stolen = await assignConversation({
    organizationId,
    conversationId: id,
    assigneeId: operatorId,
    actor: { userId: operatorId, role: "OPERATOR" },
  });
  expect(stolen).toMatchObject({ ok: false });

  const stillOther = await prisma.conversation.findUniqueOrThrow({ where: { id } });
  expect(stillOther.assigneeId).toBe(otherOperatorId);

  const reassigned = await assignConversation({
    organizationId,
    conversationId: id,
    assigneeId: operatorId,
    actor: { userId: ownerId, role: "OWNER" },
  });
  expect(reassigned).toEqual({ ok: true, assigneeId: operatorId });
});

test("назначить можно только сотрудника этого кабинета", async () => {
  const id = await conversation("77011110003", "IN.3");

  const stranger = await createTestOrg(strangerNumberId);
  const outsider = await prisma.user.create({
    data: { email: "outsider@assign.test", passwordHash: "x" },
  });
  await prisma.membership.create({
    data: { userId: outsider.id, organizationId: stranger.id, role: "OPERATOR" },
  });

  const result = await assignConversation({
    organizationId,
    conversationId: id,
    assigneeId: outsider.id,
    actor: { userId: ownerId, role: "OWNER" },
  });

  expect(result).toMatchObject({ ok: false });
  const untouched = await prisma.conversation.findUniqueOrThrow({ where: { id } });
  expect(untouched.assigneeId).toBeNull();

  await dropTestOrg(strangerNumberId);
});

test("чужой диалог не назначается даже своим сотрудником", async () => {
  const stranger = await createTestOrg(strangerNumberId);
  const foreignContact = await prisma.contact.create({
    data: { organizationId: stranger.id, channelId: stranger.channelId, externalUserId: "77011110004" },
  });
  const foreign = await prisma.conversation.create({
    data: {
      organizationId: stranger.id,
      contactId: foreignContact.id,
      channelId: stranger.channelId,
    },
  });

  const result = await assignConversation({
    organizationId,
    conversationId: foreign.id,
    assigneeId: operatorId,
    actor: { userId: ownerId, role: "OWNER" },
  });

  expect(result).toMatchObject({ ok: false, error: "Диалог не найден" });

  await dropTestOrg(strangerNumberId);
});

test("вкладки показывают свои и свободные диалоги", async () => {
  const mine = await conversation("77011110005", "IN.5");
  const free = await conversation("77011110006", "IN.6");

  await assignConversation({
    organizationId,
    conversationId: mine,
    assigneeId: operatorId,
    actor: { userId: operatorId, role: "OPERATOR" },
  });

  const all = await listConversations(organizationId, "", { scope: "all", userId: operatorId });
  const own = await listConversations(organizationId, "", { scope: "mine", userId: operatorId });
  const unassigned = await listConversations(organizationId, "", {
    scope: "free",
    userId: operatorId,
  });

  expect(all).toHaveLength(2);
  expect(own.map((c) => c.id)).toEqual([mine]);
  expect(unassigned.map((c) => c.id)).toEqual([free]);
  expect(own[0].assignee?.name).toBe("Асель");

  expect(await queueCounts(organizationId, operatorId)).toEqual({ mine: 1, free: 1 });
});

test("уволенный сотрудник не уносит диалог с собой", async () => {
  const id = await conversation("77011110007", "IN.7");

  await assignConversation({
    organizationId,
    conversationId: id,
    assigneeId: operatorId,
    actor: { userId: ownerId, role: "OWNER" },
  });

  await prisma.user.delete({ where: { id: operatorId } });

  const after = await prisma.conversation.findUniqueOrThrow({ where: { id } });
  expect(after.assigneeId).toBeNull();
});
