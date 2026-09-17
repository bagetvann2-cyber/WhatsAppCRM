import { expect, test } from "vitest";
import { buildOrdersCsv, cleanOrderFields, type OrderFieldDef } from "@/lib/orders";

const fields: OrderFieldDef[] = [
  { id: "f1", label: "Товар", type: "TEXT", options: null, required: true },
  { id: "f2", label: "Количество", type: "NUMBER", options: null, required: false },
  { id: "f3", label: "Размер", type: "SELECT", options: ["S", "M", "L"], required: false },
];

test("оставляет только известные поля и приводит типы", () => {
  const clean = cleanOrderFields(
    { f1: "Кроссовки", f2: "2", f3: "M", unknown: "мусор" },
    fields,
  );

  expect(clean).toEqual({ f1: "Кроссовки", f2: 2, f3: "M" });
});

test("отбрасывает нечисловое значение числового поля и невалидный вариант списка", () => {
  const clean = cleanOrderFields({ f1: "Кроссовки", f2: "много", f3: "XXL" }, fields);

  expect(clean).toEqual({ f1: "Кроссовки" });
});

test("пустая строка и null/undefined не попадают в результат", () => {
  const clean = cleanOrderFields({ f1: "  ", f2: null, f3: undefined }, fields);
  expect(clean).toEqual({});
});

test("CSV начинается с BOM и содержит заголовки из label полей", () => {
  const csv = buildOrdersCsv(fields, [
    { contactName: "Дана", status: "DRAFT", createdAt: new Date("2026-09-17T10:00:00Z"), fields: { f1: "Кроссовки", f2: 2 } },
  ]);

  expect(csv.startsWith("﻿")).toBe(true);
  expect(csv).toContain("Контакт,Статус,Создан,Товар,Количество,Размер");
  expect(csv).toContain("Дана,Черновик");
  expect(csv).toContain("Кроссовки,2,");
});

test("значение с запятой в CSV экранируется кавычками", () => {
  const csv = buildOrdersCsv(fields, [
    { contactName: "Ержан, ИП", status: "CONFIRMED", createdAt: new Date(), fields: {} },
  ]);

  expect(csv).toContain('"Ержан, ИП"');
});
