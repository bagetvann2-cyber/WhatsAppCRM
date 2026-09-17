import { prisma } from "@/lib/db";

/**
 * Общая заготовка для тестов: компания с подключённым каналом WhatsApp.
 * Каждый тестовый файл работает со своим phoneNumberId, поэтому файлы
 * не мешают друг другу при параллельном запуске.
 */
export async function createTestOrg(phoneNumberId: string, name = `Тест ${phoneNumberId}`) {
  const organization = await prisma.organization.create({ data: { name } });
  const channel = await prisma.channel.create({
    data: {
      organizationId: organization.id,
      type: "WHATSAPP",
      connectionMethod: "WA_MANUAL",
      name: "WhatsApp",
      status: "ACTIVE",
      externalId: phoneNumberId,
      externalUsername: "+1 555 000 0000",
    },
  });
  // Возвращаем организацию как раньше (везде используют .id) плюс id канала —
  // он нужен тестам, которые сами создают Contact/Conversation/Message.
  return { ...organization, channelId: channel.id };
}

/** Убирает компанию со всем, что к ней привязано: каскад разберёт остальное. */
export async function dropTestOrg(phoneNumberId: string) {
  const channel = await prisma.channel.findUnique({
    where: { type_externalId: { type: "WHATSAPP", externalId: phoneNumberId } },
  });
  if (channel) {
    await prisma.organization.deleteMany({ where: { id: channel.organizationId } });
  }
}
