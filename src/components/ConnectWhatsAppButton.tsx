"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { AlertIcon } from "@/components/icons";

declare global {
  interface Window {
    FB?: {
      init: (params: Record<string, unknown>) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } }) => void,
        params: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

type WaEmbeddedSignupMessage = {
  type?: string;
  event?: string;
  data?: { phone_number_id?: string; waba_id?: string; error_message?: string };
};

type Status = { kind: "idle" } | { kind: "connecting" } | { kind: "error"; message: string };

/**
 * Facebook-попап Embedded Signup: возвращает `code` через колбэк FB.login,
 * а phone_number_id/waba_id — отдельно, через postMessage с попапа. Оба
 * куска собираются здесь и уходят на бэкенд одним запросом.
 * Формат события подтверждён по документации Meta (WA_EMBEDDED_SIGNUP,
 * event: FINISH/FINISH_ONLY_WABA/CANCEL).
 */
export function ConnectWhatsAppButton({
  appId,
  configId,
  graphVersion,
}: {
  appId: string;
  configId: string;
  graphVersion: string;
}) {
  const router = useRouter();
  const [sdkReady, setSdkReady] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const pending = useRef<{ phoneNumberId?: string; wabaId?: string }>({});

  useEffect(() => {
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: true, version: graphVersion });
      setSdkReady(true);
    };
  }, [appId, graphVersion]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!event.origin.endsWith("facebook.com")) {
        return;
      }

      let data: WaEmbeddedSignupMessage;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type !== "WA_EMBEDDED_SIGNUP") {
        return;
      }

      if (data.event === "FINISH" || data.event === "FINISH_ONLY_WABA") {
        if (data.data?.phone_number_id) {
          pending.current.phoneNumberId = data.data.phone_number_id;
        }
        if (data.data?.waba_id) {
          pending.current.wabaId = data.data.waba_id;
        }
      }
      if (data.event === "CANCEL" && data.data?.error_message) {
        setStatus({ kind: "error", message: data.data.error_message });
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function connect() {
    if (!window.FB) {
      return;
    }
    pending.current = {};
    setStatus({ kind: "connecting" });

    // FB SDK проверяет, что колбэк — обычная функция: async-функция,
    // переданная напрямую, роняет SDK с «Expression is of type
    // asyncfunction, not function». Поэтому наружу — синхронная обёртка,
    // асинхронная логика — отдельно.
    try {
      window.FB.login(
        (response) => {
          void handleLoginResponse(response);
        },
        {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          extras: { setup: {} },
        },
      );
    } catch {
      setStatus({ kind: "error", message: "Не удалось открыть окно Meta" });
    }
  }

  async function handleLoginResponse(response: { authResponse?: { code?: string } }) {
    const code = response.authResponse?.code;
    const { phoneNumberId, wabaId } = pending.current;

    if (!code || !phoneNumberId || !wabaId) {
      setStatus({ kind: "idle" });
      return;
    }

    try {
      const res = await fetch("/api/channels/whatsapp/embedded-signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, phoneNumberId, wabaId }),
      });
      const result = await res.json();

      if (!res.ok) {
        setStatus({ kind: "error", message: result.error ?? "Не удалось подключить номер" });
        return;
      }

      setStatus({ kind: "idle" });
      router.refresh();
    } catch {
      setStatus({ kind: "error", message: "Не удалось связаться с сервером" });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Script src="https://connect.facebook.net/en_US/sdk.js" strategy="afterInteractive" />

      <button
        type="button"
        onClick={connect}
        disabled={!sdkReady || status.kind === "connecting"}
        className="self-start rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {status.kind === "connecting" ? "Подключаем…" : "Подключить WhatsApp"}
      </button>

      {status.kind === "error" && (
        <p className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          {status.message}
        </p>
      )}
    </div>
  );
}
