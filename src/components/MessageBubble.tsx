import { AlertIcon, AttachmentIcon, CheckIcon, DoubleCheckIcon } from "@/components/icons";
import type { ThreadMessage } from "@/lib/conversations";
import { statusLabel, timeLabel } from "@/lib/format";

function StatusMark({ status }: { status: string | null }) {
  const label = statusLabel(status);
  if (!label) {
    return null;
  }

  const Mark = status === "failed" ? AlertIcon : status === "sent" ? CheckIcon : DoubleCheckIcon;

  return (
    <span
      className={`inline-flex items-center gap-1 ${status === "failed" ? "text-danger" : ""}`}
      title={label}
    >
      <Mark className={status === "read" ? "size-3.5 opacity-100" : "size-3.5 opacity-70"} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function MessageBubble({ message }: { message: ThreadMessage }) {
  const outbound = message.direction === "OUTBOUND";

  return (
    <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[min(34rem,80%)] rounded-2xl px-3.5 py-2.5 shadow-bubble ${
          outbound
            ? "rounded-br-sm bg-accent text-accent-ink"
            : "rounded-bl-sm border border-line bg-raised text-ink"
        }`}
      >
        {message.text ? (
          <p className="text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap">
            {message.text}
          </p>
        ) : (
          <p className="flex items-center gap-2 text-[0.9375rem] italic opacity-90">
            <AttachmentIcon className="size-4" />
            Вложение: {message.type}
          </p>
        )}

        <div
          className={`mt-1 flex items-center justify-end gap-1.5 text-[0.6875rem] tabular-nums ${
            outbound ? "opacity-80" : "text-ink-faint"
          }`}
        >
          {timeLabel(message.timestamp)}
          {outbound && <StatusMark status={message.status} />}
        </div>
      </div>
    </div>
  );
}
