import { afterAll, beforeEach, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import {
  countContacts,
  createTag,
  deleteTag,
  importContacts,
  listContacts,
  listTags,
  normalizePhone,
  parseContactsCsv,
  toCsv,
  toggleTag,
  updateContact,
} from "@/lib/contacts";
import { createTestOrg, dropTestOrg } from "./helpers";

const phoneNumberId = "PNID-CONTACTS";
let organizationId: string;
let channelId: string;

beforeEach(async () => {
  await dropTestOrg(phoneNumberId);
  const testOrg = await createTestOrg(phoneNumberId);
  organizationId = testOrg.id;
  channelId = testOrg.channelId;

  await prisma.contact.createMany({
    data: [
      { organizationId, channelId, externalUserId: "77011110001", name: "Айгерим" },
      {
        organizationId,
        channelId,
        externalUserId: "77011110002",
        name: "Ержан",
        note: "Просил перезвонить утром",
      },
      { organizationId, channelId, externalUserId: "77021110003", name: "Дана" },
    ],
  });
});

afterAll(async () => {
  await dropTestOrg(phoneNumberId);
  await prisma.$disconnect();
});

test("номер приводится к формату WhatsApp", () => {
  expect(normalizePhone("+7 747 771 66 54")).toBe("77477716654");
  expect(normalizePhone("8 747 771 66 54")).toBe("77477716654");
  expect(normalizePhone("7477716654")).toBe("77477716654");
  expect(normalizePhone("747 771")).toBeNull();
  expect(normalizePhone("не номер")).toBeNull();
});

test("CSV разбирается, заголовок и дубли отбрасываются", () => {
  const { rows, skipped } = parseContactsCsv(
    [
      "Телефон;Имя",
      "+7 701 111 00 04;Мадина",
      "8 701 111 00 05;Нурлан",
      "87011110005;Дубль",
      "мусор",
      "",
    ].join("\n"),
  );

  expect(rows).toEqual([
    { externalUserId: "77011110004", name: "Мадина" },
    { externalUserId: "77011110005", name: "Нурлан" },
  ]);
  // Пропущены: строка заголовка, дубль и мусор.
  expect(skipped).toBe(3);
});

test("импорт создаёт новых и не плодит дубли", async () => {
  const first = await importContacts(organizationId, [
    { externalUserId: "77011110001", name: "Айгерим" },
    { externalUserId: "77011110009", name: "Новый" },
  ]);

  expect(first).toEqual({ created: 1, updated: 0 });
  expect(await countContacts(organizationId)).toBe(4);

  const second = await importContacts(organizationId, [{ externalUserId: "77011110009", name: "Другое имя" }]);
  expect(second).toEqual({ created: 0, updated: 0 });
});

test("импорт дописывает имя, если его не было", async () => {
  await prisma.contact.create({ data: { organizationId, channelId, externalUserId: "77011110010" } });

  const result = await importContacts(organizationId, [{ externalUserId: "77011110010", name: "Асель" }]);

  expect(result).toEqual({ created: 0, updated: 1 });
  const contact = await prisma.contact.findFirstOrThrow({
    where: { organizationId, externalUserId: "77011110010" },
  });
  expect(contact.name).toBe("Асель");
});

test("поиск идёт по имени, номеру и заметке", async () => {
  expect(await listContacts(organizationId, { query: "айгерим" })).toHaveLength(1);
  expect(await listContacts(organizationId, { query: "7702" })).toHaveLength(1);
  expect(await listContacts(organizationId, { query: "перезвонить" })).toHaveLength(1);
});

test("метка создаётся один раз и ставится переключателем", async () => {
  const tag = await createTag(organizationId, "  постоянный  ");
  expect(tag.name).toBe("постоянный");

  const again = await createTag(organizationId, "постоянный");
  expect(again.id).toBe(tag.id);

  const contact = await prisma.contact.findFirstOrThrow({
    where: { organizationId, externalUserId: "77011110001" },
  });

  await toggleTag(organizationId, contact.id, tag.id);
  expect(await listContacts(organizationId, { tagIds: [tag.id] })).toHaveLength(1);

  await toggleTag(organizationId, contact.id, tag.id);
  expect(await listContacts(organizationId, { tagIds: [tag.id] })).toHaveLength(0);
});

test("несколько меток сужают выборку, а не расширяют", async () => {
  const vip = await createTag(organizationId, "постоянный");
  const braces = await createTag(organizationId, "брекеты");
  const contacts = await prisma.contact.findMany({ where: { organizationId } });

  await toggleTag(organizationId, contacts[0].id, vip.id);
  await toggleTag(organizationId, contacts[0].id, braces.id);
  await toggleTag(organizationId, contacts[1].id, vip.id);

  expect(await listContacts(organizationId, { tagIds: [vip.id] })).toHaveLength(2);
  expect(await listContacts(organizationId, { tagIds: [vip.id, braces.id] })).toHaveLength(1);
});

test("чужую метку поставить нельзя", async () => {
  const stranger = await createTestOrg("PNID-CONTACTS-2", "Чужая");
  const strangerTag = await createTag(stranger.id, "чужая метка");
  const contact = await prisma.contact.findFirstOrThrow({ where: { organizationId } });

  await toggleTag(organizationId, contact.id, strangerTag.id);

  expect(await prisma.contactTag.count({ where: { contactId: contact.id } })).toBe(0);
  await dropTestOrg("PNID-CONTACTS-2");
});

test("удаление метки снимает её со всех контактов", async () => {
  const tag = await createTag(organizationId, "на удаление");
  const contact = await prisma.contact.findFirstOrThrow({ where: { organizationId } });
  await toggleTag(organizationId, contact.id, tag.id);

  await deleteTag(organizationId, tag.id);

  expect(await listTags(organizationId)).toHaveLength(0);
  expect(await prisma.contactTag.count({ where: { contactId: contact.id } })).toBe(0);
});

test("имя и заметка сохраняются, пустое значение очищает поле", async () => {
  const contact = await prisma.contact.findFirstOrThrow({
    where: { organizationId, externalUserId: "77011110002" },
  });

  await updateContact(organizationId, contact.id, { name: "Ержан А.", note: "  " });

  const after = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
  expect(after.name).toBe("Ержан А.");
  expect(after.note).toBeNull();
});

test("выгрузка в CSV содержит заголовок и экранирует кавычки", async () => {
  const contact = await prisma.contact.findFirstOrThrow({
    where: { organizationId, externalUserId: "77011110001" },
  });
  await updateContact(organizationId, contact.id, { note: 'Просил «скидку" срочно' });

  const csv = toCsv(await listContacts(organizationId, { query: "77011110001" }));

  expect(csv.split("\n")[0]).toBe("Номер,Имя,Метки,Заметка");
  expect(csv).toContain('"Просил «скидку"" срочно"');
});
