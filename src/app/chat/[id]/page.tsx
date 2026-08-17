import Link from "next/link";
import { notFound } from "next/navigation";
import { Composer } from "@/components/Composer";
import { ConversationList } from "@/components/ConversationList";
import { LiveRefresh } from "@/components/LiveRefresh";
import { MessageBubble } from "@/components/MessageBubble";
import { Shell } from "@/components/Shell";
import { ThreadScroll } from "@/components/ThreadScroll";
import { WindowTimer } from "@/components/WindowTimer";
import { BackIcon } from "@/components/icons";
import { getConversation, listConversations, type ThreadMessage } from "@/lib/conversations";
import { dayKey, dayLabel, formatPhone, initials } from "@/lib/format";

export const dynamic = "force-dynamic";

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
  const { id } = await params;
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";

  const [conversation, conversations] = await Promise.all([
    getConversation(id),
    listConversations(query),
  ]);

  if (!conversation) {
    notFound();
  }

  const windowOpen =
    conversation.windowExpiresAt !== null && conversation.windowExpiresAt.getTime() > Date.now();
  const days = groupByDay(conversation.messages);
  const lastMessage = conversation.messages.at(-1);

  return (
    <>
      <LiveRefresh />
      <Shell
        mobile="thread"
        sidebar={
          <ConversationList conversations={conversations} activeId={conversation.id} query={query} />
        }
      >
        <header className="flex items-center gap-3 border-b border-line bg-panel px-4 py-3 md:px-6">
          <Link
            href={query ? `/?q=${encodeURIComponent(query)}` : "/"}
            aria-label="Вернуться к списку диалогов"
            className="-ml-1 grid size-9 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-panel-muted hover:text-ink md:hidden"
          >
            <BackIcon className="size-5" />
          </Link>

          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent"
          >
            {initials(conversation.contact.name, conversation.contact.waId)}
          </span>

          <div className="min-w-0 flex-1">
            <h2 className="truncate font-bold text-ink">
              {conversation.contact.name ?? formatPhone(conversation.contact.waId)}
            </h2>
            <p className="truncate text-xs text-ink-muted tabular-nums">
              {formatPhone(conversation.contact.waId)}
            </p>
          </div>

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
