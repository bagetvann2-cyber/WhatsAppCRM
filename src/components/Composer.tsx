"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { AlertIcon, AttachmentIcon, LockIcon, SendIcon } from "@/components/icons";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { sizeLabel } from "@/lib/media";

/** Столько же принимает сервер: предупредить до отправки честнее, чем после. */
const MAX_BYTES = 32 * 1024 * 1024;

export function Composer({
  conversationId,
  windowOpen,
}: {
  conversationId: string;
  windowOpen: boolean;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  /** Длительность записанного голосового; у обычного файла пусто. */
  const [voiceSeconds, setVoiceSeconds] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const empty = text.trim() === "" && !file;

  // Открыли диалог — сразу можно писать, без клика в поле. На телефоне не трогаем:
  // там фокус сам поднимает клавиатуру и закрывает половину переписки.
  useEffect(() => {
    if (windowOpen && window.matchMedia("(pointer: fine)").matches) {
      textarea.current?.focus();
    }
  }, [conversationId, windowOpen]);

  function pickFile(next: File | null) {
    if (!next) {
      return;
    }
    if (next.size > MAX_BYTES) {
      setError(`Файл больше ${sizeLabel(MAX_BYTES)}.`);
      return;
    }
    setError(null);
    setFile(next);
    setVoiceSeconds(null);
    textarea.current?.focus();
  }

  function pickVoice(recorded: File, seconds: number) {
    pickFile(recorded);
    setVoiceSeconds(seconds);
  }

  function clearFile() {
    setFile(null);
    setVoiceSeconds(null);
    if (fileInput.current) {
      fileInput.current.value = "";
    }
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (empty || sending || !windowOpen) {
      return;
    }

    setError(null);
    setSending(true);

    try {
      // С файлом уходит форма, без файла — обычный JSON: сервер понимает оба.
      const request: RequestInit = file
        ? { method: "POST", body: toForm(conversationId, file, text, voiceSeconds !== null) }
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ conversationId, text }),
          };

      const response = await fetch("/api/messages", request);

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Сообщение не ушло. Проверьте связь и попробуйте снова.");
        return;
      }

      setText("");
      clearFile();
      router.refresh();
    } catch {
      setError("Нет связи с сервером. Сообщение не отправлено.");
    } finally {
      setSending(false);
      // Пока поле было занято, фокус мог уйти: возвращаем, чтобы писать дальше без мыши.
      requestAnimationFrame(() => textarea.current?.focus());
    }
  }

  // Enter отправляет, Shift+Enter переносит строку — привычка из любого мессенджера.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  // Ctrl+V со скриншотом или скопированным файлом прикладывает его; чистый текст вставляется как обычно.
  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = event.clipboardData.files[0];
    // Из Word и Excel в буфер попадает и текст, и картинка-снимок: тогда вставляем текст.
    if (pasted && !event.clipboardData.getData("text/plain")) {
      event.preventDefault();
      pickFile(pasted);
    }
  }

  function onDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setDragging(false);
    pickFile(event.dataTransfer.files[0] ?? null);
  }

  if (!windowOpen) {
    return (
      <div className="border-t border-line bg-panel px-4 py-4 md:px-6">
        <div className="flex items-start gap-3 rounded-lg border border-line bg-panel-muted px-4 py-3">
          <LockIcon className="mt-0.5 size-4 shrink-0 text-ink-muted" />
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">Прошло больше 24 часов с сообщения клиента.</span>{" "}
            Правила Meta разрешают писать первым только одобренным шаблоном. Свободный ответ снова
            откроется, как только клиент напишет сам.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={send}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`border-t px-4 py-4 transition-colors md:px-6 ${
        dragging ? "border-accent bg-accent-soft" : "border-line bg-panel"
      }`}
    >
      {error && (
        <p
          role="alert"
          className="mb-3 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      {file && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-line bg-panel-muted px-3 py-2">
          <AttachmentIcon className="size-4 shrink-0 text-ink-muted" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-ink">
              {voiceSeconds !== null ? `Голосовое сообщение, ${Math.floor(voiceSeconds / 60)}:${String(voiceSeconds % 60).padStart(2, "0")}` : file.name}
            </span>
            <span className="block text-xs text-ink-faint">{sizeLabel(file.size)}</span>
          </span>
          <button
            type="button"
            onClick={clearFile}
            disabled={sending}
            className="shrink-0 text-xs text-ink-muted transition-colors hover:text-danger"
          >
            Убрать
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInput}
          type="file"
          hidden
          onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={sending}
          title="Прикрепить файл"
          aria-label="Прикрепить файл"
          className="grid size-11 shrink-0 place-items-center rounded-xl border border-line text-ink-muted transition-colors hover:border-line-strong hover:bg-panel-muted hover:text-ink disabled:opacity-40"
        >
          <AttachmentIcon className="size-5" />
        </button>

        <VoiceRecorder onRecorded={pickVoice} onError={setError} disabled={sending || Boolean(file)} />

        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          ref={textarea}
          // readOnly, а не disabled: отключённое поле теряет фокус, и после отправки пришлось бы кликать снова.
          readOnly={sending}
          rows={1}
          placeholder={file ? "Подпись к файлу — необязательно" : "Введите сообщение"}
          aria-label="Текст сообщения"
          className="max-h-40 min-h-11 flex-1 resize-y rounded-xl border border-line bg-panel-muted px-4 py-2.5 text-[0.9375rem] text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-accent focus:bg-panel read-only:opacity-60"
        />

        <button
          type="submit"
          disabled={empty || sending}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SendIcon className={`size-4 ${sending ? "animate-pulse" : ""}`} />
          {sending ? "Отправляем" : "Отправить"}
        </button>
      </div>

      <p className="mt-2 text-xs text-ink-faint">
        Enter — отправить, Shift + Enter — новая строка. Файл можно перетащить сюда или вставить через Ctrl + V.
      </p>
    </form>
  );
}

function toForm(conversationId: string, file: File, caption: string, voice: boolean): FormData {
  const form = new FormData();
  form.append("conversationId", conversationId);
  form.append("file", file);
  if (voice) {
    form.append("voice", "1");
  }
  if (caption.trim()) {
    form.append("caption", caption.trim());
  }
  return form;
}
