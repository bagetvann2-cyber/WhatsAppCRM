/**
 * Создаёт компанию с владельцем и, если указан, привязывает к ней номер WhatsApp.
 * Для разработки: боевые аккаунты заводятся через экран регистрации.
 *
 * Запуск:
 *   npm run account -- "Компания" почта пароль [phoneNumberId]
 */
import { prisma } from "@/lib/db";
import { registerOrganization } from "@/lib/auth";

async function main() {
  const [organizationName, email, password, phoneNumberId] = process.argv.slice(2);

  if (!organizationName || !email || !password) {
    console.error('Нужно: "Название компании" почта пароль [phoneNumberId]');
    process.exitCode = 1;
    return;
  }

  const { user, organization } = await registerOrganization({
    organizationName,
    email,
    password,
  });

  console.log(`Компания:  ${organization.name} (${organization.id})`);
  console.log(`Владелец:  ${user.email}`);

  if (phoneNumberId) {
    const channel = await prisma.channel.upsert({
      where: { type_externalId: { type: "WHATSAPP", externalId: phoneNumberId } },
      update: { organizationId: organization.id },
      create: {
        organizationId: organization.id,
        type: "WHATSAPP",
        connectionMethod: "WA_MANUAL",
        name: "WhatsApp",
        status: "ACTIVE",
        externalId: phoneNumberId,
      },
    });
    console.log(`Номер:     ${channel.externalId} привязан к компании`);
  }

  await prisma.$disconnect();
}

void main();
