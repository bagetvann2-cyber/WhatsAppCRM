import Link from "next/link";
import { notFound } from "next/navigation";
import { queueCounts } from "@/lib/assignment";
import { AssignControl } from "@/components/AssignControl";
import { Composer } from "@/components/Composer";
import { ConversationList } from "@/components/ConversationList";
import { LiveRefresh } from "@/components/LiveRefresh";
import { MessageBubble } from "@/components/MessageBubble";
import { Shell } from "@/components/Shell";
import { ThreadScroll } from "@/components/ThreadScroll";
import { WindowTimer } from "@/components/WindowTimer";
import { BackIcon } from "@/components/icons";
import {
  getConversation,
  listConversations,
  parseScope,
  type ThreadMessage,
} from "@/lib/conversations";
import { dayKey, dayLabel, formatPhone, initials } from "@/lib/format";
import { isReplyWindowOpen } from "@/lib/conversation-window";
import { requireUser } from "@/lib/session";
import { canManageTeam, listMembers } from "@/lib/team";

export const dynamic = "force-dynamic";

/** Возврат к списку сохраняет и поиск, и выбранную вкладку. */
function backHref(query: string, scope: string): string {
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

/** Разбивает ленту на дни, чтобы между сообщениями встали разделители с датой. */
function groupByDay(messages: ThreadMessage[]) {
  const days: { key: string; date: Date; messages: ThreadMessage[] }[] = [];

  for (const message of messages) {
    const key = dayKey(message.timestamp);
    const current = days.at(-1);

    if (current?.key === key) {
      current.messages.push(message);
    } else {
      days.push({ key, date: message.timestamp, messages: [message] });
    }
  }

  return days;
}

export default async function ChatPage({ params, searchParams }: PageProps<"/chat/[id]">) {
  const { user, organization, role } = await requireUser();
  const { id } = await params;
  const { q, scope } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const view = parseScope(scope);

  const [conversation, conversations, members, counts] = await Promise.all([
    getConversation(organization.id, id),
    listConversations(organization.id, query, { scope: view, userId: user.id }),
    listMembers(organization.id),
    queueCounts(organization.id, user.id),
  ]);

  if (!conversation) {
    notFound();
  }

  const team = members.map((member) => ({
    id: member.userId,
    label: member.user.name?.trim() || member.user.email,
  }));

  const windowOpen = isReplyWindowOpen(conversation.channel, conversation);
  const days = groupByDay(conversation.messages);
  const lastMessage = conversation.messages.at(-1);

  return (
    <>
      <LiveRefresh />
      <Shell
        mobile="thread"
        sidebar={
          <ConversationList
            conversations={conversations}
            activeId={conversation.id}
            query={query}
            scope={view}
            meId={user.id}
            counts={counts}
          />
        }
      >
        <header className="flex items-center gap-3 border-b border-line bg-panel px-4 py-3 md:px-6">
          <Link
            href={backHref(query, view)}
            aria-label="Вернуться к списку диалогов"
            className="-ml-1 grid size-9 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-panel-muted hover:text-ink md:hidden"
          >
            <BackIcon className="size-5" />
          </Link>

          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent"
          >
            {initials(conversation.contact.name, conversation.contact.externalUserId)}
          </span>

          <div className="min-w-0 flex-1">
            <h2 className="truncate font-bold text-ink">
              {conversation.contact.name ?? formatPhone(conversation.contact.externalUserId)}
            </h2>
            <p className="truncate text-xs text-ink-muted tabular-nums">
              {formatPhone(conversation.contact.externalUserId)}
            </p>
          </div>

          <AssignControl
            conversationId={conversation.id}
            assignee={
              conversation.assignee
                ? {
                    id: conversation.assignee.id,
                    label: conversation.assignee.name?.trim() || conversation.assignee.email,
                  }
                : null
            }
            members={team}
            canManage={canManageTeam(role)}
            meId={user.id}
          />

          <WindowTimer expiresAt={conversation.windowExpiresAt?.toISOString() ?? null} />
        </header>

        <ThreadScroll marker={`${conversation.id}:${lastMessage?.id ?? "empty"}`}>
          {/* justify-end прижимает короткую переписку к полю ввода, а не оставляет висеть под шапкой */}
          <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-end gap-2 px-4 py-6 md:px-6">
            {days.length === 0 && (
              <p className="py-12 text-center text-sm text-ink-muted">
                В этом диалоге ещё нет сообщений.
              </p>
            )}

            {days.map((day) => (
              <section key={day.key} className="flex flex-col gap-2">
                <h3 className="my-3 flex items-center gap-3 text-xs font-medium text-ink-faint">
                  <span className="h-px flex-1 bg-line" />
                  {dayLabel(day.date)}
                  <span className="h-px flex-1 bg-line" />
                </h3>

                {day.messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
              </section>
            ))}
          </div>
        </ThreadScroll>

        <Composer conversationId={conversation.id} windowOpen={windowOpen} />
      </Shell>
    </>
  );
}
