/**
 * Наполняет кабинет правдоподобными данными для показа заказчику.
 * Ничего не отправляет наружу — только пишет в локальную базу.
 *
 *   npm run demo -- почта-владельца        # наполнить
 *   npm run demo -- почта-владельца clean  # убрать демо-данные
 */
import { prisma } from "@/lib/db";

const DEMO_PREFIX = "demo.";

const CONTACTS = [
  { waId: "77011234567", name: "Айгерим Сатыбалдиева" },
  { waId: "77475556677", name: "Ержан Абдуллаев" },
  { waId: "77017778899", name: "Дана Оспанова" },
  { waId: "77762223344", name: "Мадина Ким" },
  { waId: "77019991122", name: "Нурлан Жумабаев" },
  { waId: "77473334455", name: "Асель Турсынова" },
  { waId: "77015556677", name: "Тимур Ахметов" },
];

type Line = { out: boolean; text: string; minutesAgo: number; status?: string };

const DIALOGS: Record<string, Line[]> = {
  "77011234567": [
    { out: false, text: "Здравствуйте! Подскажите, есть места на чистку на этой неделе?", minutesAgo: 46 },
    { out: true, text: "Добрый день, Айгерим! Да, свободно в четверг 14:00 и 16:30.", minutesAgo: 41, status: "read" },
    { out: false, text: "Давайте 16:30", minutesAgo: 33 },
    { out: true, text: "Записала вас на четверг, 16:30. Врач — Сауле Маратовна. Ждём!", minutesAgo: 30, status: "read" },
    { out: false, text: "Спасибо большое 🙏", minutesAgo: 28 },
  ],
  "77475556677": [
    { out: false, text: "Сколько стоит установка брекетов?", minutesAgo: 190 },
    { out: true, text: "Здравствуйте, Ержан! Металлические — от 320 000 ₸ за две челюсти, керамические — от 450 000 ₸. Точную сумму скажем после осмотра, он бесплатный.", minutesAgo: 183, status: "read" },
    { out: false, text: "А рассрочка есть?", minutesAgo: 175 },
    { out: true, text: "Да, до 12 месяцев без переплаты через Kaspi Red.", minutesAgo: 170, status: "delivered" },
  ],
  "77017778899": [
    { out: false, text: "Добрый день! Можно перенести запись с завтра на субботу?", minutesAgo: 320 },
    { out: true, text: "Конечно. В субботу свободно 11:00 и 15:00, какое удобнее?", minutesAgo: 314, status: "read" },
    { out: false, text: "11:00", minutesAgo: 300 },
    { out: true, text: "Перенесла на субботу, 11:00. До встречи!", minutesAgo: 297, status: "read" },
  ],
  "77762223344": [
    { out: false, text: "Здравствуйте, а вы работаете в воскресенье?", minutesAgo: 1500 },
    { out: true, text: "Добрый день! По воскресеньям мы закрыты, работаем пн–сб с 9:00 до 19:00.", minutesAgo: 1495, status: "read" },
  ],
  "77019991122": [
    { out: false, text: "Болит зуб, можно сегодня?", minutesAgo: 15 },
  ],
  "77473334455": [
    { out: false, text: "Спасибо, всё отлично прошло!", minutesAgo: 2600 },
    { out: true, text: "Асель, спасибо за отзыв! Будем рады видеть вас на профилактике через полгода.", minutesAgo: 2590, status: "read" },
  ],
  "77015556677": [
    { out: false, text: "Здравствуйте, нужна консультация по имплантации", minutesAgo: 4300 },
    { out: true, text: "Добрый день, Тимур! Консультация с КТ — 8 000 ₸, при согласии на лечение сумма идёт в счёт работы.", minutesAgo: 4290, status: "read" },
  ],
};

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

async function clean(organizationId: string) {
  await prisma.message.deleteMany({ where: { wamid: { startsWith: DEMO_PREFIX } } });
  await prisma.broadcast.deleteMany({ where: { organizationId, name: { startsWith: "Демо:" } } });
  await prisma.messageTemplate.deleteMany({
    where: { organizationId, name: { in: ["zapis_podtverzhdenie", "profilaktika_napominanie", "akciya_implantaciya"] } },
  });
  await prisma.conversation.deleteMany({
    where: { organizationId, contact: { waId: { in: CONTACTS.map((c) => c.waId) } } },
  });
  await prisma.contact.deleteMany({
    where: { organizationId, waId: { in: CONTACTS.map((c) => c.waId) } },
  });
}

