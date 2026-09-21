import { afterAll, beforeAll, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { returnConversationToBot } from "@/lib/ai-bot-store";
import { createTestOrg, dropTestOrg } from "./helpers";

const PHONE_ID = "return-to-bot-1";
let organizationId: string;
let otherOrgId: string;
let conversationId: string;

beforeAll(async () => {
  await dropTestOrg(PHONE_ID);
  await dropTestOrg(`${PHONE_ID}-b`);
  const org = await createTestOrg(PHONE_ID);
  organizationId = org.id;
  otherOrgId = (await createTestOrg(`${PHONE_ID}-b`)).id;

  const contact = await prisma.contact.create({
    data: { organizationId, channelId: org.channelId, externalUserId: "77001110000" },
  });
  const conversation = await prisma.conversation.create({
    data: { organizationId, contactId: contact.id, channelId: org.channelId, handedOffAt: new Date() },
  });
  conversationId = conversation.id;
});

afterAll(async () => {
  await dropTestOrg(PHONE_ID);
  await dropTestOrg(`${PHONE_ID}-b`);
});

test("чужая компания не может вернуть диалог боту", async () => {
  expect(await returnConversationToBot(otherOrgId, conversationId)).toBe(false);
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
  expect(conversation.handedOffAt).not.toBeNull();
});

test("возврат снимает отметку передачи, повторный — ничего не делает", async () => {
  expect(await returnConversationToBot(organizationId, conversationId)).toBe(true);
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
  expect(conversation.handedOffAt).toBeNull();

  expect(await returnConversationToBot(organizationId, conversationId)).toBe(false);
});
