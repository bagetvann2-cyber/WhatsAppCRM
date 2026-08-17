"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession, registerOrganization, signIn } from "@/lib/auth";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "@/lib/session";

export type FormState = { error: string } | null;

function text(data: FormData, field: string): string {
  const value = data.get(field);
  return typeof value === "string" ? value.trim() : "";
}

export async function signUpAction(_prev: FormState, data: FormData): Promise<FormState> {
  const organizationName = text(data, "organizationName");
  const email = text(data, "email");
  const password = text(data, "password");
  const name = text(data, "name");

  if (!organizationName || !email || !password) {
    return { error: "Заполните название компании, почту и пароль." };
  }
  if (password.length < 8) {
    return { error: "Пароль должен быть не короче 8 символов." };
  }

  let userId: string;
  try {
    const { user } = await registerOrganization({ organizationName, email, password, name });
    userId = user.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось создать кабинет.";
    return { error: message };
  }

  await setSessionCookie(await createSession(userId));
  redirect("/");
}

export async function signInAction(_prev: FormState, data: FormData): Promise<FormState> {
  const email = text(data, "email");
  const password = text(data, "password");

  if (!email || !password) {
    return { error: "Введите почту и пароль." };
  }

  const user = await signIn(email, password);
  // Одна формулировка на оба случая: по тексту ошибки нельзя узнать,
  // зарегистрирован ли адрес.
  if (!user) {
    return { error: "Неверная почта или пароль." };
  }

  await setSessionCookie(await createSession(user.id));
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  await destroySession(await readSessionToken());
  await clearSessionCookie();
  redirect("/login");
}
