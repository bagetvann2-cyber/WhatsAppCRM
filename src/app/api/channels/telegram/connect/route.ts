import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { encryptJson } from "@/lib/crypto";
import { env } from "@/lib/env";
import { currentUser } from "@/lib/session";
import { getMe, setWebhook } from "@/lib/telegram/client";
import { canManageTeam } from "@/lib/team";

/**
 * Подключение своего Telegram-бота: токен от BotFather проверяется через
 * getMe (заодно даёт id бота — ключ канала) и сразу регистрируется вебхук
 * на конкретный канал. В отличие от WhatsApp Embedded Signup, тут нет
 * попапа Meta — просто вставленный оператором токен.
 */
export async function POST(request: Request): Promise<Response> {
  const me = await currentUser();
  if (!me || !canManageTeam(me.role)) {
    return Response.json({ error: "Подключать бота может владелец или администратор." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { botToken?: string } | null;
  const botToken = body?.botToken?.trim();
  if (!botToken) {
    return Response.json({ error: "Укажите токен бота" }, { status: 400 });
  }

  const base = env.publicBaseUrl();
  if (!base) {
    return Response.json(
      { error: "Не задан PUBLIC_BASE_URL — Telegram не сможет достучаться до вебхука" },
      { status: 500 },
    );
  }

  let bot: { id: string; username: string | null };
  try {
    bot = await getMe(botToken);
  } catch (error) {
    const raw = error instanceof Error ? error.message : "";
    // Telegram на неверный токен отвечает голым «Not Found» / «Unauthorized».
    const message = /^(Not Found|Unauthorized)$/i.test(raw)
      ? "Telegram не принял токен. Скопируйте его у @BotFather целиком, вида 123456789:AA…"
      : raw || "Не удалось проверить токен";
    return Response.json({ error: message }, { status: 400 });
  }

  const existing = await prisma.channel.findUnique({
    where: { type_externalId: { type: "TELEGRAM", externalId: bot.id } },
  });
  if (existing) {
    return Response.json({ error: "Этот бот уже подключён" }, { status: 409 });
  }

  const webhookSecret = crypto.randomBytes(24).toString("hex");
  const displayName = bot.username ? `@${bot.username}` : "Telegram-бот";

  const channel = await prisma.channel.create({
    data: {
      organizationId: me.organization.id,
      type: "TELEGRAM",
      connectionMethod: "TG_OWN_BOT",
      name: displayName,
      status: "PENDING",
      externalId: bot.id,
      externalUsername: displayName,
      credentialsEncrypted: encryptJson({ botToken, webhookSecret }),
    },
  });

  try {
    await setWebhook(botToken, `${base}/api/webhook/telegram/${channel.id}`, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось зарегистрировать вебхук";
    await prisma.channel.update({ where: { id: channel.id }, data: { status: "ERROR", statusError: message } });
    return Response.json({ error: message }, { status: 502 });
  }

  await prisma.channel.update({ where: { id: channel.id }, data: { status: "ACTIVE" } });

  return Response.json({ ok: true, channelId: channel.id });
}