async function main() {
  const [email, mode] = process.argv.slice(2);
  if (!email) {
    console.error("Нужна почта владельца: npm run demo -- you@company.kz [clean]");
    process.exitCode = 1;
    return;
  }

  const membership = await prisma.membership.findFirst({
    where: { user: { email: email.trim().toLowerCase() } },
    include: { organization: true },
  });

  if (!membership) {
    console.error(`Не нашёл кабинет для ${email}`);
    process.exitCode = 1;
    return;
  }

  const organizationId = membership.organizationId;
  const number = await prisma.whatsappNumber.findFirst({ where: { organizationId } });
  const phoneNumberId = number?.phoneNumberId ?? "demo-pnid";

  await clean(organizationId);

  if (mode === "clean") {
    console.log(`Демо-данные убраны из «${membership.organization.name}».`);
    await prisma.$disconnect();
    return;
  }

  for (const contact of CONTACTS) {
    const lines = DIALOGS[contact.waId] ?? [];
    const last = lines.at(-1);
    const lastInbound = [...lines].reverse().find((l) => !l.out);

    const created = await prisma.contact.create({
      data: { organizationId, waId: contact.waId, name: contact.name },
    });

    const conversation = await prisma.conversation.create({
      data: {
        organizationId,
        contactId: created.id,
        phoneNumberId,
        lastMessageAt: minutesAgo(last?.minutesAgo ?? 60),
        // Окно 24 часа отсчитывается от последнего сообщения клиента.
        windowExpiresAt: lastInbound
          ? new Date(minutesAgo(lastInbound.minutesAgo).getTime() + 24 * 3600 * 1000)
          : null,
      },
    });

    await prisma.message.createMany({
      data: lines.map((line, index) => ({
        wamid: `${DEMO_PREFIX}${contact.waId}.${index}`,
        conversationId: conversation.id,
        direction: line.out ? ("OUTBOUND" as const) : ("INBOUND" as const),
        type: "text",
        text: line.text,
        status: line.out ? (line.status ?? "sent") : null,
        timestamp: minutesAgo(line.minutesAgo),
      })),
    });
  }

  const approved = await prisma.messageTemplate.create({
    data: {
      organizationId,
      name: "zapis_podtverzhdenie",
      language: "ru",
      category: "UTILITY",
      headerText: "Стоматология «Улыбка»",
      bodyText: "Здравствуйте, {{1}}! Вы записаны на {{2}}. Если планы изменятся — просто ответьте на это сообщение.",
      footerText: "Пн–сб, 9:00–19:00",
      examples: ["Айгерим", "четверг, 16:30"],
      status: "APPROVED",
      metaId: "demo-template-1",
      submittedAt: minutesAgo(4000),
    },
  });

  await prisma.messageTemplate.create({
    data: {
      organizationId,
      name: "profilaktika_napominanie",
      language: "ru",
      category: "UTILITY",
      bodyText: "Здравствуйте, {{1}}! Прошло полгода с вашего последнего визита — самое время на профилактический осмотр.",
      examples: ["Асель"],
      status: "PENDING",
      metaId: "demo-template-2",
      submittedAt: minutesAgo(120),
    },
  });

  await prisma.messageTemplate.create({
    data: {
      organizationId,
      name: "akciya_implantaciya",
      language: "ru",
      category: "MARKETING",
      bodyText: "{{1}}, только до конца месяца имплантация со скидкой 30%! Успейте записаться.",
      examples: ["Айгерим"],
      status: "REJECTED",
      rejectedReason: "INVALID_FORMAT",
      metaId: "demo-template-3",
      submittedAt: minutesAgo(2000),
    },
  });

  const contacts = await prisma.contact.findMany({ where: { organizationId } });

  const done = await prisma.broadcast.create({
    data: {
      organizationId,
      templateId: approved.id,
      name: "Демо: напоминание о записи",
      status: "DONE",
      startedAt: minutesAgo(2880),
      finishedAt: minutesAgo(2875),
    },
  });

  await prisma.broadcastRecipient.createMany({
    data: contacts.map((contact, index) => ({
      broadcastId: done.id,
      contactId: contact.id,
      wamid: `${DEMO_PREFIX}cast.${index}`,
      sentAt: minutesAgo(2878),
      status: index === 6 ? ("FAILED" as const) : index < 4 ? ("READ" as const) : ("DELIVERED" as const),
      error: index === 6 ? "Номер не зарегистрирован в WhatsApp" : null,
    })),
  });

  console.log(`Кабинет «${membership.organization.name}» наполнен:`);
  console.log(`  контактов и диалогов: ${CONTACTS.length}`);
  console.log("  шаблонов: 3 (одобрен, на модерации, отклонён)");
  console.log("  рассылок: 1 с отчётом");

  await prisma.$disconnect();
}

void main();
