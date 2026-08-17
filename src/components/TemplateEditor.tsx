"use client";

import { useActionState, useState } from "react";
import { AlertIcon } from "@/components/icons";
import { createTemplateAction, type FormState } from "@/app/(app)/templates/actions";
import {
  LIMITS,
  TEMPLATE_CATEGORIES,
  TEMPLATE_LANGUAGES,
  extractVariables,
  renderTemplate,
  validateTemplate,
} from "@/lib/templates";
import type { TemplateCategory } from "@/generated/prisma/client";

const INPUT =
  "w-full rounded-lg border border-line bg-panel-muted px-3 py-2 text-sm text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-accent focus:bg-panel";

export function TemplateEditor() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createTemplateAction,
    null,
  );

  const [name, setName] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("UTILITY");
  const [language, setLanguage] = useState("ru");
  const [headerText, setHeaderText] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [examples, setExamples] = useState<string[]>(["", "", ""]);

  const variables = extractVariables(bodyText);
  const draft = { name, language, category, headerText, bodyText, footerText, examples };
  // Показываем замечания только когда есть что проверять — иначе пустая форма кричит ошибками.
  const problems = bodyText.trim() || name.trim() ? validateTemplate(draft) : [];
  const categoryHint = TEMPLATE_CATEGORIES.find((c) => c.value === category)?.hint;

  function setExample(index: number, value: string) {
    setExamples((prev) => prev.map((item, i) => (i === index ? value : item)));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Название</span>
            <input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="zapis_podtverzhdenie"
              className={INPUT}
            />
            <span className="text-xs text-ink-faint">
              Только латиница в нижнем регистре, цифры и подчёркивание. Клиент название не видит.
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Язык</span>
            <select
              name="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className={INPUT}
            >
              {TEMPLATE_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Категория</span>
          <select
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as TemplateCategory)}
            className={INPUT}
          >
            {TEMPLATE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-ink-faint">{categoryHint}</span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">
            Заголовок <span className="font-normal text-ink-faint">— необязательно</span>
          </span>
          <input
            name="headerText"
            value={headerText}
            onChange={(e) => setHeaderText(e.target.value)}
            placeholder="Стоматология «Улыбка»"
            maxLength={LIMITS.header}
            className={INPUT}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between text-sm font-medium text-ink">
            Текст сообщения
            <span className="text-xs font-normal text-ink-faint">
              {bodyText.length} / {LIMITS.body}
            </span>
          </span>
          <textarea
            name="bodyText"
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={5}
            placeholder="Здравствуйте, {{1}}! Вы записаны на {{2}}. Ждём вас."
            className={`${INPUT} resize-y`}
          />
          <span className="text-xs text-ink-faint">
            Подставляемые значения обозначаются как {"{{1}}"}, {"{{2}}"} — по порядку, начиная
            с единицы.
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">
            Подпись <span className="font-normal text-ink-faint">— необязательно</span>
          </span>
          <input
            name="footerText"
            value={footerText}
            onChange={(e) => setFooterText(e.target.value)}
            placeholder="Отменить запись можно по телефону"
            maxLength={LIMITS.footer}
            className={INPUT}
          />
        </label>

        {variables.length > 0 && (
          <fieldset className="flex flex-col gap-3 rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-medium text-ink">Примеры значений</legend>
            <p className="text-xs text-ink-faint">
              Meta проверяет шаблон на живом примере. Без них на модерацию не примут.
            </p>
            {variables.map((num, index) => (
              <label key={num} className="flex items-center gap-3">
                <span className="w-12 shrink-0 text-sm text-ink-muted">{`{{${num}}}`}</span>
                <input
                  name={`example${num}`}
                  value={examples[index] ?? ""}
                  onChange={(e) => setExample(index, e.target.value)}
                  placeholder={index === 0 ? "Айгерим" : "17 августа в 16:30"}
                  className={INPUT}
                />
              </label>
            ))}
          </fieldset>
        )}

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
          <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
            Шаблон сохранён как черновик. Отправьте его на модерацию в списке ниже.
          </p>
        )}

        <button
          type="submit"
          disabled={pending || problems.length > 0 || !bodyText.trim()}
          className="self-start rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Сохраняем…" : "Сохранить черновик"}
        </button>
      </form>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 text-sm font-medium text-ink">Как увидит клиент</p>
        <div className="rounded-xl border border-line bg-page p-4">
          <div className="max-w-[17rem] rounded-2xl rounded-bl-sm border border-line bg-raised px-3.5 py-2.5 shadow-bubble">
            {headerText.trim() && (
              <p className="mb-1 text-[0.9375rem] font-bold break-words text-ink">
                {headerText}
              </p>
            )}
            <p className="text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap text-ink">
              {bodyText.trim()
                ? renderTemplate(bodyText, examples)
                : "Текст появится здесь по мере набора."}
            </p>
            {footerText.trim() && (
              <p className="mt-1.5 text-xs break-words text-ink-faint">{footerText}</p>
            )}
            <p className="mt-1 text-right text-[0.6875rem] text-ink-faint">16:30</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          В предпросмотре подставлены примеры значений. У клиента будут его данные.
        </p>
      </aside>
    </div>
  );
}
