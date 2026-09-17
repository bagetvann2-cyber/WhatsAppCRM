export type OrderFieldType = "TEXT" | "NUMBER" | "DATE" | "SELECT";

/** Поле заказа так, как его видит бот и формы кабинета — без Prisma-обвязки. */
export type OrderFieldDef = {
  id: string;
  label: string;
  type: OrderFieldType;
  options: string[] | null;
  required: boolean;
};

export const ORDER_FIELD_TYPES: { value: OrderFieldType; label: string }[] = [
  { value: "TEXT", label: "Текст" },
  { value: "NUMBER", label: "Число" },
  { value: "DATE", label: "Дата" },
  { value: "SELECT", label: "Список вариантов" },
];

export const ORDER_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Черновик",
  CONFIRMED: "Подтверждён",
  CANCELLED: "Отменён",
};

/**
 * Оставляет только значения, описанные текущей схемой полей организации,
 * и приводит их к нужному типу. Бот мог прислать поле, которого больше нет
 * в схеме (её поменяли между сообщениями), или число текстом — оба случая
 * не должны портить уже сохранённый заказ.
 */
export function cleanOrderFields(
  raw: Record<string, unknown>,
  fieldDefs: OrderFieldDef[],
): Record<string, string | number> {
  const byId = new Map(fieldDefs.map((field) => [field.id, field]));
  const clean: Record<string, string | number> = {};

  for (const [id, value] of Object.entries(raw)) {
    const def = byId.get(id);
    if (!def || value === null || value === undefined) {
      continue;
    }

    if (def.type === "NUMBER") {
      const num = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(num)) {
        clean[id] = num;
      }
      continue;
    }

    const text = String(value).trim();
    if (!text) {
      continue;
    }
    if (def.type === "SELECT" && def.options && !def.options.includes(text)) {
      continue;
    }
    clean[id] = text;
  }

  return clean;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export type OrderCsvRow = {
  contactName: string;
  status: string;
  createdAt: Date;
  fields: Record<string, unknown>;
};

/** CSV с BOM — без него Excel на Windows показывает кириллицу кракозябрами. */
export function buildOrdersCsv(fieldDefs: OrderFieldDef[], rows: OrderCsvRow[]): string {
  const header = ["Контакт", "Статус", "Создан", ...fieldDefs.map((field) => field.label)];
  const lines = [header.map(csvCell).join(",")];

  for (const row of rows) {
    const cells = [
      row.contactName,
      ORDER_STATUS_LABEL[row.status] ?? row.status,
      row.createdAt.toLocaleString("ru-RU"),
      ...fieldDefs.map((field) => {
        const value = row.fields[field.id];
        return value === undefined || value === null ? "" : String(value);
      }),
    ];
    lines.push(cells.map(csvCell).join(","));
  }

  return "﻿" + lines.join("\r\n");
}
