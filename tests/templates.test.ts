import { expect, test } from "vitest";
import {
  extractVariables,
  renderTemplate,
  toMetaPayload,
  validateTemplate,
  type TemplateDraft,
} from "@/lib/templates";

const valid: TemplateDraft = {
  name: "zapis_podtverzhdenie",
  language: "ru",
  category: "UTILITY",
  headerText: "Стоматология «Улыбка»",
  bodyText: "Здравствуйте, {{1}}! Вы записаны на {{2}}. Ждём вас.",
  footerText: "Отменить запись можно по телефону",
  examples: ["Айгерим", "17 августа в 16:30"],
};

test("находит переменные и упорядочивает их", () => {
  expect(extractVariables("Привет, {{1}}, заказ {{2}} готов")).toEqual([1, 2]);
  expect(extractVariables("{{2}} и {{1}} и снова {{1}}")).toEqual([1, 2]);
  expect(extractVariables("Без переменных")).toEqual([]);
});

test("корректный шаблон проходит проверку", () => {
  expect(validateTemplate(valid)).toEqual([]);
});

test("название только латиницей в нижнем регистре", () => {
  expect(validateTemplate({ ...valid, name: "Запись Подтверждение" })).toEqual([
    expect.stringContaining("латинские строчные"),
  ]);
  expect(validateTemplate({ ...valid, name: "zapis-podtverzhdenie" })).toEqual([
    expect.stringContaining("латинские строчные"),
  ]);
  expect(validateTemplate({ ...valid, name: "zapis_2026" })).toEqual([]);
});

test("пустой текст не принимается", () => {
  const errors = validateTemplate({ ...valid, bodyText: "   ", examples: [] });
  expect(errors).toContain("Текст сообщения не может быть пустым.");
});

test("слишком длинный текст отклоняется", () => {
  const errors = validateTemplate({ ...valid, bodyText: "а".repeat(1025), examples: [] });
  expect(errors.some((e) => e.includes("1024"))).toBe(true);
});

test("переменные должны идти подряд с единицы", () => {
  const errors = validateTemplate({
    ...valid,
    bodyText: "Здравствуйте, {{1}}! Заказ {{3}} готов.",
    examples: ["Айгерим", "12"],
  });
  expect(errors.some((e) => e.includes("подряд начиная с {{1}}"))).toBe(true);
});

test("сообщение не может начинаться или заканчиваться переменной", () => {
  expect(
    validateTemplate({ ...valid, bodyText: "{{1}}, добрый день!", examples: ["Айгерим"] }),
  ).toContain("Сообщение не может начинаться с переменной — добавьте текст перед ней.");

  expect(
    validateTemplate({ ...valid, bodyText: "Ваш код: {{1}}", examples: ["1234"] }),
  ).toContain("Сообщение не может заканчиваться переменной — добавьте текст после неё.");
});

test("две переменные подряд не принимаются", () => {
  const errors = validateTemplate({
    ...valid,
    bodyText: "Клиент {{1}} {{2}} записан на приём.",
    examples: ["Айгерим", "Сатыбалдиева"],
  });
  expect(errors).toContain("Две переменные подряд Meta не принимает — разделите их текстом.");
});

test("переменные в заголовке и подписи запрещены", () => {
  expect(validateTemplate({ ...valid, headerText: "Заказ {{1}}" })).toContain(
    "В заголовке переменные не поддерживаются — оставьте его постоянным.",
  );
  expect(validateTemplate({ ...valid, footerText: "Ответ на {{1}}" })).toContain(
    "В подписи переменные не поддерживаются.",
  );
});

test("без примеров значений шаблон не уходит на модерацию", () => {
  const errors = validateTemplate({ ...valid, examples: ["Айгерим", "  "] });
  expect(errors.some((e) => e.includes("примеры"))).toBe(true);
});

test("длина заголовка и подписи ограничена", () => {
  expect(validateTemplate({ ...valid, headerText: "а".repeat(61) }).length).toBe(1);
  expect(validateTemplate({ ...valid, footerText: "а".repeat(61) }).length).toBe(1);
});

test("предпросмотр подставляет примеры, а незаполненное оставляет как есть", () => {
  expect(renderTemplate(valid.bodyText, ["Айгерим", "17 августа в 16:30"])).toBe(
    "Здравствуйте, Айгерим! Вы записаны на 17 августа в 16:30. Ждём вас.",
  );
  expect(renderTemplate(valid.bodyText, ["Айгерим"])).toBe(
    "Здравствуйте, Айгерим! Вы записаны на {{2}}. Ждём вас.",
  );
});

test("payload для Meta собирается по её формату", () => {
  expect(toMetaPayload(valid)).toEqual({
    name: "zapis_podtverzhdenie",
    language: "ru",
    category: "UTILITY",
    components: [
      { type: "HEADER", format: "TEXT", text: "Стоматология «Улыбка»" },
      {
        type: "BODY",
        text: "Здравствуйте, {{1}}! Вы записаны на {{2}}. Ждём вас.",
        example: { body_text: [["Айгерим", "17 августа в 16:30"]] },
      },
      { type: "FOOTER", text: "Отменить запись можно по телефону" },
    ],
  });
});

test("шаблон без переменных уходит без блока примеров", () => {
  const payload = toMetaPayload({
    ...valid,
    bodyText: "Мы получили вашу заявку и скоро свяжемся.",
    headerText: null,
    footerText: null,
    examples: [],
  });

  expect(payload.components).toEqual([
    { type: "BODY", text: "Мы получили вашу заявку и скоро свяжемся." },
  ]);
});
