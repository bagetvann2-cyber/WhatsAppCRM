import { afterAll, beforeAll, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { createTestOrg, dropTestOrg } from "./helpers";

const phoneNumberId = "test-pnid";
let organizationId: string;

beforeAll(async () => {
  await dropTestOrg(phoneNumberId);
  organizationId = (await createTestOrg(phoneNumberId)).id;
});

afterAll(async () => {
  await dropTestOrg(phoneNumberId);
  await prisma.$disconnect();
});

test("сохраняет сообщение в цепочке контакт → диалог → сообщение", async () => {
  const contact = await prisma.contact.create({
    data: { organizationId, waId: "77010000001", name: "Тест" },
  });
  const conversation = await prisma.conversation.create({
    data: { organizationId, contactId: contact.id, phoneNumberId },
  });
  const message = await prisma.message.create({
    data: {
      wamid: "wamid.test.db",
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
  const contact = await prisma.contact.create({
    data: { organizationId: organization.id, waId: "77010000009" },
  });
  await prisma.conversation.create({
    data: { organizationId: organization.id, contactId: contact.id, phoneNumberId: "pnid-drop" },
  });

  await prisma.organization.delete({ where: { id: organization.id } });

  expect(await prisma.contact.findUnique({ where: { id: contact.id } })).toBeNull();
  expect(await prisma.conversation.count({ where: { phoneNumberId: "pnid-drop" } })).toBe(0);
});
