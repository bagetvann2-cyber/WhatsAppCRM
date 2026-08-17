import { afterAll, beforeEach, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { saveIncomingMessage } from "@/lib/ingest";
import { writeMediaFile } from "@/lib/media-store";
import { createTestOrg, dropTestOrg } from "./helpers";

const phoneNumberId = "PNID-MEDIA-ROUTE";
const strangerNumberId = "PNID-MEDIA-ROUTE-2";
const waId = "77016664433";

const currentUserMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session", () => ({ currentUser: currentUserMock }));

// Скачивание у Meta здесь ни при чём: копия уже лежит на диске.
vi.mock("@/lib/whatsapp/media", () => ({
  fetchMediaMeta: vi.fn(),
  downloadMedia: vi.fn(),
  uploadMedia: vi.fn(),
  sendMediaMessage: vi.fn(),
}));

const { GET } = await import("@/app/api/media/[id]/route");

let organizationId: string;
let strangerId: string;

beforeEach(async () => {
  currentUserMock.mockReset();

  await dropTestOrg(phoneNumberId);
  await dropTestOrg(strangerNumberId);
  organizationId = (await createTestOrg(phoneNumberId)).id;
  strangerId = (await createTestOrg(strangerNumberId)).id;
});

afterAll(async () => {
  await dropTestOrg(phoneNumberId);
  await dropTestOrg(strangerNumberId);
  await prisma.$disconnect();
});

function asUser(id: string) {
  currentUserMock.mockResolvedValue({ organization: { id }, role: "OWNER" });
}

function request(id: string, query = ""): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost/api/media/${id}${query}`),
    { params: Promise.resolve({ id }) },
  ];
}

async function photoMessage() {
  const result = await saveIncomingMessage({
    wamid: `${phoneNumberId}.IN.1`,
    from: waId,
    profileName: "Дана",
    phoneNumberId,
    type: "image",
    text: "Снимок",
    media: {
      mediaId: "MEDIA-ROUTE-1",
      mimeType: "image/jpeg",
      filename: null,
      size: 3,
      voice: false,
    },
    timestamp: new Date(),
  });

  if (!result.stored) {
    throw new Error("сообщение должно сохраниться");
  }

  const name = `${result.messageId}.jpg`;
  await writeMediaFile(name, new Uint8Array([9, 8, 7]));
  await prisma.message.update({
    where: { id: result.messageId },
    data: { mediaPath: name, mediaSize: 3 },
  });

  return result.messageId;
}

test("без входа файл не отдаётся", async () => {
  const messageId = await photoMessage();
  currentUserMock.mockResolvedValue(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- контекст маршрута собираем вручную
  const response = await GET(...(request(messageId) as [Request, any]));
  expect(response.status).toBe(401);
});

test("своей компании файл отдаётся с правильным типом", async () => {
  const messageId = await photoMessage();
  asUser(organizationId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- контекст маршрута собираем вручную
  const response = await GET(...(request(messageId) as [Request, any]));

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/jpeg");
  expect(response.headers.get("cache-control")).toContain("private");
  expect(response.headers.get("content-disposition")).toContain("inline");
  // Скрипт внутри присланного файла не должен исполняться на нашем домене.
  expect(response.headers.get("content-security-policy")).toBe("sandbox");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([9, 8, 7]);
});

test("с ?download файл уходит вложением, а не открывается в окне", async () => {
  const messageId = await photoMessage();
  asUser(organizationId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- контекст маршрута собираем вручную
  const response = await GET(...(request(messageId, "?download") as [Request, any]));

  expect(response.headers.get("content-disposition")).toContain("attachment");
});

test("чужой компании отвечаем так же, как на несуществующий файл", async () => {
  const messageId = await photoMessage();
  asUser(strangerId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- контекст маршрута собираем вручную
  const foreign = await GET(...(request(messageId) as [Request, any]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- контекст маршрута собираем вручную
  const missing = await GET(...(request("нет-такого") as [Request, any]));

  expect(foreign.status).toBe(404);
  expect(missing.status).toBe(404);
  expect(await foreign.text()).toBe(await missing.text());
});
