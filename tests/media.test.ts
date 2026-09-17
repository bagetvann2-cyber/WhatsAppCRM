import { afterAll, beforeEach, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { saveIncomingMessage } from "@/lib/ingest";
import { downloadName, extensionFor, mediaKind, mediaLabel, sizeLabel } from "@/lib/media";
import { ensureMediaFile, findMediaMessage, readMediaFile } from "@/lib/media-store";
import { parseWebhook } from "@/lib/whatsapp/parse";
import { createTestOrg, dropTestOrg } from "./helpers";

const phoneNumberId = "PNID-MEDIA";
const waId = "77015550011";

const metaMock = vi.hoisted(() => vi.fn());
const downloadMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/whatsapp/media", () => ({
  fetchMediaMeta: metaMock,
  downloadMedia: downloadMock,
  uploadMedia: vi.fn(),
  sendMediaMessage: vi.fn(),
}));

beforeEach(async () => {
  metaMock.mockReset();
  downloadMock.mockReset();

  await dropTestOrg(phoneNumberId);
  await createTestOrg(phoneNumberId);
});

afterAll(async () => {
  await dropTestOrg(phoneNumberId);
  await prisma.$disconnect();
});

function webhookWith(message: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: phoneNumberId },
              contacts: [{ profile: { name: "Асель" }, wa_id: waId }],
              messages: [{ from: waId, timestamp: "1755300000", ...message }],
            },
          },
        ],
      },
    ],
  };
}

test("разбирает фото с подписью", () => {
  const { messages } = parseWebhook(
    webhookWith({
      id: "wamid.MEDIA.IMG",
      type: "image",
      image: {
        id: "MEDIA-1",
        mime_type: "image/jpeg",
        sha256: "x",
        caption: "Вот мой снимок",
      },
    }),
  );

  expect(messages[0].media).toEqual({
    mediaId: "MEDIA-1",
    mimeType: "image/jpeg",
    filename: null,
    size: null,
    voice: false,
  });
  // Подпись — это и есть текст сообщения: по ней работает поиск в переписке.
  expect(messages[0].text).toBe("Вот мой снимок");
});

test("разбирает документ с именем и голосовое", () => {
  const { messages } = parseWebhook(
    webhookWith({
      id: "wamid.MEDIA.DOC",
      type: "document",
      document: {
        id: "MEDIA-2",
        mime_type: "application/pdf",
        filename: "Договор.pdf",
        file_size: 20480,
      },
    }),
  );

  expect(messages[0].media).toMatchObject({ filename: "Договор.pdf", size: 20480 });

  const voice = parseWebhook(
    webhookWith({
      id: "wamid.MEDIA.VOICE",
      type: "audio",
      audio: { id: "MEDIA-3", mime_type: "audio/ogg; codecs=opus", voice: true },
    }),
  );

  expect(voice.messages[0].media).toMatchObject({ voice: true });
});

test("текстовое сообщение остаётся без вложения", () => {
  const { messages } = parseWebhook(
    webhookWith({ id: "wamid.MEDIA.TXT", type: "text", text: { body: "Просто текст" } }),
  );

  expect(messages[0].media).toBeNull();
});

test("вложение без id вложением не считается", () => {
  const { messages } = parseWebhook(
    webhookWith({ id: "wamid.MEDIA.BROKEN", type: "image", image: { mime_type: "image/jpeg" } }),
  );

  expect(messages[0].media).toBeNull();
});

test("тип вложения определяется по сообщению, потом по mime", () => {
  expect(mediaKind("sticker", "image/webp")).toBe("image");
  expect(mediaKind("document", "application/pdf")).toBe("document");
  expect(mediaKind("unknown", "video/mp4")).toBe("video");
  expect(mediaKind("unknown", "audio/ogg; codecs=opus")).toBe("audio");
  // Незнакомое отдаём файлом: скачать можно всё, показать — не всё.
  expect(mediaKind("unknown", null)).toBe("document");
});

test("расширение берётся из имени файла, иначе из mime", () => {
  expect(extensionFor("application/pdf", "Договор.pdf")).toBe("pdf");
  expect(extensionFor("image/jpeg", null)).toBe("jpg");
  expect(extensionFor("audio/ogg; codecs=opus", null)).toBe("ogg");
  expect(extensionFor("application/x-неизвестное", null)).toBe("bin");
});

