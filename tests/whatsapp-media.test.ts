import { afterEach, expect, test, vi } from "vitest";
import { downloadMedia, fetchMediaMeta, sendMediaMessage, uploadMedia } from "@/lib/whatsapp/media";

// Ключи канала компании: токен и номер должны уйти в Meta именно эти, а не из env.
const creds = { accessToken: "TOKEN-КАНАЛА", phoneNumberId: "PNID-КАНАЛА" };

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function authOf(fetchMock: ReturnType<typeof vi.fn>): string {
  return (fetchMock.mock.calls[0][1] as RequestInit).headers
    ? ((fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>).Authorization
    : "";
}

test("fetchMediaMeta и downloadMedia ходят с токеном канала", async () => {
  const meta = stubFetch({ url: "https://cdn.test/f", mime_type: "image/jpeg", file_size: 3 });
  await fetchMediaMeta(creds, "M1");
  expect(authOf(meta)).toBe("Bearer TOKEN-КАНАЛА");

  const download = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
  vi.stubGlobal("fetch", download);
  await downloadMedia(creds, "https://cdn.test/f", 1024);
  expect(authOf(download)).toBe("Bearer TOKEN-КАНАЛА");
});

test("uploadMedia и sendMediaMessage используют номер и токен канала", async () => {
  const upload = stubFetch({ id: "MEDIA-ID" });
  await uploadMedia(creds, { bytes: new Uint8Array([1]), mimeType: "image/png", filename: "a.png" });
  expect(upload.mock.calls[0][0]).toContain("/PNID-КАНАЛА/media");
  expect(authOf(upload)).toBe("Bearer TOKEN-КАНАЛА");

  const send = stubFetch({ messages: [{ id: "wamid.X" }] });
  await sendMediaMessage(creds, "77010000000", "image", "MEDIA-ID");
  expect(send.mock.calls[0][0]).toContain("/PNID-КАНАЛА/messages");
  expect(authOf(send)).toBe("Bearer TOKEN-КАНАЛА");
});
