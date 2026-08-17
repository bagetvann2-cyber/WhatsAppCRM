export type IncomingMessage = {
  wamid: string;
  from: string;
  profileName: string | null;
  phoneNumberId: string;
  type: string;
  text: string | null;
  timestamp: Date;
};

export type StatusUpdate = {
  wamid: string;
  status: string;
  timestamp: Date;
};

export type ParsedWebhook = {
  messages: IncomingMessage[];
  statuses: StatusUpdate[];
};

function toDate(seconds: unknown): Date {
  return new Date(Number(seconds) * 1000);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Превращает вложенный payload Meta в плоские списки.
 * Ничего не бросает: на неизвестной структуре возвращает пустой результат,
 * иначе один странный запрос уронил бы приём всех остальных.
 */
export function parseWebhook(payload: unknown): ParsedWebhook {
  const messages: IncomingMessage[] = [];
  const statuses: StatusUpdate[] = [];

  for (const entry of asArray(asRecord(payload).entry)) {
    for (const change of asArray(asRecord(entry).changes)) {
      const value = asRecord(asRecord(change).value);
      const metadata = asRecord(value.metadata);
      const phoneNumberId = String(metadata.phone_number_id ?? "");

      const nameByWaId = new Map<string, string | null>();
      for (const contact of asArray(value.contacts)) {
        const record = asRecord(contact);
        const profile = asRecord(record.profile);
        nameByWaId.set(String(record.wa_id ?? ""), (profile.name as string) ?? null);
      }

      for (const raw of asArray(value.messages)) {
        const message = asRecord(raw);
        const from = String(message.from ?? "");
        const text = asRecord(message.text).body;

        messages.push({
          wamid: String(message.id ?? ""),
          from,
          profileName: nameByWaId.get(from) ?? null,
          phoneNumberId,
          type: String(message.type ?? "unknown"),
          text: typeof text === "string" ? text : null,
          timestamp: toDate(message.timestamp),
        });
      }

      for (const raw of asArray(value.statuses)) {
        const status = asRecord(raw);
        statuses.push({
          wamid: String(status.id ?? ""),
          status: String(status.status ?? ""),
          timestamp: toDate(status.timestamp),
        });
      }
    }
  }

  return { messages, statuses };
}
