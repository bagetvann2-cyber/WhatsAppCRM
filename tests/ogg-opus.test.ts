import { expect, test } from "vitest";
import { muxOggOpus, oggCrc, opusHead, type OpusPacket } from "@/lib/ogg-opus";

/** Разбирает файл обратно по RFC 3533: так проверяем, что контейнер собран по правилам. */
function parse(file: Uint8Array) {
  const pages: { flags: number; granule: number; sequence: number; crcOk: boolean; packets: Uint8Array[] }[] = [];
  let offset = 0;
  while (offset < file.length) {
    expect(String.fromCharCode(...file.slice(offset, offset + 4))).toBe("OggS");
    const view = new DataView(file.buffer, file.byteOffset + offset);
    const segments = file[offset + 26];
    const lacing = [...file.slice(offset + 27, offset + 27 + segments)];
    const bodyLength = lacing.reduce((a, b) => a + b, 0);
    const pageLength = 27 + segments + bodyLength;

    const raw = file.slice(offset, offset + pageLength);
    const stored = new DataView(raw.buffer).getUint32(22, true);
    raw.set([0, 0, 0, 0], 22);

    const packets: Uint8Array[] = [];
    let body = offset + 27 + segments;
    let current = 0;
    let start = body;
    for (const size of lacing) {
      current += size;
      body += size;
      if (size < 255) {
        packets.push(file.slice(start, start + current));
        start = body;
        current = 0;
      }
    }

    pages.push({
      flags: file[offset + 5],
      granule: view.getUint32(6, true) + view.getUint32(10, true) * 2 ** 32,
      sequence: view.getUint32(18, true),
      crcOk: oggCrc(raw) === stored,
      packets,
    });
    offset += pageLength;
  }
  return pages;
}

function packet(size: number, fill: number): OpusPacket {
  return { data: new Uint8Array(size).fill(fill), samples: 960 };
}

test("CRC совпадает с эталоном Ogg: пустая страница OggS даёт известное значение", () => {
  // Контрольное значение для 'OggS' — считается независимо от muxOggOpus.
  expect(oggCrc(new Uint8Array([0x4f, 0x67, 0x67, 0x53]))).toBe(0x5fb0a94f);
});

test("файл: заголовки, звук, метки первой и последней страницы, CRC и гранулы", () => {
  const head = opusHead(48000, 312);
  const packets = [packet(80, 1), packet(90, 2), packet(300, 3), packet(1, 4)];

  const pages = parse(muxOggOpus(head, packets));

  expect(pages.every((p) => p.crcOk)).toBe(true);
  expect(pages.map((p) => p.sequence)).toEqual([0, 1, 2]);
  expect(pages[0].flags).toBe(0x02); // начало потока
  expect(pages[0].packets[0]).toEqual(head);
  expect(new TextDecoder().decode(pages[1].packets[0].slice(0, 8))).toBe("OpusTags");
  expect(pages[2].flags).toBe(0x04); // конец потока
  expect(pages[2].packets.map((p) => p.length)).toEqual([80, 90, 300, 1]);
  expect(pages[2].packets[2][0]).toBe(3);
  expect(pages[2].granule).toBe(4 * 960);
});

test("длинный звук делится на страницы, гранула растёт, пакеты не теряются", () => {
  const packets = Array.from({ length: 130 }, (_, i) => packet(60 + (i % 5), i % 250));

  const pages = parse(muxOggOpus(opusHead(48000, 312), packets));
  const audio = pages.slice(2);

  expect(audio.length).toBe(3); // 50 + 50 + 30
  expect(audio.map((p) => p.granule)).toEqual([50 * 960, 100 * 960, 130 * 960]);
  expect(audio.flatMap((p) => p.packets).length).toBe(130);
  expect(audio.at(-1)!.flags).toBe(0x04);
  expect(audio.every((p) => p.crcOk)).toBe(true);
});
