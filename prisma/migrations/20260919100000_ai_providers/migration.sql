-- Провайдер нейросети у ИИ-помощника. Модель на нашем ключе хранится как NULL,
-- то есть «по умолчанию из каталога»: платящих клиентов на конкретной модели пока нет.

CREATE TYPE "AiProvider" AS ENUM ('ANTHROPIC', 'OPENAI', 'GEMINI', 'OPENROUTER');

ALTER TABLE "AiBot" ADD COLUMN "provider" "AiProvider" NOT NULL DEFAULT 'ANTHROPIC';
ALTER TABLE "AiBot" ALTER COLUMN "model" DROP NOT NULL;
ALTER TABLE "AiBot" ALTER COLUMN "model" DROP DEFAULT;
UPDATE "AiBot" SET "model" = NULL;

ALTER TABLE "AiReply" ADD COLUMN "provider" "AiProvider";
ALTER TABLE "AiReply" ADD COLUMN "model" TEXT;
ALTER TABLE "AiReply" ADD COLUMN "latencyMs" INTEGER;
