-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "handedOffAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AiBot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT NOT NULL DEFAULT 'claude-opus-5',
    "companyProfile" TEXT NOT NULL,
    "rules" TEXT,
    "answersLimit" INTEGER NOT NULL DEFAULT 100,
    "answersUsed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiBot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiReply" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "handoff" BOOLEAN NOT NULL DEFAULT false,
    "handoffReason" TEXT,
    "error" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiBot_organizationId_key" ON "AiBot"("organizationId");

-- CreateIndex
CREATE INDEX "AiReply_organizationId_createdAt_idx" ON "AiReply"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiReply_conversationId_idx" ON "AiReply"("conversationId");

-- AddForeignKey
ALTER TABLE "AiBot" ADD CONSTRAINT "AiBot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiReply" ADD CONSTRAINT "AiReply_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
