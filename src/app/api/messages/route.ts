import { prisma } from "@/lib/db";
import { messageEvents } from "@/lib/events";
import { currentUser } from "@/lib/session";
import { sendTextMessage } from "@/lib/whatsapp/client";

export async function POST(request: Request): Promise<Response> {
  const me = await currentUser();
  if (!me) {
    return Response.json({ error: "Нужно войти в кабинет" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    conversationId?: string;
    text?: string;
  } | null;

  const text = body?.text?.trim();
  if (!body?.conversationId || !text) {
    return Response.json({ error: "Укажите диалог и текст сообщения" }, { status: 400 });
  }

  // Организация в условии выборки: диалог чужой компании просто не найдётся,
  // и ответ неотличим от несуществующего — чужие id не подтверждаются.
  const conversation = await prisma.conversation.findFirst({
    where: { id: body.conversationId, organizationId: me.organization.id },
    include: { contact: true },
  });

  if (!conversation) {
    return Response.json({ error: "Диалог не найден" }, { status: 400 });
  }

  const windowOpen =
    conversation.windowExpiresAt !== null && conversation.windowExpiresAt.getTime() > Date.now();

  if (!windowOpen) {
    return Response.json(
      { error: "Окно 24 часа закрыто. Свободный ответ недоступен, нужен одобренный шаблон." },
      { status: 422 },
    );
  }

  try {
    const { wamid } = await sendTextMessage(conversation.contact.waId, text);
    const now = new Date();

    await prisma.message.create({
      data: {
        wamid,
        conversationId: conversation.id,
        direction: "OUTBOUND",
        type: "text",
        text,
        status: "sent",
        timestamp: now,
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: now },
    });

    messageEvents.emit("update", { conversationId: conversation.id });

    return Response.json({ wamid }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось отправить сообщение";
    return Response.json({ error: message }, { status: 502 });
  }
}
