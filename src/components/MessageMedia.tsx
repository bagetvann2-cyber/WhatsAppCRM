import { AlertIcon, AttachmentIcon, DownloadIcon } from "@/components/icons";
import type { ThreadMessage } from "@/lib/conversations";
import { mediaKind, mediaLabel, sizeLabel } from "@/lib/media";

/**
 * Вложение внутри пузыря. Файл отдаёт наш маршрут с проверкой организации,
 * поэтому ссылка ведёт на /api/media, а не на CDN Meta.
 */
export function MessageMedia({ message }: { message: ThreadMessage }) {
  const src = `/api/media/${message.id}`;
  const label = mediaLabel(message);
  const size = sizeLabel(message.mediaSize);

  // Копию скачать не удалось — честно говорим об этом вместо пустого квадрата.
  if (message.mediaError && !message.mediaPath) {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
        <AlertIcon className="mt-0.5 size-4 shrink-0" />
        <span>
          {label} не открывается: {message.mediaError}
        </span>
      </p>
    );
  }

  const kind = mediaKind(message.type, message.mimeType);

  if (kind === "image") {
    return (
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        aria-label={`${label} — открыть в полном размере`}
        className="block overflow-hidden rounded-lg"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- файл отдаёт наш маршрут, оптимизатору он недоступен */}
        <img
          src={src}
          alt={message.text ?? label}
          className="max-h-80 w-auto max-w-full object-cover"
        />
      </a>
    );
  }

  if (kind === "video") {
    return (
      <video controls preload="metadata" className="max-h-80 w-full rounded-lg">
        <source src={src} type={message.mimeType ?? undefined} />
        Браузер не умеет показывать это видео.
      </video>
    );
  }

  if (kind === "audio") {
    return (
      <div className="flex min-w-[14rem] flex-col gap-1">
        <audio controls preload="metadata" src={src} className="w-full">
          Браузер не умеет проигрывать это аудио.
        </audio>
        <span className="text-[0.6875rem] opacity-70">
          {label}
          {size && ` · ${size}`}
        </span>
      </div>
    );
  }

  return (
    <a
      href={`${src}?download`}
      className="flex items-center gap-3 rounded-lg border border-line/60 bg-black/5 px-3 py-2.5 transition-colors hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
    >
      <AttachmentIcon className="size-5 shrink-0 opacity-70" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        <span className="block text-[0.6875rem] opacity-70">
          {size ? `${size} · скачать` : "скачать"}
        </span>
      </span>
      <DownloadIcon className="size-4 shrink-0 opacity-70" />
    </a>
  );
}
