import { afterAll, beforeEach, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import type { OrderFieldDef } from "@/lib/orders";
import {
  exportOrdersCsv,
  getOrderFields,
  getOrders,
  saveOrderFields,
  setOrderStatus,
  updateOrderField,
  upsertDraftOrderFields,
} from "@/lib/orders-store";
import { createTestOrg, dropTestOrg } from "./helpers";

const phoneNumberId = "PNID-ORDERS";
let organizationId: string;
let channelId: string;
let conversationId: string;

beforeEach(async () => {
  await dropTestOrg(phoneNumberId);
  const org = await createTestOrg(phoneNumberId);
  organizationId = org.id;
  channelId = org.channelId;

  const contact = await prisma.contact.create({
    data: { organizationId, channelId, externalUserId: "77012223344", name: "Клиент" },
  });
  const conversation = await prisma.conversation.create({
    data: { organizationId, contactId: contact.id, channelId },
  });
  conversationId = conversation.id;
});

afterAll(async () => {
  await dropTestOrg(phoneNumberId);
  await prisma.$disconnect();
});

test("схема полей сохраняется, читается по порядку и обновляется без потери id", async () => {
  await saveOrderFields(organizationId, [
    { label: "Товар", type: "TEXT", options: null, required: true },
    { label: "Размер", type: "SELECT", options: ["S", "M", "L"], required: false },
  ]);

  const fields = await getOrderFields(organizationId);
  expect(fields.map((f) => f.label)).toEqual(["Товар", "Размер"]);
  expect(fields[1].options).toEqual(["S", "M", "L"]);

  // Второе сохранение: одно поле правим по id, второе убираем, третье добавляем.
  await saveOrderFields(organizationId, [
    { id: fields[0].id, label: "Товар (артикул)", type: "TEXT", options: null, required: true },
    { label: "Количество", type: "NUMBER", options: null, required: false },
  ]);

  const updated = await getOrderFields(organizationId);
  expect(updated.map((f) => f.label)).toEqual(["Товар (артикул)", "Количество"]);
  expect(updated[0].id).toBe(fields[0].id);
});

test("бот создаёт черновик заказа и дополняет его следующим сообщением", async () => {
  const fieldDefs: OrderFieldDef[] = [
    { id: "f1", label: "Товар", type: "TEXT", options: null, required: true },
    { id: "f2", label: "Количество", type: "NUMBER", options: null, required: false },
  ];

  await upsertDraftOrderFields({
    organizationId,
    conversationId,
    fields: { f1: "Кроссовки" },
    fieldDefs,
  });

  let orders = await getOrders(organizationId);
  expect(orders).toHaveLength(1);
  expect(orders[0].status).toBe("DRAFT");
  expect(orders[0].fields).toEqual({ f1: "Кроссовки" });

  await upsertDraftOrderFields({
    organizationId,
    conversationId,
    fields: { f2: "2" },
    fieldDefs,
  });

  orders = await getOrders(organizationId);
  expect(orders).toHaveLength(1);
  expect(orders[0].fields).toEqual({ f1: "Кроссовки", f2: 2 });
});

test("пустой набор полей (все неизвестные ключи) не создаёт заказ", async () => {
  await upsertDraftOrderFields({
    organizationId,
    conversationId,
    fields: { unknown: "значение" },
    fieldDefs: [{ id: "f1", label: "Товар", type: "TEXT", options: null, required: false }],
  });

  expect(await getOrders(organizationId)).toHaveLength(0);
});

test("подтверждение и отмена работают только из черновика", async () => {
  const order = await prisma.order.create({
    data: { organizationId, conversationId, fields: { f1: "Кроссовки" } },
  });

  await setOrderStatus(organizationId, order.id, "CONFIRMED");
  const confirmed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  expect(confirmed.status).toBe("CONFIRMED");
  expect(confirmed.confirmedAt).not.toBeNull();

  // Уже подтверждён — повторная отмена не должна ничего изменить.
  await setOrderStatus(organizationId, order.id, "CANCELLED");
  const stillConfirmed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  expect(stillConfirmed.status).toBe("CONFIRMED");
});

test("оператор правит поле вручную, пустое значение удаляет его из заказа", async () => {
  const order = await prisma.order.create({
    data: { organizationId, conversationId, fields: { f1: "Кроссовки" } },
  });

  await updateOrderField(organizationId, order.id, "f1", "Кеды");
  let updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  expect(updated.fields).toEqual({ f1: "Кеды" });

  await updateOrderField(organizationId, order.id, "f1", "  ");
  updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  expect(updated.fields).toEqual({});
});

test("выгрузка CSV содержит заказ с колонками по текущей схеме полей", async () => {
  await saveOrderFields(organizationId, [{ label: "Товар", type: "TEXT", options: null, required: true }]);
  const [field] = await getOrderFields(organizationId);

  await prisma.order.create({
    data: { organizationId, conversationId, fields: { [field.id]: "Кроссовки" } },
  });

  const csv = await exportOrdersCsv(organizationId);
  expect(csv).toContain("Товар");
  expect(csv).toContain("Клиент");
  expect(csv).toContain("Кроссовки");
});
