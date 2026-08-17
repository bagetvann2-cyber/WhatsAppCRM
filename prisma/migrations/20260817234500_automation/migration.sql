-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "awayRepliedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "greetingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "greetingText" TEXT,
    "awayEnabled" BOOLEAN NOT NULL DEFAULT false,
    "awayText" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Almaty',
    "schedule" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Automation_organizationId_key" ON "Automation"("organizationId");

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