test("подписи вложений понятны без технических слов", () => {
  expect(mediaLabel({ type: "audio", mimeType: "audio/ogg", filename: null, voice: true })).toBe(
    "Голосовое сообщение",
  );
  expect(
    mediaLabel({ type: "document", mimeType: "application/pdf", filename: "Счёт.pdf", voice: false }),
  ).toBe("Счёт.pdf");
  expect(mediaLabel({ type: "image", mimeType: "image/jpeg", filename: null, voice: false })).toBe(
    "Фото",
  );
  expect(sizeLabel(20480)).toBe("20 КБ");
  expect(sizeLabel(null)).toBeNull();
});

test("имя для скачивания не оставляет файл безымянным", () => {
  const name = downloadName({
    filename: null,
    type: "image",
    mimeType: "image/jpeg",
    voice: false,
    timestamp: new Date("2026-08-18T10:20:00Z"),
  });

  expect(name).toMatch(/^image-2026-08-18-10-20\.jpg$/);
});

async function incomingPhoto(wamid = "MEDIA.IN.1") {
  const { messages } = parseWebhook(
    webhookWith({
      id: `${phoneNumberId}.${wamid}`,
      type: "image",
      image: { id: "MEDIA-1", mime_type: "image/jpeg", caption: "Снимок" },
    }),
  );

  const result = await saveIncomingMessage(messages[0]);
  if (!result.stored) {
    throw new Error("сообщение должно сохраниться");
  }
  return result;
}

test("вложение сохраняется вместе с сообщением", async () => {
  const { messageId } = await incomingPhoto();

  const message = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
  expect(message.mediaId).toBe("MEDIA-1");
  expect(message.mimeType).toBe("image/jpeg");
  expect(message.text).toBe("Снимок");
  expect(message.mediaPath).toBeNull();
});

test("копия файла ложится на диск и второй раз не качается", async () => {
  const { messageId } = await incomingPhoto();

  metaMock.mockResolvedValue({ url: "https://lookaside.test/file", mimeType: "image/jpeg", size: 3 });
  downloadMock.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" });

  const first = await ensureMediaFile(messageId);
  expect(first).toEqual({ ok: true, name: `${messageId}.jpg` });

  const saved = await readMediaFile(`${messageId}.jpg`);
  expect(saved && Array.from(saved)).toEqual([1, 2, 3]);

  const stored = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
  expect(stored.mediaPath).toBe(`${messageId}.jpg`);
  expect(stored.mediaSize).toBe(3);

  // Файл уже наш — повторный вызов не должен ходить в Meta.
  metaMock.mockClear();
  const second = await ensureMediaFile(messageId);
  expect(second).toEqual({ ok: true, name: `${messageId}.jpg` });
  expect(metaMock).not.toHaveBeenCalled();
});

test("вложение чужой компании не отдаётся, даже если знать его id", async () => {
  const { messageId } = await incomingPhoto();

  const stranger = await createTestOrg("PNID-MEDIA-STRANGER");
  try {
    expect(await findMediaMessage(stranger.id, messageId)).toBeNull();

    const owner = await prisma.conversation.findFirstOrThrow({
      where: { channel: { externalId: phoneNumberId } },
      select: { organizationId: true },
    });
    expect(await findMediaMessage(owner.organizationId, messageId)).toMatchObject({
      id: messageId,
    });
  } finally {
    await dropTestOrg("PNID-MEDIA-STRANGER");
  }
});

test("сбой скачивания не теряет сообщение и объясняет причину", async () => {
  const { messageId } = await incomingPhoto();

  metaMock.mockRejectedValue(new Error("Срок действия ссылки истёк"));

  const result = await ensureMediaFile(messageId);
  expect(result).toEqual({ ok: false, error: "Срок действия ссылки истёк" });

  const stored = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
  expect(stored.mediaError).toBe("Срок действия ссылки истёк");
  expect(stored.text).toBe("Снимок");
  // Идентификатор у Meta остался — попытку можно повторить позже.
  expect(stored.mediaId).toBe("MEDIA-1");
});
