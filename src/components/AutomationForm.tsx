"use client";

import { useActionState, useState } from "react";
import { AlertIcon } from "@/components/icons";
import { saveAutomationAction, type FormState } from "@/app/(app)/automation/actions";
import { TIMEZONES, WEEKDAYS, describeSchedule, type DaySchedule } from "@/lib/automation";
import type { AutomationSettings } from "@/lib/automation-store";

const INPUT =
  "rounded-lg border border-line bg-panel-muted px-3 py-2 text-sm text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:border-accent focus:bg-panel";

function Toggle({
  name,
  checked,
  onChange,
  label,
}: {
  name: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--accent)]"
      />
      <span className="text-sm font-semibold text-ink">{label}</span>
    </label>
  );
}

export function AutomationForm({ initial }: { initial: AutomationSettings }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveAutomationAction,
    null,
  );

  const [greetingEnabled, setGreetingEnabled] = useState(initial.greetingEnabled);
  const [greetingText, setGreetingText] = useState(initial.greetingText);
  const [awayEnabled, setAwayEnabled] = useState(initial.awayEnabled);
  const [awayText, setAwayText] = useState(initial.awayText);
  const [schedule, setSchedule] = useState<DaySchedule[]>(initial.schedule);

  function setDay(index: number, patch: Partial<DaySchedule>) {
    setSchedule((prev) => prev.map((day, i) => (i === index ? { ...day, ...patch } : day)));
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <section className="rounded-xl border border-line bg-panel p-4">
        <Toggle
          name="greetingEnabled"
          checked={greetingEnabled}
          onChange={setGreetingEnabled}
          label="Приветствие первому обращению"
        />
        <p className="mt-1.5 mb-3 text-sm text-ink-muted">
          Уходит один раз — когда человек пишет вам впервые. При следующих обращениях молчит,
          чтобы не выглядеть роботом.
        </p>
        <textarea
          name="greetingText"
          value={greetingText}
          onChange={(e) => setGreetingText(e.target.value)}
          rows={3}
          disabled={!greetingEnabled}
          className={`${INPUT} w-full resize-y disabled:opacity-50`}
        />
      </section>

      <section className="rounded-xl border border-line bg-panel p-4">
        <Toggle
          name="awayEnabled"
          checked={awayEnabled}
          onChange={setAwayEnabled}
          label="Автоответ вне рабочих часов"
        />
        <p className="mt-1.5 mb-3 text-sm text-ink-muted">
          Уходит, когда клиент пишет в нерабочее время, и не повторяется чаще раза в 8 часов —
          иначе за вечер человек получит его несколько раз.
        </p>
        <textarea
          name="awayText"
          value={awayText}
          onChange={(e) => setAwayText(e.target.value)}
          rows={3}
          disabled={!awayEnabled}
          className={`${INPUT} w-full resize-y disabled:opacity-50`}
        />

        <div className={`mt-5 ${awayEnabled ? "" : "opacity-50"}`}>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">Часовой пояс</span>
            <select
              name="timezone"
              defaultValue={initial.timezone}
              disabled={!awayEnabled}
              className={`${INPUT} w-full sm:w-72`}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-ink-faint">
              Рабочие часы считаются по нему, а не по времени сервера.
            </span>
          </label>

          <p className="mt-5 mb-2 text-sm font-medium text-ink">Рабочие часы</p>
          <ul className="flex flex-col gap-2">
            {WEEKDAYS.map((label, index) => (
              <li key={label} className="flex flex-wrap items-center gap-3">
                <label className="flex w-40 cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    name={`day${index}`}
                    checked={schedule[index].enabled}
                    onChange={(e) => setDay(index, { enabled: e.target.checked })}
                    disabled={!awayEnabled}
                    className="size-4 accent-[var(--accent)]"
                  />
                  <span className="text-sm text-ink">{label}</span>
                </label>

                <input
                  type="time"
                  name={`from${index}`}
                  value={schedule[index].from}
                  onChange={(e) => setDay(index, { from: e.target.value })}
                  disabled={!awayEnabled || !schedule[index].enabled}
                  className={`${INPUT} w-28 tabular-nums disabled:opacity-40`}
                />
                <span className="text-sm text-ink-faint">до</span>
                <input
                  type="time"
                  name={`to${index}`}
                  value={schedule[index].to}
                  onChange={(e) => setDay(index, { to: e.target.value })}
                  disabled={!awayEnabled || !schedule[index].enabled}
                  className={`${INPUT} w-28 tabular-nums disabled:opacity-40`}
                />
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs text-ink-faint">{describeSchedule(schedule)}</p>
          <p className="mt-1 text-xs text-ink-faint">
            Смену через полночь задавайте как есть — например с 20:00 до 02:00.
          </p>
        </div>
      </section>

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
  );
}
