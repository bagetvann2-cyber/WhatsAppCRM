-- AlterTable
ALTER TABLE "AiBot" ADD COLUMN     "apiKeyCheckedAt" TIMESTAMP(3),
ADD COLUMN     "apiKeyEncrypted" TEXT,
ADD COLUMN     "apiKeyError" TEXT,
ADD COLUMN     "apiKeyHint" TEXT,
ADD COLUMN     "apiKeyProvider" "AiProvider";

-- AlterTable
ALTER TABLE "AiReply" ADD COLUMN     "ownKey" BOOLEAN NOT NULL DEFAULT false;
