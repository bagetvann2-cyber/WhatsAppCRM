import { prisma } from "@/lib/db";
import { whatsAppCredentials } from "@/lib/channels/whatsapp";
import { fetchPhoneNumberInfo, type PhoneNumberInfo } from "@/lib/whatsapp/embedded-signup";

export type ChannelSummary = {
  id: string;
  type: string;
  connectionMethod: string;
  name: string;
  status: string;
  statusError: string | null;
  externalUsername: string | null;
  /** Только для активного WhatsApp-канала — читается у Meta вживую при каждом заходе на страницу. */
  quality: PhoneNumberInfo | null;
};

/**
 * Список каналов организации с актуальным статусом номера. Качество и лимит
 * не кэшируются нигде в базе — Meta может поменять их в любой момент,
 * а страница подключения смотрят нечасто, лишний запрос не жалко.
 */
export async function getChannelsWithStatus(organizationId: string): Promise<ChannelSummary[]> {
  const channels = await prisma.channel.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });

  return Promise.all(
    channels.map(async (channel) => {
      let quality: PhoneNumberInfo | null = null;

      if (channel.type === "WHATSAPP" && channel.status === "ACTIVE" && channel.credentialsEncrypted) {
        try {
          const creds = whatsAppCredentials(channel);
          quality = await fetchPhoneNumberInfo(creds.phoneNumberId, creds.accessToken);
        } catch {
          // Статус не критичен для работы канала — сбой чтения не должен ронять страницу.
          quality = null;
        }
      }

      return {
        id: channel.id,
        type: channel.type,
        connectionMethod: channel.connectionMethod,
        name: channel.name,
        status: channel.status,
        statusError: channel.statusError,
        externalUsername: channel.externalUsername,
        quality,
      };
    }),
  );
}
