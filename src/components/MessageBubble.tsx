import { MessageMedia } from "@/components/MessageMedia";
import { AlertIcon, AttachmentIcon, CheckIcon, DoubleCheckIcon } from "@/components/icons";
import type { ThreadMessage } from "@/lib/conversations";
import { statusLabel, timeLabel } from "@/lib/format";

const NO_READ_RECEIPTS = "Telegram не сообщает, прочитал ли клиент сообщение";

/**
 * Статус исходящего словами: галочки на зелёном пузыре почти неразличимы,
 * а оператору важно с первого взгляда видеть, прочитали ли клиента.
 * Telegram Bot API не отдаёт ни «доставлено», ни «прочитано» — там честно
 * остаётся «отправлено» с пояснением.
 */
function StatusMark({ status, channelType }: { status: string | null; channelType: string }) {
  const label = statusLabel(status);
  if (!label) {
    return null;
  }

  const Mark = status === "failed" ? AlertIcon : status === "sent" ? CheckIcon : DoubleCheckIcon;
  const read = status === "read";
  const title = channelType === "TELEGRAM" && status === "sent" ? NO_READ_RECEIPTS : label;

  return (
    <span
      className={`inline-flex items-center gap-1 ${
        status === "failed" ? "text-danger" : read ? "font-semibold opacity-100" : "opacity-70"
      }`}
      title={title}
    >
      <Mark className="size-3.5" />
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </span>
  );
}

export function MessageBubble({
  message,
  channelType,
}: {
  message: ThreadMessage;
  channelType: string;
}) {
  const outbound = message.direction === "OUTBOUND";
  const hasMedia = Boolean(message.mediaId || message.mediaPath);

  return (
    <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[min(34rem,80%)] rounded-2xl px-3.5 py-2.5 shadow-bubble ${
          outbound
            ? "rounded-br-sm bg-accent text-accent-ink"
            : "rounded-bl-sm border border-line bg-raised text-ink"
        }`}
      >
        {hasMedia && (
          <div className={message.text ? "mb-2" : ""}>
            <MessageMedia message={message} />
          </div>
        )}

        {message.text ? (
          <p className="text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap">
            {message.text}
          </p>
        ) : (
          !hasMedia && (
            <p className="flex items-center gap-2 text-[0.9375rem] italic opacity-90">
              <AttachmentIcon className="size-4" />
              Сообщение без текста: {message.type}
            </p>
          )
        )}

        <div
          className={`mt-1 flex items-center justify-end gap-1.5 text-[0.6875rem] tabular-nums ${
            outbound ? "" : "text-ink-faint"
          }`}
        >
          <span className={outbound ? "opacity-80" : ""}>{timeLabel(message.timestamp)}</span>
          {outbound && <StatusMark status={message.status} channelType={channelType} />}
        </div>
      </div>
    </div>
  );
}
