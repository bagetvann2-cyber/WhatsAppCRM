import Link from "next/link";
import { signOutAction } from "@/app/(auth)/actions";
import { SearchBox } from "@/components/SearchBox";
import { LockIcon, SearchIcon } from "@/components/icons";
import type { ConversationListItem } from "@/lib/conversations";
import { dayLabel, dayKey, initials, timeLabel } from "@/lib/format";

/** Свежие диалоги показываем временем, старые — датой: так короче и точнее. */
function stampLabel(date: Date): string {
  const now = new Date();
  return dayKey(date) === dayKey(now) ? timeLabel(date) : dayLabel(date, now);
}

function Avatar({ name, waId, active }: { name: string | null; waId: string; active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${
        active ? "bg-accent text-accent-ink" : "bg-panel-muted text-ink-muted"
      }`}
    >
      {initials(name, waId)}
    </span>
  );
}

function ConversationRow({
  conversation,
  active,
  query,
}: {
  conversation: ConversationListItem;
  active: boolean;
  query: string;
}) {
  const last = conversation.messages[0];
  const windowClosed =
    conversation.windowExpiresAt === null || conversation.windowExpiresAt.getTime() <= Date.now();
  const href = query
    ? `/chat/${conversation.id}?q=${encodeURIComponent(query)}`
    : `/chat/${conversation.id}`;

  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex gap-3 px-4 py-3 transition-colors ${
          active ? "bg-accent-soft" : "hover:bg-panel-muted"
        }`}
      >
        <Avatar name={conversation.contact.name} waId={conversation.contact.waId} active={active} />

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate font-semibold text-ink">
              {conversation.contact.name ?? conversation.contact.waId}
            </span>
            <span className="shrink-0 text-xs text-ink-faint">
              {stampLabel(conversation.lastMessageAt)}
            </span>
          </span>

          <span className="mt-0.5 flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">
              {last?.direction === "OUTBOUND" && <span className="text-ink-faint">Вы: </span>}
              {last?.text ?? (last ? `Вложение: ${last.type}` : "Переписка пуста")}
            </span>
            {windowClosed && (
              <LockIcon
                className="size-3.5 shrink-0 text-ink-faint"
                role="img"
                aria-label="Окно 24 часа закрыто"
              />
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}

const ROLE_LABEL: Record<string, string> = {
  OWNER: "владелец",
  ADMIN: "администратор",
  OPERATOR: "оператор",
};

export function ConversationList({
  conversations,
  activeId,
  query,
  organizationName,
  userLabel,
  role,
}: {
  conversations: ConversationListItem[];
  activeId?: string;
  query: string;
  organizationName: string;
  userLabel: string;
  role: string;
}) {
  return (
    <>
      <div className="border-b border-line px-4 pt-4 pb-4">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{organizationName}</p>
            <p className="truncate text-xs text-ink-faint">
              {userLabel} · {ROLE_LABEL[role] ?? role.toLowerCase()}
            </p>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="shrink-0 rounded-lg px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-panel-muted hover:text-ink"
            >
              Выйти
            </button>
          </form>
        </div>

        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h1 className="text-lg font-bold tracking-tight text-ink">Диалоги</h1>
          <span className="text-xs text-ink-faint">
            {query ? `найдено: ${conversations.length}` : `всего: ${conversations.length}`}
          </span>
        </div>
        <SearchBox initialQuery={query} />
      </div>

      {conversations.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <SearchIcon className="size-7 text-ink-faint" />
          <p className="text-sm text-ink-muted">
            {query ? (
              <>
                По запросу{" "}
                <span className="font-semibold text-ink">«{query}»</span> ничего не нашлось.
                Попробуйте часть номера или слово из переписки.
              </>
            ) : (
              "Диалогов пока нет. Первое сообщение клиента создаст карточку контакта автоматически."
            )}
          </p>
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-line overflow-y-auto">
          {conversations.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === activeId}
              query={query}
            />
          ))}
        </ul>
      )}
    </>
  );
}
