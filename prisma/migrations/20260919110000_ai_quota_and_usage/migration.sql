-- Пакет ответов ИИ задаёт тариф, а не клиент; сброс раз в месяц и при оплате.
-- Учёт вызовов не из переписки (тест-чат, генератор анкеты, проверка ключа), заглушки и коды исходов.

ALTER TABLE "Plan" ADD COLUMN "aiAnswersPerMonth" INTEGER NOT NULL DEFAULT 0;
-- ensurePlans() существующие строки не обновляет, поэтому значения пакетов пишем здесь.
-- «Старт» без помощника (по карточке тарифа его нет), «Бизнес» — около 10–15% цены тарифа по замеру.
UPDATE "Plan" SET "aiAnswersPerMonth" = 50 WHERE "code" = 'trial';
UPDATE "Plan" SET "aiAnswersPerMonth" = 0 WHERE "code" = 'start';
UPDATE "Plan" SET "aiAnswersPerMonth" = 2000 WHERE "code" = 'business';

ALTER TABLE "AiBot" DROP COLUMN "answersLimit";
ALTER TABLE "AiBot" ADD COLUMN "answersPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AiBot" ADD COLUMN "stubText" TEXT;
ALTER TABLE "AiBot" ADD COLUMN "stubTextKz" TEXT;

ALTER TABLE "AiReply" ADD COLUMN "outcome" TEXT;
ALTER TABLE "AiReply" ADD COLUMN "httpStatus" INTEGER;
ALTER TABLE "AiReply" ADD COLUMN "providerCode" TEXT;
ALTER TABLE "AiReply" ADD COLUMN "stub" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "AiUsageKind" AS ENUM ('GENERATOR', 'TEST', 'PROBE');

CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "AiUsageKind" NOT NULL,
    "provider" "AiProvider",
    "model" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiUsage_organizationId_kind_createdAt_idx" ON "AiUsage"("organizationId", "kind", "createdAt");

ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
