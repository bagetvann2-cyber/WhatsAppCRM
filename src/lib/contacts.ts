import { prisma } from "@/lib/db";

export type ContactFilter = {
  query?: string;
  tagIds?: string[];
};

/** Условие выборки контактов — одно на список, импорт и сегмент рассылки. */
export function contactWhere(organizationId: string, filter: ContactFilter = {}) {
  const q = filter.query?.trim();
  const tagIds = filter.tagIds?.filter(Boolean) ?? [];

  return {
    organizationId,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { waId: { contains: q } },
            { note: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    // Несколько меток сужают выборку: нужны все выбранные, а не любая из них.
    ...(tagIds.length > 0
      ? { AND: tagIds.map((tagId) => ({ tags: { some: { tagId } } })) }
      : {}),
  };
}

export async function listContacts(organizationId: string, filter: ContactFilter = {}) {
  return prisma.contact.findMany({
    where: contactWhere(organizationId, filter),
    orderBy: { createdAt: "desc" },
    include: { tags: { include: { tag: true } } },
  });
}

export type ContactListItem = Awaited<ReturnType<typeof listContacts>>[number];

export async function countContacts(organizationId: string, filter: ContactFilter = {}) {
  return prisma.contact.count({ where: contactWhere(organizationId, filter) });
}

export async function listTags(organizationId: string) {
  return prisma.tag.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
    include: { _count: { select: { contacts: true } } },
  });
}

export async function createTag(organizationId: string, name: string) {
  const clean = name.trim();
  if (!clean) {
    throw new Error("Название метки не может быть пустым.");
  }

  const existing = await prisma.tag.findFirst({ where: { organizationId, name: clean } });
  if (existing) {
    return existing;
  }

  return prisma.tag.create({ data: { organizationId, name: clean } });
}

export async function deleteTag(organizationId: string, tagId: string): Promise<void> {
  await prisma.tag.deleteMany({ where: { id: tagId, organizationId } });
}

/** Ставит или снимает метку. Обе операции проверяют, что и контакт, и метка наши. */
export async function toggleTag(
  organizationId: string,
  contactId: string,
  tagId: string,
): Promise<void> {
  const [contact, tag] = await Promise.all([
    prisma.contact.findFirst({ where: { id: contactId, organizationId } }),
    prisma.tag.findFirst({ where: { id: tagId, organizationId } }),
  ]);

  if (!contact || !tag) {
    return;
  }

  const existing = await prisma.contactTag.findUnique({
    where: { contactId_tagId: { contactId, tagId } },
  });

  if (existing) {
    await prisma.contactTag.delete({ where: { contactId_tagId: { contactId, tagId } } });
  } else {
    await prisma.contactTag.create({ data: { contactId, tagId } });
  }
}

export async function updateContact(
  organizationId: string,
  contactId: string,
  data: { name?: string; note?: string },
): Promise<void> {
  await prisma.contact.updateMany({
    where: { id: contactId, organizationId },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() || null } : {}),
      ...(data.note !== undefined ? { note: data.note.trim() || null } : {}),
    },
  });
}

/** Приводит номер к виду, в котором его понимает WhatsApp: только цифры, 8 → 7. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) {
    return null;
  }

  if (digits.length === 11 && digits.startsWith("8")) {
    return `7${digits.slice(1)}`;
  }
  if (digits.length === 10 && digits.startsWith("7")) {
    return `7${digits}`;
  }
  return digits;
}

export type ImportRow = { waId: string; name: string | null };

/**
 * Разбирает CSV: первая колонка — номер, вторая — имя. Заголовок распознаётся
 * по отсутствию цифр в первой ячейке. Разделитель — запятая или точка с запятой.
 */
export function parseContactsCsv(text: string): { rows: ImportRow[]; skipped: number } {
  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const cells = trimmed.split(/[;,\t]/).map((cell) => cell.trim().replace(/^"|"$/g, ""));
    const waId = normalizePhone(cells[0] ?? "");

    if (!waId) {
      skipped += 1;
      continue;
    }
    if (seen.has(waId)) {
      skipped += 1;
      continue;
    }

    seen.add(waId);
    rows.push({ waId, name: cells[1]?.trim() || null });
  }

  return { rows, skipped };
}

/** Импорт без дублей: существующий контакт обновляет имя, если оно было пустым. */
export async function importContacts(
  organizationId: string,
  rows: ImportRow[],
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const existing = await prisma.contact.findUnique({
      where: { organizationId_waId: { organizationId, waId: row.waId } },
    });

    if (!existing) {
      await prisma.contact.create({
        data: { organizationId, waId: row.waId, name: row.name, source: "Импорт" },
      });
      created += 1;
      continue;
    }

    if (!existing.name && row.name) {
      await prisma.contact.update({ where: { id: existing.id }, data: { name: row.name } });
      updated += 1;
    }
  }

  return { created, updated };
}

/** Выгрузка в CSV: номер, имя, метки, заметка. */
export function toCsv(contacts: ContactListItem[]): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = ["Номер,Имя,Метки,Заметка"];

  for (const contact of contacts) {
    lines.push(
      [
        escape(contact.waId),
        escape(contact.name ?? ""),
        escape(contact.tags.map((t) => t.tag.name).join(", ")),
        escape(contact.note ?? ""),
      ].join(","),
    );
  }

  return lines.join("\n");
}
