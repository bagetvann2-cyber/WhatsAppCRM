import type { TemplateCategory } from "@/generated/prisma/client";

export const TEMPLATE_LANGUAGES = [
  { code: "ru", label: "Русский" },
  { code: "kk", label: "Қазақша" },
  { code: "en", label: "English" },
] as const;

export const TEMPLATE_CATEGORIES: { value: TemplateCategory; label: string; hint: string }[] = [
  {
    value: "MARKETING",
    label: "Маркетинг",
    hint: "Акции, новости, приглашения. Самая дорогая категория и самая строгая модерация. Обязательна возможность отписаться.",
  },
  {
    value: "UTILITY",
    label: "Служебное",
    hint: "Подтверждение записи, статус заказа, напоминание. Дешевле маркетинга, но должно относиться к действию клиента.",
  },
  {
    value: "AUTHENTICATION",
    label: "Код подтверждения",
    hint: "Одноразовые коды входа. Отдельная тарификация и жёсткий формат.",
  },
];

export const LIMITS = {
  name: 512,
  header: 60,
  body: 1024,
  footer: 60,
} as const;

/** Порядковые номера переменных в тексте: «Здравствуйте, {{1}}» → [1]. */
export function extractVariables(text: string): number[] {
  const found = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return [...new Set(found)].sort((a, b) => a - b);
}

export type TemplateDraft = {
  name: string;
  language: string;
  category: TemplateCategory;
  headerText?: string | null;
  bodyText: string;
  footerText?: string | null;
  examples: string[];
};

/**
 * Проверка по правилам Meta. Каждое правило здесь — причина, по которой
 * модерация отклоняет шаблон, а цикл «отправил — сутки ждал — отказ» повторяется.
 */
export function validateTemplate(draft: TemplateDraft): string[] {
  const errors: string[] = [];
  const name = draft.name.trim();
  const body = draft.bodyText.trim();
  const header = draft.headerText?.trim() ?? "";
  const footer = draft.footerText?.trim() ?? "";

  if (!name) {
    errors.push("Укажите название шаблона.");
  } else if (!/^[a-z0-9_]+$/.test(name)) {
    errors.push(
      "В названии допустимы только латинские строчные буквы, цифры и подчёркивание — таково требование Meta. Например: zapis_podtverzhdenie.",
    );
  } else if (name.length > LIMITS.name) {
    errors.push(`Название длиннее ${LIMITS.name} символов.`);
  }

  if (!TEMPLATE_LANGUAGES.some((l) => l.code === draft.language)) {
    errors.push("Выберите язык шаблона.");
  }

  if (!body) {
    errors.push("Текст сообщения не может быть пустым.");
  }
  if (body.length > LIMITS.body) {
    errors.push(`Текст длиннее ${LIMITS.body} символов — Meta такой не примет.`);
  }
  if (header.length > LIMITS.header) {
    errors.push(`Заголовок длиннее ${LIMITS.header} символов.`);
  }
  if (footer.length > LIMITS.footer) {
    errors.push(`Подпись длиннее ${LIMITS.footer} символов.`);
  }

  if (extractVariables(header).length > 0) {
    errors.push("В заголовке переменные не поддерживаются — оставьте его постоянным.");
  }
  if (extractVariables(footer).length > 0) {
    errors.push("В подписи переменные не поддерживаются.");
  }

  const variables = extractVariables(body);

  variables.forEach((num, index) => {
    if (num !== index + 1) {
      errors.push(
        `Переменные должны идти подряд начиная с {{1}}: сейчас пропущена {{${index + 1}}}.`,
      );
    }
  });

  if (body && variables.length > 0) {
    if (/^\s*\{\{\d+\}\}/.test(body)) {
      errors.push("Сообщение не может начинаться с переменной — добавьте текст перед ней.");
    }
    if (/\{\{\d+\}\}\s*$/.test(body)) {
      errors.push("Сообщение не может заканчиваться переменной — добавьте текст после неё.");
    }
    if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(body)) {
      errors.push("Две переменные подряд Meta не принимает — разделите их текстом.");
    }
  }

  const filled = draft.examples.filter((value) => value.trim() !== "").length;
  if (filled < variables.length) {
    errors.push(
      "Заполните примеры для всех переменных: без них Meta не принимает шаблон на модерацию.",
    );
  }

  return errors;
}

/** Подставляет значения вместо {{1}}, {{2}} — для предпросмотра и для рассылок. */
export function renderTemplate(text: string, values: string[]): string {
  return text.replace(/\{\{(\d+)\}\}/g, (match, num) => {
    const value = values[Number(num) - 1];
    return value?.trim() ? value : match;
  });
}

/** Тело запроса к Graph API: /{waba-id}/message_templates */
export function toMetaPayload(draft: TemplateDraft) {
  const components: Record<string, unknown>[] = [];
  const header = draft.headerText?.trim();
  const footer = draft.footerText?.trim();
  const body = draft.bodyText.trim();
  const variables = extractVariables(body);

  if (header) {
    components.push({ type: "HEADER", format: "TEXT", text: header });
  }

  const bodyComponent: Record<string, unknown> = { type: "BODY", text: body };
  if (variables.length > 0) {
    bodyComponent.example = { body_text: [draft.examples.slice(0, variables.length)] };
  }
  components.push(bodyComponent);

  if (footer) {
    components.push({ type: "FOOTER", text: footer });
  }

  return {
    name: draft.name.trim(),
    language: draft.language,
    category: draft.category,
    components,
  };
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "черновик",
  PENDING: "на модерации",
  APPROVED: "одобрен",
  REJECTED: "отклонён",
  PAUSED: "приостановлен",
  DISABLED: "отключён",
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status.toLowerCase();
}
