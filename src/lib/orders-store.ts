import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { buildOrdersCsv, cleanOrderFields, type OrderFieldDef, type OrderFieldType } from "@/lib/orders";

export async function getOrderFields(organizationId: string): Promise<OrderFieldDef[]> {
  const rows = await prisma.orderField.findMany({
    where: { organizationId },
    orderBy: { position: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    type: row.type as OrderFieldType,
    options: (row.options as string[] | null) ?? null,
    required: row.required,
  }));
}

export type OrderFieldInput = {
  id?: string;
  label: string;
  type: OrderFieldType;
  options: string[] | null;
  required: boolean;
};

/** Полностью заменяет схему полей: страница настроек присылает весь список разом. */
export async function saveOrderFields(organizationId: string, fields: OrderFieldInput[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.orderField.findMany({
      where: { organizationId },
      select: { id: true },
    });
    const keepIds = new Set(fields.map((field) => field.id).filter((id): id is string => Boolean(id)));
    const toDelete = existing.filter((row) => !keepIds.has(row.id)).map((row) => row.id);

    if (toDelete.length > 0) {
      await tx.orderField.deleteMany({ where: { id: { in: toDelete } } });
    }

    for (const [index, field] of fields.entries()) {
      const data = {
        label: field.label,
        type: field.type,
        options:
          field.type === "SELECT" && field.options ? (field.options as Prisma.InputJsonValue) : Prisma.DbNull,
        required: field.required,
        position: index,
      };

      if (field.id) {
        await tx.orderField.update({ where: { id: field.id }, data });
      } else {
        await tx.orderField.create({ data: { organizationId, ...data } });
      }
    }
  });
}

/** Дополняет черновик заказа полями, которые бот только что узнал в переписке. */
export async function upsertDraftOrderFields(input: {
  organizationId: string;
  conversationId: string;
  fields: Record<string, unknown>;
  fieldDefs: OrderFieldDef[];
}): Promise<void> {
  const clean = cleanOrderFields(input.fields, input.fieldDefs);
  if (Object.keys(clean).length === 0) {
    return;
  }

  const existing = await prisma.order.findFirst({
    where: { conversationId: input.conversationId, status: "DRAFT" },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    await prisma.order.update({
      where: { id: existing.id },
      data: {
        fields: {
          ...(existing.fields as Record<string, unknown>),
          ...clean,
        } as Prisma.InputJsonValue,
      },
    });
    return;
  }

  await prisma.order.create({
    data: {
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      fields: clean as Prisma.InputJsonValue,
    },
  });
}

export async function getOrders(organizationId: string, status?: "DRAFT" | "CONFIRMED" | "CANCELLED") {
  return prisma.order.findMany({
    where: { organizationId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    include: { conversation: { include: { contact: true } } },
  });
}

export async function getOrder(organizationId: string, orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, organizationId },
    include: { conversation: { include: { contact: true } } },
  });
}

/** Заказ можно подтвердить или отменить только из черновика — второй клик ничего не меняет. */
export async function setOrderStatus(
  organizationId: string,
  orderId: string,
  status: "CONFIRMED" | "CANCELLED",
): Promise<void> {
  await prisma.order.updateMany({
    where: { id: orderId, organizationId, status: "DRAFT" },
    data: { status, ...(status === "CONFIRMED" ? { confirmedAt: new Date() } : {}) },
  });
}

/** Ручная правка одного поля оператором. Пустое значение — поле удаляется из заказа. */
export async function updateOrderField(
  organizationId: string,
  orderId: string,
  fieldId: string,
  value: string,
): Promise<void> {
  const order = await prisma.order.findFirst({ where: { id: orderId, organizationId } });
  if (!order) {
    return;
  }

  const fields = { ...(order.fields as Record<string, unknown>) };
  if (value.trim()) {
    fields[fieldId] = value.trim();
  } else {
    delete fields[fieldId];
  }

  await prisma.order.update({ where: { id: orderId }, data: { fields: fields as Prisma.InputJsonValue } });
}

export async function exportOrdersCsv(organizationId: string): Promise<string> {
  const [fieldDefs, orders] = await Promise.all([getOrderFields(organizationId), getOrders(organizationId)]);

  return buildOrdersCsv(
    fieldDefs,
    orders.map((order) => ({
      contactName: order.conversation.contact.name ?? order.conversation.contact.externalUserId,
      status: order.status,
      createdAt: order.createdAt,
      fields: order.fields as Record<string, unknown>,
    })),
  );
}
