import { afterAll, expect, test } from "vitest";
import { prisma } from "@/lib/db";

afterAll(async () => {
  await prisma.message.deleteMany({ where: { wamid: "wamid.test.db" } });
  await prisma.conversation.deleteMany({ where: { phoneNumberId: "test-pnid" } });
  await prisma.contact.deleteMany({ where: { waId: "77010000001" } });
  await prisma.$disconnect();
});

test("сохраняет сообщение в цепочке контакт → диалог → сообщение", async () => {
  const contact = await prisma.contact.create({
    data: { waId: "77010000001", name: "Тест" },
  });
  const conversation = await prisma.conversation.create({
    data: { contactId: contact.id, phoneNumberId: "test-pnid" },
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
