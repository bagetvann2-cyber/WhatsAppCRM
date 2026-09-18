"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertIcon, BoltIcon } from "@/components/icons";
import { generateProfileAction, saveBotAction, testBotAction, type FormState, type TestState } from "@/app/(app)/ai-bot/actions";
import { DEFAULT_STUB, DEFAULT_STUB_KZ, MAX_STUB_CHARS, answersLeft } from "@/lib/ai-bot";
import { MODELS } from "@/lib/llm/catalog";
import type { ProviderId } from "@/lib/llm/types";
import { MAX_DESCRIPTION_CHARS, MIN_DESCRIPTION_CHARS, type GeneratedProfile } from "@/lib/profile-generator";
import { PLACEHOLDER_PATTERN, PROFILE_PRESETS, findPreset } from "@/lib/profile-presets";


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
  provider,
  usesOwnKey,
}: {
  provider: ProviderId;
  usesOwnKey: boolean;
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
    /** У организации уже настроены поля заказа: галочку «создать поля» не предлагаем. */
    hasOrderFields: boolean;
    generatorLeft: number;
    generatorLimit: number;
    /** Подписка действует: без неё генератор недоступен. */
    canGenerate: boolean;
  };
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveBotAction, null);
  const [test, testAction, testing] = useActionState<TestState, FormData>(testBotAction, null);

  const [enabled, setEnabled] = useState(initial.enabled);
  const [model, setModel] = useState(initial.model);
  const [profile, setProfile] = useState(initial.companyProfile);
  const [rules, setRules] = useState(initial.rules ?? "");
  const [presetId, setPresetId] = useState("");
  const [applyFields, setApplyFields] = useState(!initial.hasOrderFields);
  // Что было в полях до замены готовой анкетой: одно нажатие возвращает.
  const [undo, setUndo] = useState<{ profile: string; rules: string; title: string } | null>(null);
  const [description, setDescription] = useState("");
  const [generated, setGenerated] = useState<GeneratedProfile["orderFields"]>([]);
  const [genError, setGenError] = useState<string | null>(null);
  const [generatorLeft, setGeneratorLeft] = useState(initial.generatorLeft);
  const [generating, startGenerate] = useTransition();
  const profileRef = useRef<HTMLTextAreaElement>(null);
  const rulesRef = useRef<HTMLTextAreaElement>(null);
  const nextPlaceholder = useRef(0);

  function pickPreset(id: string) {
    const preset = findPreset(id);
    if (!preset) {
      return;
    }
    setUndo({ profile, rules, title: preset.title });
    setProfile(preset.companyProfile);
    setRules(preset.rules);
    setPresetId(preset.id);
    setGenerated([]);
    nextPlaceholder.current = 0;
  }

  function generate() {
    setGenError(null);
    startGenerate(async () => {
      const result = await generateProfileAction(description);
      if ("error" in result) {
        setGenError(result.error);
        return;
      }
      setUndo({ profile, rules, title: "Собрано ИИ" });
      setProfile(result.companyProfile);
      setRules(result.rules);
      setGenerated(result.orderFields);
      setPresetId("");
      setGeneratorLeft(result.left);
      nextPlaceholder.current = 0;
    });
  }

  function restore() {
    if (!undo) {
      return;
    }
    setProfile(undo.profile);
    setRules(undo.rules);
    setPresetId("");
    setGenerated([]);
    setUndo(null);
  }

  // Места «[уточните: …]» в анкете и в правилах, по порядку.
  const placeholders = [
    ...[...profile.matchAll(PLACEHOLDER_PATTERN)].map((m) => ({ field: "profile" as const, start: m.index, end: m.index + m[0].length })),
    ...[...rules.matchAll(PLACEHOLDER_PATTERN)].map((m) => ({ field: "rules" as const, start: m.index, end: m.index + m[0].length })),
  ];

  function selectNextPlaceholder() {
    const target = placeholders[nextPlaceholder.current % placeholders.length];
    nextPlaceholder.current += 1;
    const textarea = (target.field === "profile" ? profileRef : rulesRef).current;
    textarea?.focus();
    textarea?.setSelectionRange(target.start, target.end);
  }

  // На нашем ключе доступны только «платформенные» модели выбранной нейросети.
  const platformModels = MODELS[provider].filter((m) => m.platform);
  const modelHint = platformModels.find((m) => m.id === model)?.hint;
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

        <details open={!profile.trim()} className="rounded-lg border border-line px-3 py-2.5">
          <summary className="min-h-11 cursor-pointer text-sm font-medium text-ink md:min-h-0">Собрать анкету с ИИ</summary>
          <div className="mt-2 flex flex-col gap-2">
            <label htmlFor="description" className="text-sm text-ink-muted">
              Опишите бизнес своими словами: что продаёте, цены, адрес, часы, доставка, оплата.
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={MAX_DESCRIPTION_CHARS}
              rows={5}
              disabled={!initial.canGenerate}
              className={`${INPUT} resize-y`}
            />
            {initial.canGenerate ? (
              <p className="text-xs text-ink-faint">
                Сборок сегодня осталось: {generatorLeft} из {initial.generatorLimit}. Результат попадёт в поля ниже, сохранять его нужно самим.
              </p>
            ) : (
              <p className="text-sm text-warn">
                Подписка не оплачена, поэтому генератор недоступен. <Link href="/billing" className="underline">Открыть тарифы</Link>
              </p>
            )}
            {genError && (
              <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                <AlertIcon className="mt-0.5 size-4 shrink-0" />
                {genError}
              </p>
            )}
            <button
              type="button"
              onClick={generate}
              disabled={generating || !initial.canGenerate || description.trim().length < MIN_DESCRIPTION_CHARS}
              className="min-h-11 self-start rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-panel-muted disabled:opacity-50 md:min-h-0"
            >
              {generating ? "Собираем анкету… обычно до 20 секунд" : "Собрать анкету"}
            </button>
            {description.trim().length < MIN_DESCRIPTION_CHARS && (
              <p className="text-xs text-ink-faint">Нужно хотя бы {MIN_DESCRIPTION_CHARS} символов.</p>
            )}
          </div>
        </details>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="preset" className="text-sm font-medium text-ink">
            Начните с готовой анкеты <span className="font-normal text-ink-faint">— необязательно</span>
          </label>
          <select
            id="preset"
            value=""
            onChange={(e) => pickPreset(e.target.value)}
            className={INPUT}
          >
            <option value="">Выберите вашу нишу…</option>
            {PROFILE_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.title}
              </option>
            ))}
          </select>
          {undo && (
            <p className="flex flex-wrap items-center gap-x-3 text-sm text-ink-muted">
              Анкета заменена на «{undo.title}».
              <button type="button" onClick={restore} className="min-h-11 font-medium text-accent underline md:min-h-0">
                Вернуть как было
              </button>
            </p>
          )}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Анкета компании</span>
          <textarea
            ref={profileRef}
            name="companyProfile"
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            rows={12}
            placeholder={PROFILE_PLACEHOLDER}
            className={`${INPUT} resize-y font-[inherit]`}
          />
          <span className="text-xs text-ink-faint">
            Чем подробнее, тем меньше поводов дёргать человека. Всё, чего здесь нет, помощник
            придумывать не станет — он передаст диалог оператору.
          </span>
        </label>

        {placeholders.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            Осталось заполнить мест «[уточните: …]»: {placeholders.length}. Пока они есть, помощник не включится.
            <button type="button" onClick={selectNextPlaceholder} className="min-h-11 font-medium underline md:min-h-0">
              Следующее →
            </button>
          </p>
        )}

        {(presetId || generated.length > 0) && (
          <label className={`flex items-start gap-2.5 text-sm ${initial.hasOrderFields ? "text-ink-faint" : "cursor-pointer text-ink"}`}>
            <input
              type="checkbox"
              name="applyOrderFields"
              checked={applyFields && !initial.hasOrderFields}
              disabled={initial.hasOrderFields}
              onChange={(e) => setApplyFields(e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--accent)]"
            />
            <span>
              {initial.hasOrderFields ? (
                <>Поля заказа уже настроены, готовая анкета их не тронет. <Link href="/orders" className="underline">Открыть поля заказа</Link></>
              ) : (
                "Создать поля заказа под вашу нишу (имя, адрес и другое)"
              )}
            </span>
          </label>
        )}
        <input type="hidden" name="presetId" value={presetId} />
        <input type="hidden" name="generatedFields" value={JSON.stringify(generated)} />

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">
            Чего не обещать <span className="font-normal text-ink-faint">— необязательно</span>
          </span>
          <textarea
            ref={rulesRef}
            name="rules"
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            rows={3}
            placeholder="Скидок не обещать. Точное время записи подтверждает администратор."
            className={`${INPUT} resize-y`}
          />
        </label>

        {/* На своём ключе модель задаётся в блоке «Нейросеть», эта форма её не меняет. */}
        {!usesOwnKey && platformModels.length > 1 && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Модель</span>
            <select
              name="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className={INPUT}
            >
              {platformModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-ink-faint">{modelHint}</span>
          </label>
        )}
        {!usesOwnKey && platformModels.length === 1 && <input type="hidden" name="model" value={platformModels[0].id} />}

        <div className="rounded-lg bg-accent-soft px-3 py-2.5 text-sm text-accent">
          {usesOwnKey ? (
            <span>Помощник отвечает на вашем ключе: пакет ответов по тарифу не тратится.</span>
          ) : initial.answersLimit === 0 ? (
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
