import { prisma } from "@/lib/db";

/**
 * Общая заготовка для тестов: компания с подключённым номером.
 * Каждый тестовый файл работает со своим phoneNumberId, поэтому файлы
 * не мешают друг другу при параллельном запуске.
 */
export async function createTestOrg(phoneNumberId: string, name = `Тест ${phoneNumberId}`) {
  const organization = await prisma.organization.create({ data: { name } });
  await prisma.whatsappNumber.create({
    data: { organizationId: organization.id, phoneNumberId, displayNumber: "+1 555 000 0000" },
  });
  return organization;
}

/** Убирает компанию со всем, что к ней привязано: каскад разберёт остальное. */
export async function dropTestOrg(phoneNumberId: string) {
  const number = await prisma.whatsappNumber.findUnique({ where: { phoneNumberId } });
  if (number) {
    await prisma.organization.deleteMany({ where: { id: number.organizationId } });
  }
}
