import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { messageEvents } from "@/lib/events";
import { mediaKind, sizeLabel } from "@/lib/media";
import { storeOutgoingMedia } from "@/lib/media-store";
import { currentUser } from "@/lib/session";
import { sendTextMessage } from "@/lib/whatsapp/client";
import { sendMediaMessage, uploadMedia } from "@/lib/whatsapp/media";

type Outgoing =
  | { kind: "text"; text: string }
  | {
      kind: "media";
      caption: string | null;
      file: { bytes: Uint8Array; mimeType: string; filename: string };
    };

/** Разбирает и обычный JSON, и форму с файлом: композер шлёт то одно, то другое. */
async function readOutgoing(
  request: Request,
): Promise<{ conversationId: string; message: Outgoing } | { error: string }> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const conversationId = form?.get("conversationId");
    const file = form?.get("file");

    if (typeof conversationId !== "string" || !(file instanceof File) || file.size === 0) {
      return { error: "Укажите диалог и файл" };
    }

    if (file.size > env.mediaMaxBytes()) {
      return {
        error: `Файл больше ${sizeLabel(env.mediaMaxBytes())}. WhatsApp такой не примет.`,
      };
    }

    const caption = form?.get("caption");

    return {
      conversationId,
      message: {
        kind: "media",
        caption: typeof caption === "string" && caption.trim() ? caption.trim() : null,
        file: {
          bytes: new Uint8Array(await file.arrayBuffer()),
          mimeType: file.type || "application/octet-stream",
          filename: file.name || "file",
        },
      },
    };
  }

  const body = (await request.json().catch(() => null)) as {
    conversationId?: string;
    text?: string;
  } | null;

  const text = body?.text?.trim();
  if (!body?.conversationId || !text) {
    return { error: "Укажите диалог и текст сообщения" };
  }

  return { conversationId: body.conversationId, message: { kind: "text", text } };
}

export async function POST(request: Request): Promise<Response> {
  const me = await currentUser();
  if (!me) {
    return Response.json({ error: "Нужно войти в кабинет" }, { status: 401 });
  }

  const parsed = await readOutgoing(request);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  // Организация в условии выборки: диалог чужой компании просто не найдётся,
  // и ответ неотличим от несуществующего — чужие id не подтверждаются.
  const conversation = await prisma.conversation.findFirst({
    where: { id: parsed.conversationId, organizationId: me.organization.id },
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
    const now = new Date();
    const { message } = parsed;
    let sentWamid: string;

    if (message.kind === "text") {
      const { wamid } = await sendTextMessage(conversation.contact.waId, message.text);
      sentWamid = wamid;

      await prisma.message.create({
        data: {
          wamid,
          conversationId: conversation.id,
          direction: "OUTBOUND",
          type: "text",
          text: message.text,
          status: "sent",
          timestamp: now,
          authorId: me.user.id,
        },
      });
    } else {
      const kind = mediaKind("unknown", message.file.mimeType);

      // Сначала файл уезжает в Meta и получает id, и только потом уходит
      // сообщение: отправить можно лишь то, что она уже приняла.
      const { mediaId } = await uploadMedia(message.file);
      const { wamid } = await sendMediaMessage(conversation.contact.waId, kind, mediaId, {
        caption: message.caption,
        filename: message.file.filename,
      });
      sentWamid = wamid;

      const stored = await prisma.message.create({
        data: {
          wamid,
          conversationId: conversation.id,
          direction: "OUTBOUND",
          type: kind,
          text: message.caption,
          status: "sent",
          timestamp: now,
          authorId: me.user.id,
          mediaId,
          mimeType: message.file.mimeType,
          filename: kind === "document" ? message.file.filename : null,
          mediaSize: message.file.bytes.byteLength,
        },
      });

      // Свою копию кладём сразу: качать у Meta то, что мы только что отдали, глупо.
      await storeOutgoingMedia({
        messageId: stored.id,
        bytes: message.file.bytes,
        mimeType: message.file.mimeType,
        filename: message.file.filename,
      });
    }

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: now },
    });

    messageEvents.emit("update", { conversationId: conversation.id });

    return Response.json({ wamid: sentWamid }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось отправить сообщение";
    return Response.json({ error: message }, { status: 502 });
  }
}
