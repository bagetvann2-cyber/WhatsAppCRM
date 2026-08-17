-- AlterEnum
ALTER TYPE "RecipientStatus" ADD VALUE 'SKIPPED';

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "unsubscribeSource" TEXT,
ADD COLUMN     "unsubscribedAt" TIMESTAMP(3);
