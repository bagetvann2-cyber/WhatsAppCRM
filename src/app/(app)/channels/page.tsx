import { redirect } from "next/navigation";
import { AlertIcon, CheckIcon } from "@/components/icons";
import { ConnectWhatsAppButton } from "@/components/ConnectWhatsAppButton";
import { ConnectTelegramBot } from "@/components/ConnectTelegramBot";
import { Empty, Group, GroupTitle, PageHead, Row } from "@/components/ledger";
import { getChannelsWithStatus } from "@/lib/channels-store";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";

export const dynamic = "force-dynamic";

export const metadata = { title: "Каналы — WhatsApp CRM" };

const QUALITY_LABEL: Record<string, string> = {
  GREEN: "Хорошее",
  YELLOW: "Среднее",
  RED: "Низкое",
  UNKNOWN: "Пока неизвестно",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Подключается",
  ACTIVE: "Подключён",
  ERROR: "Ошибка подключения",
  DISCONNECTED: "Отключён",
};

export default async function ChannelsPage() {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    redirect("/inbox");
  }

  const channels = await getChannelsWithStatus(organization.id);

  let signupEnv: { appId: string; configId: string } | null = null;
  try {
    signupEnv = { appId: env.appId(), configId: env.configId() };
  } catch {
    // Meta App ещё не настроен — кнопка ниже не покажется, вместо неё подсказка.
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <PageHead title="Каналы">
        Номер WhatsApp подключается через Meta напрямую — мы не видим ваш пароль, а после
        подключения вы сами управляете номером в WhatsApp Manager.
      </PageHead>

      {signupEnv ? (
        <ConnectWhatsAppButton
          appId={signupEnv.appId}
          configId={signupEnv.configId}
          graphVersion={env.graphVersion()}
        />
      ) : (
        <p className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          Подключение через Meta ещё не настроено: не заданы NEXT_PUBLIC_WHATSAPP_APP_ID /
          NEXT_PUBLIC_WHATSAPP_CONFIG_ID.
        </p>
      )}

      <Group>
        <GroupTitle>Подключённые каналы</GroupTitle>
        {channels.length === 0 ? (
          <Empty>Каналов пока нет — подключите номер кнопкой выше.</Empty>
        ) : (
          channels.map((channel) => (
            <Row
              key={channel.id}
              label={channel.externalUsername ?? channel.name}
              note={
                channel.status === "ERROR"
                  ? channel.statusError
                  : channel.quality
                    ? `Качество: ${QUALITY_LABEL[channel.quality.qualityRating] ?? channel.quality.qualityRating} · лимит: ${channel.quality.messagingLimit}`
                    : undefined
              }
              value={STATUS_LABEL[channel.status] ?? channel.status}
              tone={channel.status === "ERROR" ? "warn" : channel.status === "ACTIVE" ? "accent" : "plain"}
            >
              {channel.status === "ACTIVE" && <CheckIcon className="size-4 text-accent" />}
            </Row>
          ))
        )}
      </Group>

      <Group>
        <GroupTitle>Telegram-бот</GroupTitle>
        <p className="border-b border-line py-3.5 text-sm text-ink-muted">
          Создайте бота у{" "}
          <a
            href="https://t.me/BotFather"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline"
          >
            @BotFather
          </a>{" "}
          и вставьте выданный им токен сюда — окна 24 часа у своего бота нет, отвечать можно в
          любой момент.
        </p>
        <ConnectTelegramBot />
      </Group>

      <Group>
        <GroupTitle>Номер уже подключён к приложению WhatsApp Business?</GroupTitle>
        <p className="border-b border-line py-3.5 text-sm text-ink-muted">
          Попробуйте кнопку выше — Meta сама определит, что номер уже используется, и предложит
          дальнейшие шаги в открывшемся окне. Если она потребует сначала отвязать номер от
          приложения на телефоне, сделайте это в настройках WhatsApp Business на самом телефоне и
          вернитесь сюда ещё раз.
        </p>
      </Group>
    </main>
  );
}
