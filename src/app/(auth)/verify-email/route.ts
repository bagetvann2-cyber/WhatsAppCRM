import { createSession, verifyEmailToken } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";

/** Ссылка из письма: валидный токен подтверждает почту и сразу логинит. */
export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const user = await verifyEmailToken(token);

  const target = user ? "/inbox" : "/login?verifyError=1";
  if (user) {
    await setSessionCookie(await createSession(user.id));
  }

  return Response.redirect(new URL(target, request.url));
}
