import { exportOrdersCsv } from "@/lib/orders-store";
import { currentUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";

export async function GET(): Promise<Response> {
  const me = await currentUser();
  if (!me || !canManageTeam(me.role)) {
    return new Response("Нужно войти в кабинет", { status: 401 });
  }

  const csv = await exportOrdersCsv(me.organization.id);
  const date = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="orders-${date}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
