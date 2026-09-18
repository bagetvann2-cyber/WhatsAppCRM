-- Подтверждение почты. Все, кто зарегистрирован до этой миграции, считаются
-- подтвердившими: иначе вход по `emailVerifiedAt IS NULL` закрылся бы для них навсегда.

ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "verificationToken" TEXT;
ALTER TABLE "User" ADD COLUMN "verificationTokenExpiresAt" TIMESTAMP(3);

UPDATE "User" SET "emailVerifiedAt" = "createdAt";

CREATE UNIQUE INDEX "User_verificationToken_key" ON "User"("verificationToken");
