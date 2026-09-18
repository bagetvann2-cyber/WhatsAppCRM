import { DownloadIcon } from "@/components/icons";
import { Empty, PageHead, Table, Th } from "@/components/ledger";
import { OrderFieldsForm } from "@/components/OrderFieldsForm";
import { OrderRow } from "@/components/OrderRow";
import { getOrderFields, getOrders } from "@/lib/orders-store";
import { requireUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";

export const dynamic = "force-dynamic";

export const metadata = { title: "Заказы — WhatsApp CRM" };

export default async function OrdersPage() {
  const { organization, role } = await requireUser();

  const [fieldDefs, orders] = await Promise.all([
    getOrderFields(organization.id),
    getOrders(organization.id),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <PageHead
        title="Заказы"
        action={
          orders.length > 0 && (
            <a
              href="/api/orders/export"
              className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-panel-muted"
            >
              <DownloadIcon className="size-4" />
              Выгрузить в Excel
            </a>
          )
        }
      >
        Бот собирает заказ из переписки по ходу разговора. Здесь — подтвердить, поправить или отменить.
      </PageHead>

      {canManageTeam(role) && <OrderFieldsForm initial={fieldDefs} />}

      {fieldDefs.length === 0 ? (
        <Empty>
          {canManageTeam(role)
            ? "Настройте поля заказа выше — без них боту нечего сохранять."
            : "Поля заказа ещё не настроены владельцем или администратором."}
        </Empty>
      ) : orders.length === 0 ? (
        <Empty>Пока ни одного заказа. Появится, как только бот распознает его в переписке.</Empty>
      ) : (
        <Table
          caption="Заказы"
          head={
            <>
              <Th>Контакт</Th>
              <Th>Статус</Th>
              <Th>Создан</Th>
              {fieldDefs.map((field) => (
                <Th key={field.id}>{field.label}</Th>
              ))}
              <Th>
                <span className="sr-only">Действия</span>
              </Th>
            </>
          }
        >
          {orders.map((order) => (
            <OrderRow
              key={order.id}
              order={{
                id: order.id,
                status: order.status,
                contactName: order.conversation.contact.name ?? order.conversation.contact.externalUserId,
                createdAt: order.createdAt,
                fields: order.fields as Record<string, unknown>,
              }}
              fieldDefs={fieldDefs}
            />
          ))}
        </Table>
      )}
    </main>
  );
}
