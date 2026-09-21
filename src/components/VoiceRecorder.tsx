"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MicIcon } from "@/components/icons";
import { muxOggOpus, opusHead, type OpusPacket } from "@/lib/ogg-opus";

/** Дольше пяти минут голосовое никто слушать не станет, а файл вырастет. */
const MAX_SECONDS = 300;
const NATIVE_TYPE = "audio/ogg;codecs=opus";

type Session = { stop: () => Promise<File>; cancel: () => void };

// WebCodecs есть в Chrome и Edge, но не во всех версиях TypeScript-типов: описываем нужное сами.
type AudioFrame = { sampleRate: number; numberOfChannels: number; close: () => void };
type TrackProcessor = { readable: { getReader: () => ReadableStreamDefaultReader<AudioFrame> } };
declare global {
  interface Window {
    MediaStreamTrackProcessor?: new (init: { track: MediaStreamTrack }) => TrackProcessor;
  }
}

/** Firefox пишет Ogg/Opus сам; Chrome и Edge — только WebM, там кодируем через WebCodecs. */
function recorderKind(): "native" | "webcodecs" | null {
  if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(NATIVE_TYPE)) {
    return "native";
  }
  if (typeof AudioEncoder !== "undefined" && window.MediaStreamTrackProcessor) {
    return "webcodecs";
  }
  return null;
}

function nativeSession(stream: MediaStream): Session {
  const recorder = new MediaRecorder(stream, { mimeType: NATIVE_TYPE });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => event.data.size > 0 && chunks.push(event.data);
  recorder.start();

  return {
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => resolve(new File(chunks, "voice.ogg", { type: "audio/ogg" }));
        recorder.stop();
      }),
    cancel: () => {
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
    },
  };
}

function webCodecsSession(stream: MediaStream): Session {
  const track = stream.getAudioTracks()[0];
  const reader = new window.MediaStreamTrackProcessor!({ track }).readable.getReader();
  const packets: OpusPacket[] = [];
  let head: Uint8Array | null = null;
  let format: { sampleRate: number; channels: number } | null = null;
  let failure: unknown = null;

  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      // Длительность в микросекундах; Ogg считает отсчётами по 48 кГц.
      packets.push({ data, samples: Math.round(((chunk.duration ?? 20_000) * 48) / 1000) });
      const description = meta?.decoderConfig?.description;
      if (description && !head) {
        head = new Uint8Array(description instanceof ArrayBuffer ? description : (description as ArrayBufferView).buffer.slice(0));
      }
    },
    error: (error) => {
      failure = error;
    },
  });

  // Формат берём у первого кадра: микрофон сам решает, моно он или стерео и на какой частоте.
  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (!value) continue;
      if (!format) {
        format = { sampleRate: value.sampleRate, channels: Math.min(value.numberOfChannels, 2) };
        encoder.configure({ codec: "opus", sampleRate: format.sampleRate, numberOfChannels: format.channels, bitrate: 32_000 });
      }
      encoder.encode(value as unknown as AudioData);
      value.close();
    }
  })().catch((error) => {
    failure = error;
  });

  return {
    stop: async () => {
      track.stop();
      await pump;
      if (format && encoder.state === "configured") await encoder.flush();
      if (encoder.state !== "closed") encoder.close();
      if (failure || !format || packets.length === 0) {
        throw new Error("Не удалось записать звук");
      }
      const bytes = muxOggOpus(head ?? opusHead(format.sampleRate, 312, format.channels), packets);
      return new File([new Uint8Array(bytes)], "voice.ogg", { type: "audio/ogg" });
    },
    cancel: () => {
      track.stop();
      void reader.cancel().catch(() => {});
      if (encoder.state !== "closed") encoder.close();
    },
  };
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Кнопка микрофона для композера: запись, таймер, «Готово» и «Отмена». Нет поддержки — кнопки нет. */
export function VoiceRecorder({
  onRecorded,
  onError,
  disabled,
}: {
  onRecorded: (file: File, seconds: number) => void;
  onError: (message: string) => void;
  disabled: boolean;
}) {
  // На сервере и при первой отрисовке false, в браузере — реальная поддержка: разметка не расходится.
  const supported = useSyncExternalStore(
    () => () => {},
    () => recorderKind() !== null && Boolean(navigator.mediaDevices?.getUserMedia),
    () => false,
  );
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const session = useRef<Session | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const elapsed = useRef(0);

  useEffect(() => () => session.current?.cancel(), []);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      elapsed.current += 1;
      setSeconds(elapsed.current);
      if (elapsed.current >= MAX_SECONDS) void finish();
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finish читает только ref-ы
  }, [recording]);

  function release() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    session.current = null;
    setRecording(false);
  }

  async function begin() {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      session.current = recorderKind() === "native" ? nativeSession(stream.current) : webCodecsSession(stream.current);
      elapsed.current = 0;
      setSeconds(0);
      setRecording(true);
    } catch (error) {
      release();
      onError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Нет доступа к микрофону. Разрешите его в настройках сайта (значок замка в адресной строке)."
          : "Не удалось включить микрофон.",
      );
    }
  }

  async function finish() {
    const current = session.current;
    const length = elapsed.current;
    if (!current) return;
    try {
      const file = await current.stop();
      release();
      // Пустая запись случайного клика хуже, чем отсутствие записи.
      if (length < 1) return;
      onRecorded(file, length);
    } catch (error) {
      release();
      onError(error instanceof Error ? error.message : "Не удалось записать голосовое.");
    }
  }

  function cancel() {
    session.current?.cancel();
    release();
  }

  if (!supported) {
    return null;
  }

  if (recording) {
    return (
      <div className="flex h-11 items-center gap-3 rounded-xl border border-danger px-3">
        <span className="size-2.5 animate-pulse rounded-full bg-danger" aria-hidden="true" />
        <span className="w-10 text-sm tabular-nums text-ink" aria-live="off">
          {clock(seconds)}
        </span>
        <button type="button" onClick={cancel} className="text-xs text-ink-muted transition-colors hover:text-danger">
          Отмена
        </button>
        <button
          type="button"
          onClick={() => void finish()}
          className="rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
        >
          Готово
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void begin()}
      disabled={disabled}
      title="Записать голосовое"
      aria-label="Записать голосовое"
      className="grid size-11 shrink-0 place-items-center rounded-xl border border-line text-ink-muted transition-colors hover:border-line-strong hover:bg-panel-muted hover:text-ink disabled:opacity-40"
    >
      <MicIcon className="size-5" />
    </button>
  );
}
