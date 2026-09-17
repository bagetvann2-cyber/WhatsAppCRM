import { expect, test } from "vitest";
import { parseTelegramUpdate } from "@/lib/telegram/parse";

const botId = "987654321";

test("разбирает входящее текстовое сообщение", () => {
  const result = parseTelegramUpdate(
    {
      update_id: 1,
      message: {
        message_id: 100,
        from: { id: 555, first_name: "Айбек", last_name: "К." },
        chat: { id: 555, type: "private" },
        date: 1755300000,
        text: "Здравствуйте",
      },
    },
    botId,
  );

  expect(result).toEqual({
    channelType: "TELEGRAM",
    channelExternalId: botId,
    externalMessageId: "100",
    from: "555",
    profileName: "Айбек К.",
    type: "text",
    text: "Здравствуйте",
    media: null,
    timestamp: new Date(1755300000 * 1000),
  });
});

test("разбирает фото — берёт самый крупный размер", () => {
  const result = parseTelegramUpdate(
    {
      message: {
        message_id: 101,
        chat: { id: 555 },
        date: 1755300100,
        caption: "Вот чек",
        photo: [
          { file_id: "small", file_size: 100 },
          { file_id: "big", file_size: 5000 },
        ],
      },
    },
    botId,
  );

  expect(result?.type).toBe("image");
  expect(result?.text).toBe("Вот чек");
  expect(result?.media).toEqual({ mediaId: "big", mimeType: null, filename: null, size: 5000, voice: false });
});

test("разбирает голосовое сообщение", () => {
  const result = parseTelegramUpdate(
    {
      message: {
        message_id: 102,
        chat: { id: 555 },
        date: 1755300200,
        voice: { file_id: "voice1", mime_type: "audio/ogg", file_size: 1234 },
      },
    },
    botId,
  );

  expect(result?.type).toBe("audio");
  expect(result?.media).toEqual({
    mediaId: "voice1",
    mimeType: "audio/ogg",
    filename: null,
    size: 1234,
    voice: true,
  });
});

test("без имени у отправителя profileName — null", () => {
  const result = parseTelegramUpdate(
    { message: { message_id: 103, chat: { id: 555 }, date: 1755300300, text: "Привет" } },
    botId,
  );
  expect(result?.profileName).toBeNull();
});

test("не падает на пустом или чужом payload", () => {
  expect(parseTelegramUpdate({}, botId)).toBeNull();
  expect(parseTelegramUpdate(null, botId)).toBeNull();
  expect(parseTelegramUpdate({ edited_message: { message_id: 1, chat: { id: 1 } } }, botId)).toBeNull();
});
