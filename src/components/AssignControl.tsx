"use client";

import { useActionState } from "react";
import { assignAction, type AssignState } from "@/app/(app)/chat/[id]/actions";
import { UsersIcon } from "@/components/icons";

export type Member = { id: string; label: string };

/**
 * Кто ведёт диалог. Руководитель выбирает любого из команды, оператор берёт
 * диалог на себя или отпускает свой — чужой отобрать не может.
 */
export function AssignControl({
  conversationId,
  assignee,
  members,
  canManage,
  meId,
}: {
  conversationId: string;
  assignee: Member | null;
  members: Member[];
  canManage: boolean;
  meId: string;
}) {
  const [state, action, pending] = useActionState<AssignState, FormData>(assignAction, null);

  const mine = assignee?.id === meId;

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={action} className="flex items-center gap-2">
        <input type="hidden" name="conversationId" value={conversationId} />

        {canManage ? (
          <label className="flex items-center gap-1.5">
            <UsersIcon className="size-4 shrink-0 text-ink-faint" />
            <span className="sr-only">Ответственный за диалог</span>
            <select
              name="assigneeId"
              // key по текущему ответственному: без него поле остаётся
              // неуправляемым и после сохранения показывает прежнее значение.
              key={assignee?.id ?? "free"}
              defaultValue={assignee?.id ?? ""}
              disabled={pending}
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
              className="max-w-40 rounded-lg border border-line bg-panel-muted px-2 py-1.5 text-xs text-ink transition-colors hover:border-line-strong focus:border-accent disabled:opacity-60"
            >
              <option value="">Свободен</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            {/* Оператор управляет только собой: значение фиксировано, не выбирается */}
            <input type="hidden" name="assigneeId" value={mine ? "" : meId} />
            {assignee && !mine ? (
              <span className="rounded-lg bg-panel-muted px-2 py-1.5 text-xs text-ink-muted">
                Ведёт {assignee.label}
              </span>
            ) : (
              <button
                type="submit"
                disabled={pending}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                  mine
                    ? "border border-line text-ink-muted hover:border-line-strong hover:text-ink"
                    : "bg-accent text-accent-ink hover:bg-accent-hover"
                }`}
              >
                {mine ? "Отпустить" : "Взять в работу"}
              </button>
            )}
          </>
        )}
      </form>

      {state?.error && (
        <p role="alert" className="max-w-56 text-right text-xs text-danger">
          {state.error}
        </p>
      )}
    </div>
  );
}
