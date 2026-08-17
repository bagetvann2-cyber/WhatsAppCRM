"use client";

import { useActionState, useState } from "react";
import { AlertIcon } from "@/components/icons";
import { createBroadcastAction, type FormState } from "@/app/broadcasts/actions";
import { PRICE_PER_MESSAGE } from "@/lib/pricing";
import { renderTemplate } from "@/lib/templates";
import type { TemplateCategory } from "@/generated/prisma/client";

const INPUT =
  "w-full rounded-lg border border-line bg-panel-muted px-3 py-2 text-sm text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-accent focus:bg-panel";

export type ApprovedTemplate = {
  id: string;
  name: string;
  category: TemplateCategory;
  bodyText: string;
  examples: string[];
};

const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  MARKETING: "маркетинг",
  UTILITY: "служебное",
  AUTHENTICATION: "код подтверждения",
};

export function BroadcastForm({
  templates,
  contactCount,
  tags,
}: {
  templates: ApprovedTemplate[];
  contactCount: number;
  tags: { id: string; name: string; count: number }[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createBroadcastAction,
    null,
  );

  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [name, setName] = useState("");
  const [segmentQuery, setSegmentQuery] = useState("");
  const [tagId, setTagId] = useState("");

  const template = templates.find((t) => t.id === templateId);
  const selectedTag = tags.find((t) => t.id === tagId);

  // Точное число получателей знает сервер; здесь оценка по метке или всему списку.
  const estimatedCount = segmentQuery.trim()
    ? null
    : selectedTag
      ? selectedTag.count
      : contactCount;
  const price = template ? PRICE_PER_MESSAGE[template.category] : 0;

  if (templates.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-panel px-4 py-6 text-sm text-ink-muted">
        Нет ни одного одобренного шаблона. Рассылка возможна только по шаблону, который прошёл
        модерацию Meta — начните с раздела «Шаблоны».
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">Шаблон</span>
        <select
          name="templateId"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className={INPUT}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {CATEGORY_LABEL[t.category]}
            </option>
          ))}
        </select>
      </label>

      {template && (
        <div className="rounded-lg bg-panel-muted px-3 py-2.5">
          <p className="text-sm whitespace-pre-wrap text-ink-muted">
            {renderTemplate(template.bodyText, template.examples)}
          </p>
          <p className="mt-1.5 text-xs text-ink-faint">
            Вместо первой переменной подставится имя получателя из карточки контакта. Остальные
            берутся из примеров шаблона и одинаковы для всех.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Название рассылки</span>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Осенняя акция"
            className={INPUT}
          />
          <span className="text-xs text-ink-faint">Видите только вы, в отчётах.</span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Кому</span>
          <input
            name="segmentQuery"
            value={segmentQuery}
            onChange={(e) => setSegmentQuery(e.target.value)}
            placeholder="Пусто — всем контактам"
            className={INPUT}
          />
          <span className="text-xs text-ink-faint">
            Имя или часть номера. Пусто — все {contactCount} контактов.
          </span>
        </label>
      </div>

      {tags.length > 0 && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Метка</span>
          <select
            name="segmentTagId"
            value={tagId}
            onChange={(e) => setTagId(e.target.value)}
            className={INPUT}
          >
            <option value="">Без ограничения по метке</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name} — {tag.count}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-lg bg-accent-soft px-3 py-2.5 text-sm">
        <span className="text-accent">
          Получателей:{" "}
          <span className="font-semibold">
            {estimatedCount === null ? "по фильтру" : estimatedCount}
          </span>
        </span>
        <span className="text-accent">
          Ориентировочно:{" "}
          <span className="font-semibold">
            {estimatedCount === null ? "—" : `${(estimatedCount * price).toLocaleString("ru-RU")} ₸`}
          </span>
        </span>
        <span className="text-xs text-accent/80">{price} ₸ за доставленное сообщение</span>
      </div>

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
          Рассылка запущена. Отчёт обновляется по мере отправки — обновите страницу.
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !templateId}
        className="self-start rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-40"
      >
        {pending ? "Запускаем…" : "Запустить рассылку"}
      </button>

      <p className="text-xs text-ink-faint">
        Отправка идёт с паузами, чтобы не упереться в ограничения Meta. Если доля ошибок превысит
        каждое пятое сообщение, рассылка остановится сама.
      </p>
    </form>
  );
}
