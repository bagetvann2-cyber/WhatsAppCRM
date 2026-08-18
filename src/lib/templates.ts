import type { TemplateCategory } from "@/generated/prisma/client";

export const TEMPLATE_LANGUAGES = [
  { code: "ru", label: "Русский" },
  { code: "kk", label: "Қазақша" },
  { code: "en", label: "English" },
] as const;

export const TEMPLATE_CATEGORIES: { value: TemplateCategory; label: string; hint: string }[] = [
  {
    value: "UTILITY",
    label: "Служебное",
    hint: "Подтверждение записи, статус заказа, напоминание. Дешевле маркетинга, но должно относиться к действию клиента.",
  },
  {
    value: "MARKETING",
    label: "Реклама",
    hint: "Акции, новости, приглашения. Самая дорогая категория и самая строгая модерация. Обязательна возможность отписаться.",
  },
  {
    value: "AUTHENTICATION",
    label: "Код входа",
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
    errors.push("Не удалось составить служебное имя — впишите его сами в «Шапка, подпись и язык».");
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
    errors.push("Напишите текст сообщения.");
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
    errors.push("В шапке подстановки не работают: она у всех клиентов одинаковая.");
  }
  if (extractVariables(footer).length > 0) {
    errors.push("В подписи подстановки не работают: она у всех клиентов одинаковая.");
  }

  const variables = extractVariables(body);

  variables.forEach((num, index) => {
    if (num !== index + 1) {
      errors.push(
        "Нумерация подстановок сбилась. Уберите лишнюю подстановку и добавьте заново кнопкой.",
      );
    }
  });

  if (body && variables.length > 0) {
    if (/^\s*\{\{\d+\}\}/.test(body)) {
      errors.push("WhatsApp не принимает сообщение, которое начинается с подставленного значения. Добавьте перед ним слово — например, приветствие.");
    }
    if (/\{\{\d+\}\}\s*$/.test(body)) {
      errors.push("WhatsApp не принимает сообщение, которое заканчивается подставленным значением. Допишите после него хотя бы одно слово.");
    }
    if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(body)) {
      errors.push("Два подставленных значения подряд WhatsApp не пропустит — разделите их словом или знаком.");
    }
  }

  const filled = draft.examples.filter((value) => value.trim() !== "").length;
  if (filled < variables.length) {
    errors.push(
      "Заполните примеры для всех подстановок: без них WhatsApp не принимает шаблон на проверку.",
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

/**
 * Подстановка в шаблоне: клиент видит подпись («Имя клиента»), а Meta —
 * номер {{1}}. Номера здесь нигде не хранятся: порядок задаёт сам текст,
 * поэтому переставленная фраза не может разойтись с примерами значений.
 */
export type TemplateSlot = { label: string; example: string };
export type TemplateBody = { text: string; slots: TemplateSlot[] };

/** Готовые подстановки. Пример нужен Meta для модерации, поэтому он не пустой. */
export const VARIABLE_PRESETS: TemplateSlot[] = [
  { label: "Имя клиента", example: "Айгерим" },
  { label: "Дата и время", example: "четверг, 16:30" },
  { label: "Название услуги", example: "чистка зубов" },
  { label: "Номер заказа", example: "1024" },
  { label: "Сумма", example: "12 000 ₸" },
];

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  ә: "a", ғ: "g", қ: "q", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i",
};

const NAME_MAX = 64;

/**
 * Служебное имя шаблона для Meta: она принимает только латиницу в нижнем
 * регистре, цифры и подчёркивание. Клиенту это знать незачем — имя собирается
 * из первых слов самого сообщения.
 */
export function suggestTemplateName(bodyText: string): string {
  const words = bodyText
    .replace(/\{\{\d+\}\}/g, " ")
    .toLowerCase()
    .split("")
    .map((char) => TRANSLIT[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "shablon";
  }

  let name = "";
  for (const word of words) {
    const next = name ? `${name}_${word}` : word;
    if (next.length > NAME_MAX) {
      break;
    }
    name = next;
  }

  // Первое слово само длиннее предела — режем его, но без хвостового подчёркивания.
  return name || words[0].slice(0, NAME_MAX);
}

/** Номера подстановок в порядке первого появления в тексте. */
function orderOfAppearance(text: string): number[] {
  const order: number[] = [];
  for (const match of text.matchAll(/\{\{(\d+)\}\}/g)) {
    const num = Number(match[1]);
    if (!order.includes(num)) {
      order.push(num);
    }
  }
  return order;
}

function renumber(text: string, order: number[]): string {
  const map = new Map(order.map((num, index) => [num, index + 1]));
  return text.replace(/\{\{(\d+)\}\}/g, (_, digits) => `{{${map.get(Number(digits)) ?? 1}}}`);
}

/**
 * Приводит текст в порядок после ручной правки: Meta отклоняет шаблон, если
 * номера идут не подряд, поэтому оставшиеся подстановки перенумеровываются,
 * а подписи и примеры переезжают вместе с ними.
 */
export function syncVariables(previous: TemplateBody, nextText: string): TemplateBody {
  const order = orderOfAppearance(nextText);

  return {
    text: renumber(nextText, order),
    slots: order.map(
      (num) => previous.slots[num - 1] ?? { label: "Значение", example: "" },
    ),
  };
}

/**
 * Вставляет подстановку в позицию курсора. Номер определяется местом в тексте,
 * а не порядком нажатия кнопок: вставка в начало сдвигает остальные.
 */
export function insertVariable(
  previous: TemplateBody,
  slot: TemplateSlot,
  caret: number,
): TemplateBody & { caret: number } {
  const before = previous.text.slice(0, caret);
  // Пробел дописывается сам: иначе «Ждём вас.» плюс имя даёт «вас.Айгерим».
  const gap = before.length > 0 && !/\s$/.test(before) ? " " : "";

  // Ноль — временная метка новой подстановки: в тексте номера всегда с единицы.
  const marked = `${before}${gap}{{0}}${previous.text.slice(caret)}`;
  const order = orderOfAppearance(marked);
  const inserted = order.indexOf(0) + 1;

  return {
    text: renumber(marked, order),
    slots: order.map((num) => (num === 0 ? slot : previous.slots[num - 1] ?? { label: "Значение", example: "" })),
    caret: caret + gap.length + `{{${inserted}}}`.length,
  };
}
