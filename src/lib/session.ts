import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { userFromSessionToken, type CurrentUser } from "@/lib/auth";

export const SESSION_COOKIE = "wa_session";

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 3600,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function readSessionToken(): Promise<string> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? "";
}

/** Текущий пользователь или null. Для страниц, доступных и без входа. */
export async function currentUser(): Promise<CurrentUser | null> {
  return userFromSessionToken(await readSessionToken());
}

/** Текущий пользователь или редирект на вход. Единственная дверь в кабинет. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
