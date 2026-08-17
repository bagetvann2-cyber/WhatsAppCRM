import { expect, test } from "vitest";
import { parseWebhook } from "@/lib/whatsapp/parse";

const incoming = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "15550001111", phone_number_id: "PNID123" },
            contacts: [{ profile: { name: "Айбек" }, wa_id: "77011234567" }],
            messages: [
              {
                from: "77011234567",
                id: "wamid.AAA",
                timestamp: "1755300000",
                type: "text",
                text: { body: "Здравствуйте" },
              },
            ],
          },
        },
      ],
    },
  ],
};

const statusOnly = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "15550001111", phone_number_id: "PNID123" },
            statuses: [
              {
                id: "wamid.BBB",
                status: "delivered",
                timestamp: "1755300100",
                recipient_id: "77011234567",
              },
            ],
          },
        },
      ],
    },
  ],
};

test("разбирает входящее текстовое сообщение", () => {
  const result = parseWebhook(incoming);
  expect(result.messages).toHaveLength(1);
  expect(result.messages[0]).toEqual({
    wamid: "wamid.AAA",
    from: "77011234567",
    profileName: "Айбек",
    phoneNumberId: "PNID123",
    type: "text",
    text: "Здравствуйте",
    timestamp: new Date(1755300000 * 1000),
  });
  expect(result.statuses).toHaveLength(0);
});

test("разбирает статусы доставки", () => {
  const result = parseWebhook(statusOnly);
  expect(result.messages).toHaveLength(0);
  expect(result.statuses).toEqual([
    { wamid: "wamid.BBB", status: "delivered", timestamp: new Date(1755300100 * 1000) },
  ]);
});

test("для нетекстового типа кладёт null в text, но сообщение не теряет", () => {
  const image = structuredClone(incoming);
  image.entry[0].changes[0].value.messages[0] = {
    from: "77011234567",
    id: "wamid.CCC",
    timestamp: "1755300200",
    type: "image",
  } as never;

  const result = parseWebhook(image);
  expect(result.messages).toHaveLength(1);
  expect(result.messages[0].type).toBe("image");
  expect(result.messages[0].text).toBeNull();
});

test("не падает на пустом или чужом payload", () => {
  expect(parseWebhook({})).toEqual({ messages: [], statuses: [] });
  expect(parseWebhook(null)).toEqual({ messages: [], statuses: [] });
  expect(parseWebhook({ entry: [{ changes: [{ field: "account_update", value: {} }] }] })).toEqual({
    messages: [],
    statuses: [],
  });
});
