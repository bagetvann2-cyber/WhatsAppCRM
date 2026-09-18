import { completeEmbeddedSignup } from "@/lib/channels/embedded-signup-store";
import { currentUser } from "@/lib/session";
import { canManageTeam } from "@/lib/team";

export async function POST(request: Request): Promise<Response> {
  const me = await currentUser();
  if (!me || !canManageTeam(me.role)) {
    return Response.json({ error: "Подключать номер может владелец или администратор." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { code?: string; phoneNumberId?: string; wabaId?: string }
    | null;

  const { code, phoneNumberId, wabaId } = body ?? {};
  if (!code || !phoneNumberId || !wabaId) {
    return Response.json({ error: "Meta не передала все данные для подключения." }, { status: 400 });
  }

  const result = await completeEmbeddedSignup({
    organizationId: me.organization.id,
    code,
    phoneNumberId,
    wabaId,
  });

  if (!result.ok) {
    return Response.json({ error: result.error, step: result.step }, { status: 502 });
  }

  return Response.json({ ok: true, channelId: result.channelId, info: result.info });
}
