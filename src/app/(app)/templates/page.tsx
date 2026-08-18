import { redirect } from "next/navigation";
import { TemplateEditor } from "@/components/TemplateEditor";
import { AlertIcon } from "@/components/icons";
import { Empty, Group, GroupTitle, PageHead } from "@/components/ledger";
import { requireUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";
import { TEMPLATE_CATEGORIES, TEMPLATE_LANGUAGES, renderTemplate, statusLabel } from "@/lib/templates";
import { listTemplates } from "@/lib/templates-store";
import { deleteTemplateAction, sendForReviewAction } from "@/app/(app)/templates/actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Шаблоны — WhatsApp CRM" };

/**
 * В списке шаблон узнают по тексту, а не по служебному имени: имя
 * составлено латиницей для Meta, и владельцу оно ничего не говорит.
 */
function firstLine(bodyText: string): string {
  const line = bodyText.trim().split("\n")[0] ?? "";
  return line.length > 60 ? `${line.slice(0, 60)}…` : line;
}

/**
 * Причины отказа приходят от Meta кодами. Владельцу нужен не код, а понимание,
 * что именно переписать.
 */
const REJECTION_REASON: Record<string, string> = {
  INVALID_FORMAT: "WhatsApp не принял оформление: обычно мешают ошибки в тексте, лишние пробелы или подстановка на самом краю сообщения",
  ABUSIVE_CONTENT: "WhatsApp счёл текст навязчивым или недопустимым",
  INCORRECT_CATEGORY: "Текст не подходит выбранной категории — например, реклама отправлена как служебное сообщение",
  SCAM: "WhatsApp заподозрил в тексте обман",
  PROMOTIONAL: "Служебное сообщение не может рекламировать — уберите предложение и скидки или смените категорию на «Реклама»",
  TAG_CONTENT_MISMATCH: "Текст не совпадает с назначением шаблона",
};

function rejectionReason(code: string): string {
  return REJECTION_REASON[code] ?? `WhatsApp вернул причину: ${code}`;
}

function categoryLabel(category: string): string {
  return TEMPLATE_CATEGORIES.find((option) => option.value === category)?.label ?? category;
}

function languageLabel(code: string): string {
  return TEMPLATE_LANGUAGES.find((option) => option.code === code)?.label ?? code;
}

/** Что означает статус на языке владельца, а не на языке Meta. */
const STATUS_NOTE: Record<string, string> = {
  DRAFT: "Ещё не отправлен в WhatsApp — рассылать по нему нельзя",
  PENDING: "Ждёт ответа WhatsApp, обычно от нескольких минут до суток",
  APPROVED: "Проверен — можно рассылать и писать первым",
  REJECTED: "WhatsApp не пропустил текст",
  PAUSED: "Приостановлен: на сообщения часто жаловались",
  DISABLED: "Отключён WhatsApp, рассылать по нему нельзя",
};

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-panel-muted text-ink-muted",
  PENDING: "bg-warn-soft text-warn",
  APPROVED: "bg-accent-soft text-accent",
  REJECTED: "bg-danger-soft text-danger",
  PAUSED: "bg-warn-soft text-warn",
  DISABLED: "bg-danger-soft text-danger",
};

export default async function TemplatesPage() {
  const { organization, role } = await requireUser();
  if (!canManageTeam(role)) {
    redirect("/");
  }

  const templates = await listTemplates(organization.id);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <PageHead title="Шаблоны сообщений">
        WhatsApp разрешает писать клиенту первым только заранее проверенным текстом. То же правило
        действует, если клиент молчит дольше суток. Такой текст и составляется здесь — один раз,
        а дальше уходит хоть тысяче человек с их именами и датами.
      </PageHead>

      <Group className="mt-0">
        <GroupTitle>Новый шаблон</GroupTitle>
        <div className="pt-5">
          <TemplateEditor />
        </div>
      </Group>

      <Group className="mt-12">
        <GroupTitle
          aside={
            templates.length > 0 ? (
              <span className="text-xs text-ink-faint tabular-nums">{templates.length}</span>
            ) : undefined
          }
        >
          Ваши шаблоны
        </GroupTitle>

        {templates.length === 0 ? (
          <Empty>Пока ни одного. Начинают обычно с самого ходового — подтверждения записи или заказа.</Empty>
        ) : (
          <ul>
            {templates.map((template) => (
              <li key={template.id} className="border-b border-line py-4 last:border-b-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">
                      {template.headerText?.trim() ||
                        firstLine(renderTemplate(template.bodyText, template.examples))}
                    </p>
                    <p className="text-xs text-ink-faint">
                      {categoryLabel(template.category)} · {languageLabel(template.language)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      STATUS_STYLE[template.status] ?? "bg-panel-muted text-ink-muted"
                    }`}
                  >
                    {statusLabel(template.status)}
                  </span>
                </div>

                <p className="mt-1 text-xs text-ink-faint">{STATUS_NOTE[template.status]}</p>

                <p className="mt-3 text-sm whitespace-pre-wrap text-ink-muted">
                  {renderTemplate(template.bodyText, template.examples)}
                </p>

                {template.rejectedReason && (
                  <p className="mt-3 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                    <AlertIcon className="mt-0.5 size-4 shrink-0" />
                    {rejectionReason(template.rejectedReason)}. Поправьте текст и отправьте заново.
                  </p>
                )}

                <div className="mt-4 flex items-center gap-3">
                  {(template.status === "DRAFT" || template.status === "REJECTED") && (
                    <form action={sendForReviewAction}>
                      <input type="hidden" name="id" value={template.id} />
                      <button
                        type="submit"
                        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
                      >
                        Отправить на проверку
                      </button>
                    </form>
                  )}

                  <form action={deleteTemplateAction}>
                    <input type="hidden" name="id" value={template.id} />
                    <button
                      type="submit"
                      className="text-xs text-ink-muted transition-colors hover:text-danger"
                    >
                      Удалить
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Group>
    </main>
  );
}
