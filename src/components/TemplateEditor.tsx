"use client";

import { useActionState, useLayoutEffect, useRef, useState } from "react";
import { AlertIcon, CheckIcon, ClockIcon } from "@/components/icons";
import { createTemplateAction, type FormState } from "@/app/(app)/templates/actions";
import { PRICE_PER_MESSAGE } from "@/lib/pricing";
import {
  LIMITS,
  TEMPLATE_CATEGORIES,
  TEMPLATE_LANGUAGES,
  VARIABLE_PRESETS,
  insertVariable,
  renderTemplate,
  suggestTemplateName,
  syncVariables,
  validateTemplate,
  type TemplateBody,
} from "@/lib/templates";
import type { TemplateCategory } from "@/generated/prisma/client";

const INPUT =
  "w-full rounded-lg border border-line bg-panel-muted px-3 py-2 text-sm text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-accent focus:bg-panel";

/** Одной строкой: что этой категорией можно, а что нельзя. */
const CATEGORY_SUMMARY: Record<TemplateCategory, string> = {
  UTILITY: "Только про то, что клиент уже начал: запись, заказ, визит",
  MARKETING: "Акции и приглашения. Проверяют строже, отписаться клиент может всегда",
  AUTHENTICATION: "Только одноразовые коды входа, без единого лишнего слова",
};

