"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { AlertIcon } from "@/components/icons";
import {
  recheckApiKeyAction,
  removeApiKeyAction,
  saveApiKeyAction,
  saveProviderAction,
  type KeyState,
} from "@/app/(app)/ai-bot/actions";
import { keyErrorText } from "@/lib/ai-bot";
import { MODELS, PROVIDER_INFO, costUsd } from "@/lib/llm/catalog";
import { PROVIDERS, type ProviderId } from "@/lib/llm/types";

const INPUT =
  "w-full rounded-lg border border-line bg-panel-muted px-3 py-2 text-sm text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-accent focus:bg-panel";
const BUTTON =
  "min-h-11 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-panel-muted disabled:opacity-50 md:min-h-0";

export type OwnKeyView = {
  provider: ProviderId;
  hint: string;
  /** Уже отформатировано на сервере: 19.09. */
  checkedAt: string | null;
  error: string | null;
};

function Message({ state }: { state: KeyState }) {
  if (!state) return null;
  if ("error" in state) {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
        <AlertIcon className="mt-0.5 size-4 shrink-0" />
        {state.error}
      </p>
    );
  }
  if ("ok" in state) {
    return <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{state.ok}</p>;
  }
  return null;
}

/** Четыре нейросети нативными radio; недоступная неактивна и называет причину. */
function ProviderRadios({
  legend,
  value,
  onChange,
  disabled = {},
}: {
  legend: string;
  value: ProviderId;
  onChange: (provider: ProviderId) => void;
  disabled?: Partial<Record<ProviderId, string>>;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium text-ink">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {PROVIDERS.map((provider) => {
          const reason = disabled[provider];
          return (
            <label
              key={provider}
              className={`flex min-h-11 items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${
                reason ? "border-line text-ink-faint" : "cursor-pointer border-line text-ink hover:border-line-strong has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
              }`}
            >
              <input
                type="radio"
                name="provider"
                value={provider}
                checked={value === provider}
                disabled={reason !== undefined}
                onChange={() => onChange(provider)}
                className="mt-0.5 size-4 accent-[var(--accent)]"
              />
              <span className="flex flex-col">
                <span className="font-medium">{PROVIDER_INFO[provider].label}</span>
                {reason && <span className="text-xs">{reason}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

const PRIVACY = "Переписка с клиентами передаётся выбранному провайдеру нейросети.";

/** ≈ цена одного ответа на типичном диалоге: анкета из кэша, история и короткий ответ. */
function costLine(provider: ProviderId, model: string): string {
  const usd = costUsd(provider, model, { input: 2650, cached: 2000, output: 150 });
  return usd === null ? "цена по тарифу провайдера" : `≈ $${usd.toFixed(usd < 0.01 ? 4 : 3).replace(".", ",")} за ответ`;
}

export function AiProviderCard({
  provider,
  model,
  ownKey,
  platformProviders,
}: {
  provider: ProviderId;
  model: string;
  ownKey: OwnKeyView | null;
  /** Нейросети, для которых на сервере есть наш ключ. */
  platformProviders: ProviderId[];
}) {
  const [tariffProvider, setTariffProvider] = useState<ProviderId>(provider);
  const [tariffState, tariffAction, tariffPending] = useActionState<KeyState, FormData>(
    (_prev, data) => saveProviderAction(_prev, data),
    null,
  );

  const [keyProvider, setKeyProvider] = useState<ProviderId>(ownKey?.provider ?? "OPENAI");
  const [apiKey, setApiKey] = useState("");
  const [keyModel, setKeyModel] = useState("");
  const [keyState, keyAction, keyPending] = useActionState<KeyState, FormData>(async (prev, data) => {
    const result = await saveApiKeyAction(prev, data);
    if (result && "ok" in result) {
      setApiKey("");
      setKeyModel("");
    }
    return result;
  }, null);

  const [busy, startBusy] = useTransition();
  const [sideState, setSideState] = useState<KeyState>(null);

  const disabledOnTariff = Object.fromEntries(
    PROVIDERS.filter((p) => !platformProviders.includes(p)).map((p) => [
      p,
      PROVIDER_INFO[p].ownKeyOnly ? "Только со своим ключом" : "Пока только со своим ключом",
    ]),
  ) as Partial<Record<ProviderId, string>>;

  const suggestions = MODELS[keyProvider];
  const defaultForKey = suggestions.find((m) => m.platform)?.id;

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">Нейросеть</h2>
        {ownKey ? (
          <p className="mt-1 text-sm text-ink-muted">
            Отвечает через ваш ключ {PROVIDER_INFO[ownKey.provider].label} <span className="tabular-nums">····{ownKey.hint}</span>
            {ownKey.checkedAt && !ownKey.error && <> · проверен {ownKey.checkedAt}</>} · модель {model}.{" "}
            {costLine(ownKey.provider, model)} · списывается с вашего счёта у провайдера.
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">
            Включено в тариф: отвечает {PROVIDER_INFO[provider].label}, пакет ответов задаёт тариф.
          </p>
        )}
      </div>

      {ownKey?.error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            {keyErrorText({ code: ownKey.error, providerLabel: PROVIDER_INFO[ownKey.provider].label })} Клиентам сейчас уходит
            заглушка.{" "}
            <a href={PROVIDER_INFO[ownKey.provider].keyUrl} target="_blank" rel="noopener noreferrer" className="underline">
              Кабинет провайдера
            </a>
          </span>
        </p>
      )}

      {ownKey ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => startBusy(async () => setSideState(await recheckApiKeyAction()))}
              className={BUTTON}
            >
              {busy ? "Проверяем ключ…" : "Проверить снова"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => startBusy(async () => setSideState(await removeApiKeyAction()))}
              className={BUTTON}
            >
              Отключить и вернуться на тариф
            </button>
          </div>
          <Message state={sideState} />
        </div>
      ) : (
        <form action={tariffAction} className="flex flex-col gap-3">
          <ProviderRadios legend="Какая нейросеть отвечает клиентам" value={tariffProvider} onChange={setTariffProvider} disabled={disabledOnTariff} />
          <p className="text-xs text-ink-faint">{PRIVACY}</p>
          <Message state={tariffState} />
          <button type="submit" disabled={tariffPending || tariffProvider === provider} className={`${BUTTON} self-start`}>
            {tariffPending ? "Сохраняем…" : "Сохранить выбор"}
          </button>
        </form>
      )}

      <details className="rounded-lg border border-line px-3 py-2.5" open={Boolean(ownKey?.error)}>
        <summary className="min-h-11 cursor-pointer text-sm font-medium text-ink md:min-h-0">
          {ownKey ? "Заменить ключ или модель" : "Подключить свой API-ключ"}
        </summary>
        <form action={keyAction} className="mt-3 flex flex-col gap-3">
          <ProviderRadios
            legend="Для какой нейросети ваш ключ"
            value={keyProvider}
            onChange={(p) => {
              setKeyProvider(p);
              setKeyModel("");
            }}
          />
          <p className="text-xs text-ink-faint">
            {PRIVACY}{" "}
            <a href={PROVIDER_INFO[keyProvider].keyUrl} target="_blank" rel="noopener noreferrer" className="underline">
              Где взять ключ →
            </a>
            {keyProvider === "OPENAI" && " У OpenAI ключ работает только после пополнения счёта."}
          </p>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">
              Модель{" "}
              <span className="font-normal text-ink-faint">
                {keyProvider === "OPENROUTER" ? "— обязательно" : `— по умолчанию ${defaultForKey ?? "нужна"}`}
              </span>
            </span>
            <input
              name="model"
              value={keyModel}
              onChange={(e) => setKeyModel(e.target.value)}
              list={`models-${keyProvider}`}
              required={keyProvider === "OPENROUTER"}
              autoComplete="off"
              spellCheck={false}
              placeholder={keyProvider === "OPENROUTER" ? "например, meta-llama/llama-3.3-70b-instruct" : defaultForKey}
              className={INPUT}
            />
            <datalist id={`models-${keyProvider}`}>
              {suggestions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </datalist>
            <span className="text-xs text-ink-faint">Модель должна уметь вызывать инструменты: это проверится при сохранении.</span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">API-ключ</span>
            <input
              name="apiKey"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className={`${INPUT} font-mono`}
            />
          </label>

          {keyState && "mismatch" in keyState && (
            <p role="alert" className="flex flex-wrap items-center gap-x-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
              {keyState.mismatch}
              <button type="submit" name="force" value="on" disabled={keyPending} className="min-h-11 font-medium underline md:min-h-0">
                Всё равно проверить
              </button>
            </p>
          )}
          <Message state={keyState} />

          <div className="flex flex-col gap-1.5">
            <button
              type="submit"
              disabled={keyPending || !apiKey.trim()}
              className="min-h-11 self-start rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-50 md:min-h-0"
            >
              {keyPending ? "Проверяем ключ…" : "Проверить и сохранить"}
            </button>
            <span className="text-xs text-ink-faint">
              Проверка — один короткий запрос, меньше цента с вашего счёта. Неверный ключ не сохраняется.
            </span>
          </div>
        </form>
      </details>

      <p className="text-xs text-ink-faint">
        Ключ хранится зашифрованным и после сохранения больше нигде не показывается.{" "}
        <Link href="/billing" className="underline">
          Тариф и пакет ответов
        </Link>
      </p>
    </section>
  );
}
