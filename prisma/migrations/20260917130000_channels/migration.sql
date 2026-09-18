-- Абстракция каналов: WhatsappNumber заменяется общей таблицей Channel,
-- к которой привязываются Contact/Conversation/Message. Ручная миграция
-- (не сгенерирована `prisma migrate dev`), потому что переименования и
-- перенос данных Prisma не делает автоматически — а данные стенда терять нельзя.

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('WHATSAPP', 'TELEGRAM', 'SIMULATOR');
CREATE TYPE "ChannelConnectionMethod" AS ENUM ('WA_EMBEDDED_SIGNUP', 'WA_MANUAL', 'TG_BUSINESS', 'TG_OWN_BOT', 'SIMULATOR');
CREATE TYPE "ChannelStatus" AS ENUM ('PENDING', 'ACTIVE', 'ERROR', 'DISCONNECTED');

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL,
    "connectionMethod" "ChannelConnectionMethod" NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" "ChannelStatus" NOT NULL DEFAULT 'PENDING',
    "statusError" TEXT,
    "connectStep" TEXT,
    "externalId" TEXT,
    "externalUsername" TEXT,
    "telegramUserId" TEXT,
    "credentialsEncrypted" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- Перенос данных: один Channel на каждый существующий WhatsappNumber. id
-- переиспользуем от WhatsappNumber, чтобы ниже навести Conversation.channelId
-- прямым сравнением с externalId без лишней косвенности.
INSERT INTO "Channel" ("id", "organizationId", "type", "connectionMethod", "name", "isActive", "status", "externalId", "externalUsername", "createdAt", "updatedAt")
SELECT "id", "organizationId", 'WHATSAPP', 'WA_MANUAL', COALESCE("displayNumber", 'WhatsApp'), true, 'ACTIVE', "phoneNumberId", "displayNumber", "createdAt", CURRENT_TIMESTAMP
FROM "WhatsappNumber";

-- CreateIndex
CREATE UNIQUE INDEX "Channel_type_externalId_key" ON "Channel"("type", "externalId");
CREATE INDEX "Channel_organizationId_idx" ON "Channel"("organizationId");

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Contact: channelId вместо неявной привязки через organizationId.
-- Канал берём по последнему диалогу контакта (Conversation.phoneNumberId уже
-- равен Channel.externalId); если диалогов ещё нет — берём канал организации.
-- Несколько номеров WhatsApp на одну организацию с историей на разных номерах
-- у одного контакта — редкий случай, которого на демо-стенде нет; после
-- миграции такие записи стоит свериться вручную (это сохранённое ограничение
-- переноса, а не новый баг: прежняя схема тоже не различала эти случаи).
ALTER TABLE "Contact" ADD COLUMN "channelId" TEXT;

UPDATE "Contact" c
SET "channelId" = ch."id"
FROM "Channel" ch
WHERE ch."organizationId" = c."organizationId"
  AND ch."externalId" = (
    SELECT conv."phoneNumberId"
    FROM "Conversation" conv
    WHERE conv."contactId" = c."id"
    ORDER BY conv."lastMessageAt" DESC
    LIMIT 1
  );

UPDATE "Contact" c
SET "channelId" = ch."id"
FROM "Channel" ch
WHERE c."channelId" IS NULL
  AND ch."organizationId" = c."organizationId";

ALTER TABLE "Contact" ALTER COLUMN "channelId" SET NOT NULL;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "Contact_organizationId_waId_key";
ALTER TABLE "Contact" RENAME COLUMN "waId" TO "externalUserId";
CREATE UNIQUE INDEX "Contact_channelId_externalUserId_key" ON "Contact"("channelId", "externalUserId");

-- Conversation: channelId вместо строкового phoneNumberId.
ALTER TABLE "Conversation" ADD COLUMN "channelId" TEXT;

UPDATE "Conversation" conv
SET "channelId" = ch."id"
FROM "Channel" ch
WHERE ch."externalId" = conv."phoneNumberId";

ALTER TABLE "Conversation" ALTER COLUMN "channelId" SET NOT NULL;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "Conversation_contactId_phoneNumberId_key";
ALTER TABLE "Conversation" DROP COLUMN "phoneNumberId";
CREATE UNIQUE INDEX "Conversation_contactId_channelId_key" ON "Conversation"("contactId", "channelId");
CREATE INDEX "Conversation_channelId_idx" ON "Conversation"("channelId");

-- Message: channelId (денормализован для быстрой идемпотентности без join)
-- и wamid -> externalMessageId, уникальность теперь в паре с каналом.
ALTER TABLE "Message" ADD COLUMN "channelId" TEXT;

UPDATE "Message" m
SET "channelId" = conv."channelId"
FROM "Conversation" conv
WHERE conv."id" = m."conversationId";

ALTER TABLE "Message" ALTER COLUMN "channelId" SET NOT NULL;
ALTER TABLE "Message" ADD CONSTRAINT "Message_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "Message_wamid_key";
ALTER TABLE "Message" RENAME COLUMN "wamid" TO "externalMessageId";
CREATE UNIQUE INDEX "Message_channelId_externalMessageId_key" ON "Message"("channelId", "externalMessageId");

-- WhatsappNumber полностью заменён Channel.
DROP TABLE "WhatsappNumber";
