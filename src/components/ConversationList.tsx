import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { LockIcon, SearchIcon } from "@/components/icons";
import type { ConversationListItem, Scope } from "@/lib/conversations";
import { dayLabel, dayKey, initials, timeLabel } from "@/lib/format";
import { mediaLabel } from "@/lib/media";

/** Строка последнего сообщения: у вложения вместо текста — что это за файл. */
function previewText(message: ConversationListItem["messages"][number]): string {
  if (message.text) {
    return message.text;
  }
  if (message.mediaId || message.mediaPath) {
    return mediaLabel(message);
  }
  return `Сообщение: ${message.type}`;
}

/** Свежие диалоги показываем временем, старые — датой: так короче и точнее. */
function stampLabel(date: Date): string {
  const now = new Date();
  return dayKey(date) === dayKey(now) ? timeLabel(date) : dayLabel(date, now);
}

function personLabel(person: { name: string | null; email: string }): string {
  return person.name?.trim() || person.email;
}

const TABS: { scope: Scope; label: string }[] = [
  { scope: "all", label: "Все" },
  { scope: "mine", label: "Мои" },
  { scope: "free", label: "Свободные" },
];

function tabHref(scope: Scope, query: string): string {
  const params = new URLSearchParams();
  if (query) {
    params.set("q", query);
  }
  if (scope !== "all") {
    params.set("scope", scope);
  }
  const search = params.toString();
  return search ? `/?${search}` : "/";
}

function Avatar({
  name,
  externalUserId,
  active,
}: {
  name: string | null;
  externalUserId: string;
  active: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${
        active ? "bg-accent text-accent-ink" : "bg-panel-muted text-ink-muted"
      }`}
    >
      {initials(name, externalUserId)}
    </span>
  );
}

/** Кто ведёт диалог: свои отмечены цветом, чужие — приглушены. */
function AssigneeMark({
  assignee,
  meId,
}: {
  assignee: NonNullable<ConversationListItem["assignee"]>;
  meId: string;
}) {
  const label = personLabel(assignee);
  const mine = assignee.id === meId;

  return (
    <span
      title={mine ? `Ваш диалог — ${label}` : `Ведёт ${label}`}
      className={`grid size-5 shrink-0 place-items-center rounded-full text-[0.625rem] font-semibold ${
        mine ? "bg-accent text-accent-ink" : "bg-panel-muted text-ink-muted"
      }`}
    >
      {initials(label, label)}
      <span className="sr-only">{mine ? "ваш диалог" : `ведёт ${label}`}</span>
    </span>
  );
}

function ConversationRow({
  conversation,
  active,
  query,
  scope,
  meId,
}: {
  conversation: ConversationListItem;
  active: boolean;
  query: string;
  scope: Scope;
  meId: string;
}) {
  const last = conversation.messages[0];
  const windowClosed = isWindowClosed(conversation.windowExpiresAt);

  const params = new URLSearchParams();
  if (query) {
    params.set("q", query);
  }
  if (scope !== "all") {
    params.set("scope", scope);
  }
  const search = params.toString();
  const href = search ? `/chat/${conversation.id}?${search}` : `/chat/${conversation.id}`;

  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex gap-3 px-4 py-3 transition-colors ${
          active ? "bg-accent-soft" : "hover:bg-panel-muted"
        }`}
      >
        <Avatar
          name={conversation.contact.name}
          externalUserId={conversation.contact.externalUserId}
          active={active}
        />

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate font-semibold text-ink">
              {conversation.contact.name ?? conversation.contact.externalUserId}
            </span>
            <span className="shrink-0 text-xs text-ink-faint">
              {stampLabel(conversation.lastMessageAt)}
            </span>
          </span>

          <span className="mt-0.5 flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">
              {last?.direction === "OUTBOUND" && <span className="text-ink-faint">Вы: </span>}
              {last ? previewText(last) : "Переписка пуста"}
            </span>

            {/* Помощник вернул диалог человеку, а человека ещё нет — такие важно не пропустить */}
            {!conversation.assignee && conversation.handedOffAt && (
              <span
                title="ИИ-помощник передал диалог оператору"
                className="shrink-0 rounded-full bg-warn-soft px-1.5 py-0.5 text-[0.625rem] font-medium text-warn"
              >
                нужен человек
              </span>
            )}

            {conversation.assignee && (
              <AssigneeMark assignee={conversation.assignee} meId={meId} />
            )}

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

const EMPTY_HINT: Record<Scope, string> = {
  all: "Диалогов пока нет. Первое сообщение клиента создаст карточку контакта автоматически.",
  mine: "На вас пока ничего не назначено. Возьмите диалог из вкладки «Свободные».",
  free: "Свободных диалогов нет — вся переписка уже за кем-то закреплена.",
};

/** Вынесено из компонента: чтение часов в рендере отмечает линтер как нечистое. */
function isWindowClosed(expiresAt: Date | null): boolean {
  return expiresAt === null || expiresAt.getTime() <= Date.now();
}

export function ConversationList({
  conversations,
  activeId,
  query,
  scope,
  meId,
  counts,
}: {
  conversations: ConversationListItem[];
  activeId?: string;
  query: string;
  scope: Scope;
  meId: string;
  counts: { mine: number; free: number };
}) {
  return (
    <>
      <div className="border-b border-line px-4 pt-5 pb-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h1 className="text-lg font-bold tracking-tight text-ink">Диалоги</h1>
          <span className="text-xs text-ink-faint">
            {query ? `найдено: ${conversations.length}` : `всего: ${conversations.length}`}
          </span>
        </div>

        <SearchBox initialQuery={query} />

        <nav aria-label="Кого показывать" className="mt-3 flex gap-1">
          {TABS.map((tab) => {
            const count = tab.scope === "mine" ? counts.mine : tab.scope === "free" ? counts.free : null;

            return (
              <Link
                key={tab.scope}
                href={tabHref(tab.scope, query)}
                aria-current={tab.scope === scope ? "page" : undefined}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  tab.scope === scope
                    ? "bg-accent-soft text-accent"
                    : "text-ink-muted hover:bg-panel-muted hover:text-ink"
                }`}
              >
                {tab.label}
                {count !== null && count > 0 && (
                  <span className="ml-1 tabular-nums opacity-70">{count}</span>
                )}
              </Link>
            );
          })}
        </nav>
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
              EMPTY_HINT[scope]
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
              scope={scope}
              meId={meId}
            />
          ))}
        </ul>
      )}
    </>
  );
}
