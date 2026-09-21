/**
 * Упаковка пакетов Opus в файл Ogg. Chrome и Edge пишут звук только в WebM, а Telegram и
 * WhatsApp принимают голосовое лишь как Ogg/Opus. Кодирует браузер (WebCodecs), нам остаётся
 * сложить готовые пакеты в контейнер без перекодирования.
 * Формат: RFC 3533 (Ogg) и RFC 7845 (Opus в Ogg). Чистые функции, работают и в браузере, и в тестах.
 */

const OPUS_RATE = 48000;

/** CRC страницы Ogg: полином 0x04C11DB7 без отражения битов, начальное значение 0. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) {
      r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    }
    table[i] = r >>> 0;
  }
  return table;
})();

export function oggCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) & 0xff) ^ byte]) >>> 0;
  }
  return crc;
}

export type OpusPacket = {
  data: Uint8Array;
  /** Сколько отсчётов на 48 кГц занимает пакет (20 мс = 960). */
  samples: number;
};

const FLAG_FIRST = 0x02;
const FLAG_LAST = 0x04;
/** Больше секунды звука на страницу не кладём: короткие страницы проще перематывать. */
const MAX_PACKETS_PER_PAGE = 50;
const MAX_SEGMENTS = 255;

/** Стандартный заголовок OpusHead: моно, без усиления. preSkip берут у кодировщика. */
export function opusHead(inputRate: number, preSkip: number, channels = 1): Uint8Array {
  const head = new Uint8Array(19);
  head.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64]); // "OpusHead"
  const view = new DataView(head.buffer);
  head[8] = 1; // версия
  head[9] = channels;
  view.setUint16(10, preSkip, true);
  view.setUint32(12, inputRate, true);
  view.setUint16(16, 0, true); // усиление
  head[18] = 0; // семейство каналов: моно и стерео
  return head;
}

function opusTags(): Uint8Array {
  const vendor = new TextEncoder().encode("whatsapp-crm");
  const tags = new Uint8Array(8 + 4 + vendor.length + 4);
  tags.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73]); // "OpusTags"
  const view = new DataView(tags.buffer);
  view.setUint32(8, vendor.length, true);
  tags.set(vendor, 12);
  view.setUint32(12 + vendor.length, 0, true); // комментариев нет
  return tags;
}

function page(
  packets: Uint8Array[],
  opts: { flags: number; granule: number; serial: number; sequence: number },
): Uint8Array {
  const lacing: number[] = [];
  for (const packet of packets) {
    let left = packet.length;
    while (left >= 255) {
      lacing.push(255);
      left -= 255;
    }
    lacing.push(left);
  }

  const bodyLength = packets.reduce((sum, packet) => sum + packet.length, 0);
  const out = new Uint8Array(27 + lacing.length + bodyLength);
  const view = new DataView(out.buffer);

  out.set([0x4f, 0x67, 0x67, 0x53]); // "OggS"
  out[4] = 0; // версия
  out[5] = opts.flags;
  view.setUint32(6, opts.granule % 2 ** 32, true);
  view.setUint32(10, Math.floor(opts.granule / 2 ** 32), true);
  view.setUint32(14, opts.serial, true);
  view.setUint32(18, opts.sequence, true);
  // CRC (байты 22–25) считается по странице с нулями на его месте.
  out[26] = lacing.length;
  out.set(lacing, 27);

  let offset = 27 + lacing.length;
  for (const packet of packets) {
    out.set(packet, offset);
    offset += packet.length;
  }

  view.setUint32(22, oggCrc(out), true);
  return out;
}

/**
 * Собирает файл Ogg/Opus из заголовка кодировщика и пакетов звука.
 * head — OpusHead (у Chrome лежит в decoderConfig.description первого чанка).
 */
export function muxOggOpus(head: Uint8Array, packets: OpusPacket[], serial = 0x43524d31): Uint8Array {
  const pages: Uint8Array[] = [];
  let sequence = 0;

  pages.push(page([head], { flags: FLAG_FIRST, granule: 0, serial, sequence: sequence++ }));
  pages.push(page([opusTags()], { flags: 0, granule: 0, serial, sequence: sequence++ }));

  // Пакеты одной страницы не должны выходить за 255 сегментов: страницу закрываем заранее.
  let batch: OpusPacket[] = [];
  let batchSegments = 0;
  let granule = 0;
  const segmentsOf = (length: number) => Math.floor(length / 255) + 1;

  function flush(last: boolean) {
    if (batch.length === 0 && !last) return;
    granule += batch.reduce((sum, packet) => sum + packet.samples, 0);
    pages.push(
      page(
        batch.map((packet) => packet.data),
        { flags: last ? FLAG_LAST : 0, granule, serial, sequence: sequence++ },
      ),
    );
    batch = [];
    batchSegments = 0;
  }

  for (const packet of packets) {
    const segments = segmentsOf(packet.data.length);
    if (batch.length >= MAX_PACKETS_PER_PAGE || batchSegments + segments > MAX_SEGMENTS) {
      flush(false);
    }
    batch.push(packet);
    batchSegments += segments;
  }
  flush(true);

  const total = pages.reduce((sum, p) => sum + p.length, 0);
  const file = new Uint8Array(total);
  let offset = 0;
  for (const p of pages) {
    file.set(p, offset);
    offset += p.length;
  }
  return file;
}

export { OPUS_RATE };
