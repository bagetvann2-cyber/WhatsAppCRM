/**
 * Наполняет кабинет правдоподобными данными для показа заказчику.
 * Ничего не отправляет наружу — только пишет в локальную базу.
 *
 *   npm run demo -- почта-владельца        # наполнить
 *   npm run demo -- почта-владельца clean  # убрать демо-данные
 */
import { unlink } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { prisma } from "@/lib/db";
import { ensurePlans, recordOperation } from "@/lib/billing-store";
import { env } from "@/lib/env";
import { extensionFor } from "@/lib/media";
import { writeMediaFile } from "@/lib/media-store";

const DEMO_PREFIX = "demo.";

/**
 * Демо-вложения рисуем сами: скачивать чужие файлы ради показа незачем,
 * а пустые квадраты в переписке выглядят хуже, чем честная демо-картинка.
 */
function demoImage(): Uint8Array {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420">
  <rect width="640" height="420" fill="#0f172a"/>
  <circle cx="320" cy="196" r="120" fill="#1e293b"/>
  <path d="M250 250c20-90 120-90 140 0 8 36-20 70-40 40-14-20-46-20-60 0-20 30-48-4-40-40z" fill="#e2e8f0"/>
  <text x="320" y="382" fill="#94a3b8" font-family="sans-serif" font-size="22" text-anchor="middle">демо-снимок</text>
</svg>`;
  return new TextEncoder().encode(svg);
}

/** Короткий WAV: голосовое в демо должно реально проигрываться в плеере. */
function demoVoice(seconds = 4): Uint8Array {
  const rate = 8000;
  const samples = rate * seconds;
  const buffer = Buffer.alloc(44 + samples * 2);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);

  for (let i = 0; i < samples; i += 1) {
    // Тихий затухающий тон — не музыка, но видно, что дорожка живая.
    const envelope = Math.max(0, 1 - i / samples);
    const value = Math.sin((i / rate) * 2 * Math.PI * 220) * 6000 * envelope;
    buffer.writeInt16LE(Math.round(value), 44 + i * 2);
  }

  return new Uint8Array(buffer);
}

/** Минимальный настоящий PDF: открывается любой смотрелкой. */
function demoDocument(): Uint8Array {
  const text = "Plan lecheniya (demo) - Stomatologiya Ulybka";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${text.length + 44} >>\nstream\nBT /F1 16 Tf 60 760 Td (${text}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}

type DemoMedia = {
  bytes: Uint8Array;
  mimeType: string;
  filename: string | null;
  type: string;
  voice?: boolean;
};

const MEDIA: Record<string, DemoMedia> = {
  photo: {
    bytes: demoImage(),
    mimeType: "image/svg+xml",
    filename: null,
    type: "image",
  },
  voice: {
    bytes: demoVoice(),
    mimeType: "audio/wav",
    filename: null,
    type: "audio",
    voice: true,
  },
  plan: {
    bytes: demoDocument(),
    mimeType: "application/pdf",
    filename: "План лечения.pdf",
    type: "document",
  },
};

const CONTACTS = [
  { waId: "77011234567", name: "Айгерим Сатыбалдиева" },
  { waId: "77475556677", name: "Ержан Абдуллаев" },
  { waId: "77017778899", name: "Дана Оспанова" },
  { waId: "77762223344", name: "Мадина Ким" },
  { waId: "77019991122", name: "Нурлан Жумабаев" },
  { waId: "77473334455", name: "Асель Турсынова" },
  { waId: "77015556677", name: "Тимур Ахметов" },
];

type Line = {
  out: boolean;
  text: string | null;
  minutesAgo: number;
  status?: string;
  media?: keyof typeof MEDIA;
};

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
    { out: false, text: "Вот так выглядит", minutesAgo: 14, media: "photo" },
    { out: false, text: null, minutesAgo: 13, media: "voice" },
  ],
  "77473334455": [
    { out: false, text: "Спасибо, всё отлично прошло!", minutesAgo: 2600 },
    { out: true, text: "Асель, спасибо за отзыв! Будем рады видеть вас на профилактике через полгода.", minutesAgo: 2590, status: "read" },
  ],
  "77015556677": [
    { out: false, text: "Здравствуйте, нужна консультация по имплантации", minutesAgo: 4300 },
    { out: true, text: "Добрый день, Тимур! Консультация с КТ — 8 000 ₸, при согласии на лечение сумма идёт в счёт работы.", minutesAgo: 4290, status: "read" },
    { out: true, text: "Отправляю предварительный план лечения — посмотрите, пожалуйста.", minutesAgo: 4285, status: "read", media: "plan" },
  ],
};

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

async function clean(organizationId: string) {
  // Копии демо-вложений убираем с диска: строка в базе уйдёт, файл — нет.
  const withFiles = await prisma.message.findMany({
    where: { wamid: { startsWith: DEMO_PREFIX }, mediaPath: { not: null } },
    select: { mediaPath: true },
  });

  for (const { mediaPath } of withFiles) {
    await unlink(join(resolve(process.cwd(), env.mediaDir()), basename(mediaPath!))).catch(() => {});
  }

  await prisma.balanceOperation.deleteMany({
    where: { organizationId, description: { contains: "(демо)" } },
  });
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

    for (const [index, line] of lines.entries()) {
      const media = line.media ? MEDIA[line.media] : null;

      const message = await prisma.message.create({
        data: {
          wamid: `${DEMO_PREFIX}${contact.waId}.${index}`,
          conversationId: conversation.id,
          direction: line.out ? ("OUTBOUND" as const) : ("INBOUND" as const),
          type: media?.type ?? "text",
          text: line.text,
          status: line.out ? (line.status ?? "sent") : null,
          timestamp: minutesAgo(line.minutesAgo),
          ...(media
            ? {
                mediaId: `${DEMO_PREFIX}media.${contact.waId}.${index}`,
                mimeType: media.mimeType,
                filename: media.filename,
                mediaSize: media.bytes.byteLength,
                voice: media.voice ?? false,
              }
            : {}),
        },
      });

      if (media) {
        const name = `${message.id}.${extensionFor(media.mimeType, media.filename)}`;
        await writeMediaFile(name, media.bytes);
        await prisma.message.update({ where: { id: message.id }, data: { mediaPath: name } });
      }
    }
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

  // Тариф и баланс: без них страница «Тариф» на демонстрации выглядит пустой.
  await ensurePlans();
  const startPlan = await prisma.plan.findUniqueOrThrow({ where: { code: "start" } });
  const paidUntil = new Date();
  paidUntil.setMonth(paidUntil.getMonth() + 5);

  await prisma.subscription.upsert({
    where: { organizationId },
    update: { planId: startPlan.id, status: "ACTIVE", periodMonths: 6, paidUntil },
    create: {
      organizationId,
      planId: startPlan.id,
      status: "ACTIVE",
      periodMonths: 6,
      paidUntil,
    },
  });

  await prisma.organization.update({ where: { id: organizationId }, data: { balance: 0 } });
  // Пометка «(демо)» видна клиенту и по ней же эти строки потом удаляются:
  // служебный префикс в описании операции заказчику показывать незачем.
  await recordOperation({
    organizationId,
    amount: 50000,
    kind: "topup",
    description: "Пополнение баланса через Kaspi (демо)",
  });
  await recordOperation({
    organizationId,
    amount: -22 * 7,
    kind: "message",
    description: "Доставлено 7 сообщений рассылки «Демо: напоминание о записи» (демо)",
    broadcastId: done.id,
  });

  console.log(`Кабинет «${membership.organization.name}» наполнен:`);
  console.log(`  контактов и диалогов: ${CONTACTS.length}`);
  console.log("  вложений: снимок, голосовое и план лечения в PDF");
  console.log("  шаблонов: 3 (одобрен, на модерации, отклонён)");
  console.log("  рассылок: 1 с отчётом");
  console.log("  тариф «Старт» оплачен, баланс 49 846 ₸");

  await prisma.$disconnect();
}

void main();
