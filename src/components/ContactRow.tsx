"use client";

import Link from "next/link";
import { useState } from "react";
import {
  saveContactAction,
  toggleTagAction,
  toggleUnsubscribeAction,
} from "@/app/(app)/contacts/actions";
import { formatPhone, initials } from "@/lib/format";

type Tag = { id: string; name: string };

export function ContactRow({
  contact,
  allTags,
  conversationId,
}: {
  contact: {
    id: string;
    externalUserId: string;
    name: string | null;
    note: string | null;
    tagIds: string[];
    unsubscribed: boolean;
    unsubscribeSource: string | null;
  };
  allTags: Tag[];
  conversationId?: string;
}) {
  const [editing, setEditing] = useState(false);
  const assigned = allTags.filter((tag) => contact.tagIds.includes(tag.id));

  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start">
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-full bg-panel-muted text-sm font-semibold text-ink-muted"
      >
        {initials(contact.name, contact.externalUserId)}
      </span>

      <div className="min-w-0 flex-1">
        {editing ? (
          <form
            action={saveContactAction}
            onSubmit={() => setEditing(false)}
            className="flex flex-col gap-2"
          >
            <input type="hidden" name="contactId" value={contact.id} />
            <input
              name="name"
              defaultValue={contact.name ?? ""}
              placeholder="Имя"
              className="rounded-lg border border-line bg-panel-muted px-3 py-1.5 text-sm text-ink focus:border-accent focus:bg-panel"
            />
            <input
              name="note"
              defaultValue={contact.note ?? ""}
              placeholder="Заметка для команды"
              className="rounded-lg border border-line bg-panel-muted px-3 py-1.5 text-sm text-ink focus:border-accent focus:bg-panel"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink hover:bg-accent-hover"
              >
                Сохранить
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-xs text-ink-muted hover:text-ink"
              >
                Отмена
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="truncate text-sm font-medium text-ink">
              {contact.name ?? formatPhone(contact.externalUserId)}
            </p>
            <p className="truncate text-xs tabular-nums text-ink-faint">
              {formatPhone(contact.externalUserId)}
            </p>
            {contact.note && <p className="mt-1 text-xs text-ink-muted">{contact.note}</p>}

            {contact.unsubscribed && (
              <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2 py-0.5 text-xs text-warn">
                Отписан от рассылок
                {contact.unsubscribeSource && (
                  <span className="opacity-80">· {contact.unsubscribeSource}</span>
                )}
              </p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {allTags.map((tag) => {
                const active = contact.tagIds.includes(tag.id);
                return (
                  <form key={tag.id} action={toggleTagAction}>
                    <input type="hidden" name="contactId" value={contact.id} />
                    <input type="hidden" name="tagId" value={tag.id} />
                    <button
                      type="submit"
                      aria-pressed={active}
                      className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                        active
                          ? "bg-accent-soft text-accent"
                          : "bg-panel-muted text-ink-faint hover:text-ink"
                      }`}
                    >
                      {tag.name}
                    </button>
                  </form>
                );
              })}
              {allTags.length === 0 && (
                <span className="text-xs text-ink-faint">Меток пока нет</span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {assigned.length > 0 && !editing && (
          <span className="text-xs text-ink-faint sm:hidden">{assigned.length} меток</span>
        )}
        {conversationId && (
          <Link
            href={`/chat/${conversationId}`}
            className="text-xs text-ink-muted transition-colors hover:text-ink"
          >
            Открыть чат
          </Link>
        )}
        {!editing && (
          <>
            {/* Вернуть в рассылки может только оператор и только по просьбе клиента */}
            <form action={toggleUnsubscribeAction}>
              <input type="hidden" name="contactId" value={contact.id} />
              <input type="hidden" name="unsubscribed" value={contact.unsubscribed ? "" : "on"} />
              <button
                type="submit"
                className="text-xs text-ink-muted transition-colors hover:text-ink"
              >
                {contact.unsubscribed ? "Вернуть в рассылки" : "Отписать"}
              </button>
            </form>

            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-ink-muted transition-colors hover:text-ink"
            >
              Изменить
            </button>
          </>
        )}
      </div>
    </li>
  );
}
