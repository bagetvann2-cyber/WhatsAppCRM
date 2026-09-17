import { afterAll, beforeAll, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { createTestOrg, dropTestOrg } from "./helpers";

const phoneNumberId = "test-pnid";
let organizationId: string;
let channelId: string;

beforeAll(async () => {
  await dropTestOrg(phoneNumberId);
  const testOrg = await createTestOrg(phoneNumberId);
  organizationId = testOrg.id;
  channelId = testOrg.channelId;
});

afterAll(async () => {
  await dropTestOrg(phoneNumberId);
  await prisma.$disconnect();
});

test("сохраняет сообщение в цепочке контакт → диалог → сообщение", async () => {
  const contact = await prisma.contact.create({
    data: { organizationId, channelId, externalUserId: "77010000001", name: "Тест" },
  });
  const conversation = await prisma.conversation.create({
    data: { organizationId, contactId: contact.id, channelId },
  });
  const message = await prisma.message.create({
    data: {
      externalMessageId: "wamid.test.db",
      channelId,
      conversationId: conversation.id,
      direction: "INBOUND",
      type: "text",
      text: "Здравствуйте",
      timestamp: new Date("2026-08-16T10:00:00Z"),
    },
  });

  expect(message.text).toBe("Здравствуйте");
  expect(message.direction).toBe("INBOUND");
});

test("удаление компании уносит её контакты и переписку", async () => {
  const organization = await prisma.organization.create({ data: { name: "На удаление" } });
  const channel = await prisma.channel.create({
    data: {
      organizationId: organization.id,
      type: "WHATSAPP",
      connectionMethod: "WA_MANUAL",
      name: "WhatsApp",
      status: "ACTIVE",
      externalId: "pnid-drop",
    },
  });
  const contact = await prisma.contact.create({
    data: { organizationId: organization.id, channelId: channel.id, externalUserId: "77010000009" },
  });
  await prisma.conversation.create({
    data: { organizationId: organization.id, contactId: contact.id, channelId: channel.id },
  });

  await prisma.organization.delete({ where: { id: organization.id } });

  expect(await prisma.contact.findUnique({ where: { id: contact.id } })).toBeNull();
  expect(await prisma.conversation.count({ where: { channelId: channel.id } })).toBe(0);
});
