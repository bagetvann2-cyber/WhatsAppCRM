"use client";

import { useActionState, useState } from "react";
import { AlertIcon, BoltIcon } from "@/components/icons";
import { saveBotAction, testBotAction, type FormState, type TestState } from "@/app/(app)/ai-bot/actions";
import { DEFAULT_STUB, DEFAULT_STUB_KZ, MAX_STUB_CHARS, answersLeft } from "@/lib/ai-bot";
import { MODELS } from "@/lib/llm/catalog";

// На нашем ключе доступны только «платформенные» модели каталога.
const PLATFORM_MODELS = MODELS.ANTHROPIC.filter((model) => model.platform);

const INPUT =
  "w-full rounded-lg border border-line bg-panel-muted px-3 py-2 text-sm text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-accent focus:bg-panel";

const PROFILE_PLACEHOLDER = `Стоматология «Улыбка», Алматы, ул. Абая 150.

Услуги и цены:
— чистка 15 000 ₸
— лечение кариеса от 25 000 ₸
— отбеливание 60 000 ₸

Часы работы: пн–сб 9:00–19:00, воскресенье выходной.
Консультация бесплатная. Рассрочка через Kaspi Red до 12 месяцев.`;

export function AiBotForm({
  initial,
}: {
  initial: {
    enabled: boolean;
    model: string;
    companyProfile: string;
    rules: string | null;
    answersLimit: number;
    answersUsed: number;
    /** Когда пакет обнулится, уже отформатировано на сервере. */
    resetsAt: string;
    stubText: string | null;
    stubTextKz: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveBotAction, null);
  const [test, testAction, testing] = useActionState<TestState, FormData>(testBotAction, null);

  const [enabled, setEnabled] = useState(initial.enabled);
  const [model, setModel] = useState(initial.model);

  const modelHint = PLATFORM_MODELS.find((m) => m.id === model)?.hint;
  const left = answersLeft({ answersLimit: initial.answersLimit, answersUsed: initial.answersUsed });

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-5 rounded-xl border border-line bg-panel p-4">
        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            name="enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          <span className="text-sm font-semibold text-ink">Помощник отвечает клиентам</span>
        </label>
        <p className="-mt-3 text-sm text-ink-muted">
          Отвечает на входящие по анкете ниже, пока не подключится оператор. Приветствие и автоответ
          вне рабочих часов имеют приоритет: если сработали они, помощник промолчит.
        </p>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Анкета компании</span>
          <textarea
            name="companyProfile"
            defaultValue={initial.companyProfile}
            rows={12}
            placeholder={PROFILE_PLACEHOLDER}
            className={`${INPUT} resize-y font-[inherit]`}
          />
          <span className="text-xs text-ink-faint">
            Чем подробнее, тем меньше поводов дёргать человека. Всё, чего здесь нет, помощник
            придумывать не станет — он передаст диалог оператору.
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">
            Чего не обещать <span className="font-normal text-ink-faint">— необязательно</span>
          </span>
          <textarea
            name="rules"
            defaultValue={initial.rules ?? ""}
            rows={3}
            placeholder="Скидок не обещать. Точное время записи подтверждает администратор."
            className={`${INPUT} resize-y`}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Модель</span>
          <select
            name="model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className={INPUT}
          >
            {PLATFORM_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-ink-faint">{modelHint}</span>
        </label>

        <div className="rounded-lg bg-accent-soft px-3 py-2.5 text-sm text-accent">
          {initial.answersLimit === 0 ? (
            <span>В вашем тарифе ИИ-помощника нет — он входит в «Бизнес».</span>
          ) : (
            <span>
              Осталось <span className="font-semibold tabular-nums">{left}</span> из {initial.answersLimit} ответов, обновится{" "}
              {initial.resetsAt}. Размер пакета задаёт тариф; когда он кончится, клиентам уйдёт ваш текст ниже.
            </span>
          )}
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium text-ink">
            Если помощник не может ответить <span className="font-normal text-ink-faint">— что увидит клиент</span>
          </legend>
          <input
            name="stubText"
            defaultValue={initial.stubText ?? ""}
            maxLength={MAX_STUB_CHARS}
            placeholder={DEFAULT_STUB}
            aria-label="Текст по-русски"
            className={INPUT}
          />
          <input
            name="stubTextKz"
            defaultValue={initial.stubTextKz ?? ""}
            maxLength={MAX_STUB_CHARS}
            placeholder={DEFAULT_STUB_KZ}
            aria-label="Текст по-казахски"
            className={INPUT}
          />
          <span className="text-xs text-ink-faint">
            Казахский текст уходит, если клиент написал казахскими буквами. Автоответ вне рабочих часов по-прежнему важнее.
          </span>
        </fieldset>

        {state && "error" in state && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            {state.error}
          </p>
        )}

        {state && "ok" in state && (
          <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{state.ok}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
      </form>

      <form action={testAction} className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
        <div className="flex items-center gap-2">
          <BoltIcon className="size-4 text-accent" />
          <p className="text-sm font-semibold text-ink">Проверить на вопросе</p>
        </div>
        <p className="text-sm text-ink-muted">
          Прогон по сохранённой анкете. Клиенту ничего не уходит и пакет ответов не тратится, но проверки на нашем ключе ограничены в сутки.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            name="question"
            placeholder="Сколько стоит чистка?"
            className={INPUT}
          />
          <button
            type="submit"
            disabled={testing}
            className="shrink-0 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-panel-muted disabled:opacity-50"
          >
            {testing ? "Спрашиваем…" : "Спросить"}
          </button>
        </div>

        {test && "error" in test && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            {test.error}
          </p>
        )}

        {test && "answer" in test && (
          <div className="flex flex-col gap-2">
            <div className="max-w-[min(34rem,90%)] rounded-2xl rounded-bl-sm border border-line bg-raised px-3.5 py-2.5 shadow-bubble">
              <p className="text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-ink">
                {test.answer}
              </p>
            </div>
            {test.handoff && (
              <p className="text-sm text-warn">
                Помощник передал бы диалог оператору: {test.handoff}
              </p>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
