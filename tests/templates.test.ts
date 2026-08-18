import { expect, test } from "vitest";
import {
  extractVariables,
  insertVariable,
  renderTemplate,
  suggestTemplateName,
  syncVariables,
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
  expect(errors).toContain("Напишите текст сообщения.");
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
  expect(errors.some((e) => e.includes("Нумерация подстановок"))).toBe(true);
});

test("сообщение не может начинаться или заканчиваться переменной", () => {
  expect(
    validateTemplate({ ...valid, bodyText: "{{1}}, добрый день!", examples: ["Айгерим"] }),
  ).toEqual([expect.stringContaining("начинается с подставленного значения")]);

  expect(
    validateTemplate({ ...valid, bodyText: "Ваш код: {{1}}", examples: ["1234"] }),
  ).toEqual([expect.stringContaining("заканчивается подставленным значением")]);
});

test("две переменные подряд не принимаются", () => {
  const errors = validateTemplate({
    ...valid,
    bodyText: "Клиент {{1}} {{2}} записан на приём.",
    examples: ["Айгерим", "Сатыбалдиева"],
  });
  expect(errors).toEqual([expect.stringContaining("Два подставленных значения подряд")]);
});

test("переменные в заголовке и подписи запрещены", () => {
  expect(validateTemplate({ ...valid, headerText: "Заказ {{1}}" })).toEqual([
    expect.stringContaining("В шапке подстановки не работают"),
  ]);
  expect(validateTemplate({ ...valid, footerText: "Ответ на {{1}}" })).toEqual([
    expect.stringContaining("В подписи подстановки не работают"),
  ]);
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

test("служебное имя собирается из текста шаблона", () => {
  expect(suggestTemplateName("Здравствуйте! Вы записаны на приём")).toBe(
    "zdravstvuyte_vy_zapisany_na_priem",
  );
  // Переменные в имя не попадают: клиент их не писал, а Meta примет только буквы.
  expect(suggestTemplateName("Здравствуйте, {{1}}! Заказ {{2}} готов")).toBe(
    "zdravstvuyte_zakaz_gotov",
  );
  expect(suggestTemplateName("Сәлеметсіз бе! Тапсырыс дайын")).toBe("salemetsiz_be_tapsyrys_dayyn");
  expect(suggestTemplateName("Sale 30% off!")).toBe("sale_30_off");
});

test("служебное имя не бывает пустым и не тянет хвост", () => {
  expect(suggestTemplateName("")).toBe("shablon");
  expect(suggestTemplateName("!!! ???")).toBe("shablon");
  const long = suggestTemplateName("а".repeat(300));
  expect(long.length).toBeLessThanOrEqual(64);
  expect(long.endsWith("_")).toBe(false);
});

test("вставка переменной нумерует её по месту в тексте", () => {
  // Курсор в начале: новая подстановка становится первой, старая уезжает на вторую.
  // Пробел перед ней дописывается сам — иначе выйдет «Ждём вас.Айгерим».
  const result = insertVariable(
    { text: "Здравствуйте! Вы записаны на {{1}}.", slots: [{ label: "Дата и время", example: "четверг, 16:30" }] },
    { label: "Имя клиента", example: "Айгерим" },
    13,
  );

  expect(result.text).toBe("Здравствуйте! {{1}} Вы записаны на {{2}}.");
  expect(result.slots).toEqual([
    { label: "Имя клиента", example: "Айгерим" },
    { label: "Дата и время", example: "четверг, 16:30" },
  ]);
  expect(result.caret).toBe(13 + " {{1}}".length);
});

test("правка текста руками пересобирает нумерацию и подписи", () => {
  const before = {
    text: "Здравствуйте, {{1}}! Заказ {{2}} готов, сумма {{3}}.",
    slots: [
      { label: "Имя клиента", example: "Айгерим" },
      { label: "Номер заказа", example: "1024" },
      { label: "Сумма", example: "12 000 ₸" },
    ],
  };

  // Клиент удалил середину — оставшиеся переменные обязаны стать {{1}} и {{2}},
  // иначе Meta отклонит шаблон за пропуск номера.
  const after = syncVariables(before, "Здравствуйте, {{1}}! Сумма {{3}}.");

  expect(after.text).toBe("Здравствуйте, {{1}}! Сумма {{2}}.");
  expect(after.slots).toEqual([
    { label: "Имя клиента", example: "Айгерим" },
    { label: "Сумма", example: "12 000 ₸" },
  ]);
});

test("перестановка переменных местами тянет подписи за собой", () => {
  const after = syncVariables(
    {
      text: "{{1}} и {{2}}",
      slots: [
        { label: "Имя клиента", example: "Айгерим" },
        { label: "Сумма", example: "12 000 ₸" },
      ],
    },
    "Сначала {{2}}, потом {{1}}.",
  );

  expect(after.text).toBe("Сначала {{1}}, потом {{2}}.");
  expect(after.slots).toEqual([
    { label: "Сумма", example: "12 000 ₸" },
    { label: "Имя клиента", example: "Айгерим" },
  ]);
});
