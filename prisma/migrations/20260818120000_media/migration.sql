-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "filename" TEXT,
ADD COLUMN     "mediaError" TEXT,
ADD COLUMN     "mediaId" TEXT,
ADD COLUMN     "mediaPath" TEXT,
ADD COLUMN     "mediaSize" INTEGER,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "voice" BOOLEAN NOT NULL DEFAULT false;