export function TemplateEditor() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createTemplateAction,
    null,
  );

  const [category, setCategory] = useState<TemplateCategory>("UTILITY");
  const [language, setLanguage] = useState("ru");
  const [headerText, setHeaderText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [body, setBody] = useState<TemplateBody>({ text: "", slots: [] });

  // Имя нужно только Meta. Пока владелец не правил его сам, оно идёт за текстом.
  const [customName, setCustomName] = useState<string | null>(null);
  const name = customName ?? suggestTemplateName(body.text);

  const textarea = useRef<HTMLTextAreaElement>(null);

  // Куда вернуть курсор после вставки. Ставим его только когда React уже
  // дорисовал новый текст: иначе следующее слово печатается в начало строки.
  const pendingCaret = useRef<number | null>(null);

  useLayoutEffect(() => {
    const target = pendingCaret.current;
    if (target === null) {
      return;
    }

    pendingCaret.current = null;
    textarea.current?.focus();
    textarea.current?.setSelectionRange(target, target);
  });

  const examples = body.slots.map((slot) => slot.example);
  const draft = { name, language, category, headerText, bodyText: body.text, footerText, examples };
  // Пока форма пустая, замечания молчат: пустой экран не должен встречать ошибками.
  const problems = body.text.trim() ? validateTemplate(draft) : [];
  const ready = body.text.trim().length > 0 && problems.length === 0;

  function addVariable(preset: { label: string; example: string }) {
    const field = textarea.current;
    const caret = field?.selectionStart ?? body.text.length;
    const next = insertVariable(body, { ...preset }, caret);

    pendingCaret.current = next.caret;
    setBody({ text: next.text, slots: next.slots });
  }

  function setExample(index: number, value: string) {
    setBody((prev) => ({
      ...prev,
      slots: prev.slots.map((slot, i) => (i === index ? { ...slot, example: value } : slot)),
    }));
  }

  function removeVariable(index: number) {
    const number = index + 1;
    const withoutPlaceholder = body.text.replace(new RegExp(`\\s?\\{\\{${number}\\}\\}`, "g"), "");
    setBody(syncVariables(body, withoutPlaceholder));
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <form action={formAction} className="flex flex-col gap-7">
        <input type="hidden" name="name" value={name} />
        {body.slots.map((slot, index) => (
          <input key={index} type="hidden" name={`example${index + 1}`} value={slot.example} />
        ))}

        <fieldset className="flex flex-col gap-2.5">
          <legend className="text-sm font-medium text-ink">О чём сообщение</legend>
          <p className="text-xs text-ink-muted">
            От этого зависит цена сообщения и то, насколько строго Meta проверит текст.
          </p>

          <div className="grid gap-2 sm:grid-cols-3">
            {TEMPLATE_CATEGORIES.map((option) => {
              const active = category === option.value;
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition-colors ${
                    active
                      ? "border-accent bg-accent-soft"
                      : "border-line bg-panel-muted hover:border-line-strong"
                  }`}
                >
                  <input
                    type="radio"
                    name="category"
                    value={option.value}
                    checked={active}
                    onChange={() => setCategory(option.value)}
                    className="sr-only"
                  />
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`text-sm font-semibold ${active ? "text-accent" : "text-ink"}`}>
                      {option.label}
                    </span>
                    <span className="text-xs whitespace-nowrap text-ink-muted">
                      {PRICE_PER_MESSAGE[option.value]} ₸
                    </span>
                  </span>
                  <span className="text-xs leading-snug text-ink-muted">
                    {CATEGORY_SUMMARY[option.value]}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2.5">
          <label htmlFor="bodyText" className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-ink">Текст сообщения</span>
            <span className="text-xs text-ink-faint">
              {body.text.length} / {LIMITS.body}
            </span>
          </label>

          <textarea
            id="bodyText"
            ref={textarea}
            name="bodyText"
            value={body.text}
            onChange={(e) => setBody(syncVariables(body, e.target.value))}
            rows={5}
            placeholder="Здравствуйте! Вы записаны на приём. Ждём вас."
            className={`${INPUT} resize-y leading-relaxed`}
          />

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-ink-muted">Подставить данные клиента:</span>
            {VARIABLE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => addVariable(preset)}
                className="rounded-full border border-line bg-panel-muted px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-accent hover:text-accent"
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => addVariable({ label: "Своё значение", example: "" })}
              className="rounded-full border border-dashed border-line px-2.5 py-1 text-xs text-ink-faint transition-colors hover:border-accent hover:text-accent"
            >
              Другое
            </button>
          </div>
        </div>

        {body.slots.length > 0 && (
          <fieldset className="flex flex-col gap-3 rounded-xl border border-line bg-panel-muted p-4">
            <legend className="px-1 text-sm font-medium text-ink">Что подставится</legend>
            <p className="-mt-1 text-xs text-ink-muted">
              У каждого клиента здесь будут его данные. Примеры видит только Meta — по ним она
              проверяет, что сообщение осмысленное.
            </p>

            {body.slots.map((slot, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-xs font-semibold text-accent">
                  {index + 1}
                </span>
                <span className="w-32 shrink-0 text-sm text-ink">{slot.label}</span>
                <input
                  value={slot.example}
                  onChange={(e) => setExample(index, e.target.value)}
                  placeholder="Например, Айгерим"
                  aria-label={`Пример значения для «${slot.label}»`}
                  className={`${INPUT} min-w-40 flex-1`}
                />
                <button
                  type="button"
                  onClick={() => removeVariable(index)}
                  className="rounded-lg px-2 py-1 text-xs text-ink-faint transition-colors hover:text-danger"
                >
                  Убрать
                </button>
              </div>
            ))}
          </fieldset>
        )}

        <details className="group rounded-xl border border-line px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-ink marker:text-ink-faint">
            Шапка, подпись и язык
            <span className="ml-1.5 text-xs font-normal text-ink-faint">— необязательно</span>
          </summary>

          <div className="mt-4 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-ink">Шапка сообщения</span>
              <input
                name="headerText"
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                placeholder="Стоматология «Улыбка»"
                maxLength={LIMITS.header}
                className={INPUT}
              />
              <span className="text-xs text-ink-faint">
                Жирная строка над текстом. Обычно название компании.
              </span>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-ink">Подпись</span>
              <input
                name="footerText"
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                placeholder="Отменить запись можно по телефону"
                maxLength={LIMITS.footer}
                className={INPUT}
              />
              <span className="text-xs text-ink-faint">Мелкая строка внизу сообщения.</span>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-ink">Язык сообщения</span>
              <select
                name="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className={`${INPUT} sm:max-w-52`}
              >
                {TEMPLATE_LANGUAGES.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-ink">Служебное имя</span>
              <input
                value={name}
                onChange={(e) => setCustomName(e.target.value)}
                className={`${INPUT} font-mono text-xs`}
              />
              <span className="text-xs text-ink-faint">
                Под этим именем шаблон хранится в Meta. Составляется само, клиент его не видит.
              </span>
            </label>
          </div>
        </details>

        {problems.length > 0 && (
          <ul className="flex flex-col gap-1.5 rounded-lg bg-warn-soft px-3 py-2.5">
            {problems.map((problem) => (
              <li key={problem} className="flex items-start gap-2 text-sm text-warn">
                <AlertIcon className="mt-0.5 size-4 shrink-0" />
                {problem}
              </li>
            ))}
          </ul>
        )}

        {state && "error" in state && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            {state.error}
          </p>
        )}

        {state && "ok" in state && (
          <p className="flex items-start gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
            <CheckIcon className="mt-0.5 size-4 shrink-0" />
            {state.ok === "sent"
              ? "Шаблон ушёл на проверку в Meta. Статус появится в списке ниже."
              : "Шаблон сохранён. Отправить на проверку можно в списке ниже."}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            name="intent"
            value="review"
            disabled={pending || !ready}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Отправляем…" : "Отправить на проверку"}
          </button>

          <button
            type="submit"
            name="intent"
            value="draft"
            disabled={pending || !body.text.trim()}
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Сохранить и доделать позже
          </button>

          <span className="flex items-center gap-1.5 text-xs text-ink-faint">
            <ClockIcon className="size-3.5" />
            Meta отвечает от нескольких минут до суток
          </span>
        </div>
      </form>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 text-sm font-medium text-ink">Так это придёт клиенту</p>

        <div className="rounded-xl border border-line bg-page p-4">
          <div className="max-w-[17rem] rounded-2xl rounded-bl-sm border border-line bg-raised px-3.5 py-2.5 shadow-bubble">
            {headerText.trim() && (
              <p className="mb-1 text-[0.9375rem] font-bold break-words text-ink">{headerText}</p>
            )}
            <p className="text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap text-ink">
              {body.text.trim() ? (
                renderTemplate(body.text, examples)
              ) : (
                <span className="text-ink-faint">Начните печатать — текст появится здесь.</span>
              )}
            </p>
            {footerText.trim() && (
              <p className="mt-1.5 text-xs break-words text-ink-faint">{footerText}</p>
            )}
            <p className="mt-1 text-right text-[0.6875rem] text-ink-faint">16:30</p>
          </div>
        </div>

        <p className="mt-2.5 text-xs leading-relaxed text-ink-faint">
          {body.slots.length > 0
            ? "Вместо примеров у каждого клиента подставятся его данные."
            : "Пока без подстановок: все клиенты получат одинаковый текст."}
        </p>
      </aside>
    </div>
  );
}
