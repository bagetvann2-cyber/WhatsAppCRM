import Link from "next/link";
import { ContactRow } from "@/components/ContactRow";
import { ImportContacts } from "@/components/ImportContacts";
import { SearchBox } from "@/components/SearchBox";
import { Empty, PageHead } from "@/components/ledger";
import { prisma } from "@/lib/db";
import { listContacts, listTags } from "@/lib/contacts";
import { requireUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";
import { addTagAction, deleteTagAction } from "@/app/(app)/contacts/actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Контакты — WhatsApp CRM" };

export default async function ContactsPage({ searchParams }: PageProps<"/contacts">) {
  const { organization, role } = await requireUser();
  const params = await searchParams;

  const query = typeof params.q === "string" ? params.q : "";
  const selectedTags = typeof params.tag === "string" ? [params.tag] : [];

  const [contacts, tags] = await Promise.all([
    listContacts(organization.id, { query, tagIds: selectedTags }),
    listTags(organization.id),
  ]);

  const conversations = await prisma.conversation.findMany({
    where: { organizationId: organization.id },
    select: { id: true, contactId: true },
  });
  const chatByContact = new Map(conversations.map((c) => [c.contactId, c.id]));

  const filterHref = (tagId?: string) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (tagId) search.set("tag", tagId);
    const qs = search.toString();
    return qs ? `/contacts?${qs}` : "/contacts";
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <PageHead title="Контакты" action={canManageTeam(role) ? <ImportContacts /> : undefined}>
        Карточка заводится сама, как только человек напишет. Метки нужны, чтобы рассылка уходила
        не всем подряд.
      </PageHead>

      <SearchBox initialQuery={query} />

      <section className="mt-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={filterHref()}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              selectedTags.length === 0
                ? "bg-accent-soft text-accent"
                : "bg-panel-muted text-ink-muted hover:text-ink"
            }`}
          >
            Все
          </Link>

          {tags.map((tag) => (
            <span key={tag.id} className="group inline-flex items-center">
              <Link
                href={filterHref(tag.id)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  selectedTags.includes(tag.id)
                    ? "bg-accent-soft text-accent"
                    : "bg-panel-muted text-ink-muted hover:text-ink"
                }`}
              >
                {tag.name} <span className="text-ink-faint">{tag._count.contacts}</span>
              </Link>
              {canManageTeam(role) && (
                <form action={deleteTagAction} className="ml-0.5">
                  <input type="hidden" name="tagId" value={tag.id} />
                  <button
                    type="submit"
                    aria-label={`Удалить метку ${tag.name}`}
                    className="px-1 text-xs text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
                  >
                    ×
                  </button>
                </form>
              )}
            </span>
          ))}

          <NewTagForm />
        </div>
      </section>

      <section className="mt-6">
        {contacts.length === 0 ? (
          <Empty>
            {query || selectedTags.length > 0
              ? "Никого не нашлось. Попробуйте другой запрос или снимите фильтр по метке."
              : "Контактов пока нет. Первый появится, когда клиент напишет на ваш номер."}
          </Empty>
        ) : (
          <>
            <p className="mb-2 text-xs text-ink-faint">Найдено: {contacts.length}</p>
            <ul className="divide-y divide-line border-t border-line">
              {contacts.map((contact) => (
                <ContactRow
                  key={contact.id}
                  contact={{
                    id: contact.id,
                    externalUserId: contact.externalUserId,
                    name: contact.name,
                    note: contact.note,
                    tagIds: contact.tags.map((t) => t.tagId),
                    unsubscribed: contact.unsubscribedAt !== null,
                    unsubscribeSource: contact.unsubscribeSource,
                  }}
                  allTags={tags.map((t) => ({ id: t.id, name: t.name }))}
                  conversationId={chatByContact.get(contact.id)}
                />
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}

function NewTagForm() {
  return (
    <form action={addTagAction} className="inline-flex items-center">
      <input
        name="name"
        placeholder="+ метка"
        aria-label="Новая метка"
        className="w-24 rounded-full border border-dashed border-line bg-transparent px-3 py-1 text-xs text-ink transition-colors placeholder:text-ink-faint hover:border-line-strong focus:w-32 focus:border-accent focus:border-solid"
      />
    </form>
  );
}
