# WhatsApp Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Принять входящее сообщение с тестового номера Meta, сохранить его в базу, показать в браузере и ответить оттуда — сквозной путь без единой заглушки.

**Architecture:** Одно приложение Next.js (App Router). Meta шлёт вебхуки на `/api/webhook`; подпись проверяется HMAC-SHA256 по сырому телу запроса, payload нормализуется чистой функцией, результат пишется в PostgreSQL через Prisma с идемпотентностью по `wamid`. UI читает диалоги из базы и получает обновления через SSE. Исходящие уходят в Graph API и сохраняются той же записью, что потом обновляется статусами доставки.

**Tech Stack:** Next.js (App Router, TypeScript), Prisma, PostgreSQL 17, Vitest, cloudflared (туннель для вебхуков в разработке).

## Global Constraints

- Node.js v24.14.1, npm 11.11.0 — уже установлены, не менять.
- Только официальный WhatsApp Cloud API. Никаких whatsapp-web.js, QR-логинов и эмуляции WhatsApp Web — это условие раздела 3.5 ТЗ.
- Все секреты только в `.env.local`, файл в `.gitignore`. В коде и в коммитах токенов нет.
- Версия Graph API берётся из переменной `GRAPH_API_VERSION`, дефолт `v22.0`. Точную актуальную версию сверить в консоли Meta на шаге Task 0.
- Комментарии и текст интерфейса — на русском. Имена в коде — на английском.
- Каждая задача заканчивается коммитом. Ветка разработки — `main` локально, репозиторий пока не публикуется.
- Тесты не ходят в сеть: HTTP-вызовы к Graph API мокаются.
- Файлы держим маленькими и по одной ответственности. Логика парсинга и подписи — чистые функции вне роутов, чтобы тестироваться без HTTP.

---

## File Structure

| Файл | Ответственность |
|---|---|
| `prisma/schema.prisma` | Схема: Contact, Conversation, Message |
| `src/lib/env.ts` | Чтение и валидация переменных окружения |
| `src/lib/db.ts` | Единственный экземпляр PrismaClient |
| `src/lib/signature.ts` | Проверка подписи `x-hub-signature-256` |
| `src/lib/whatsapp/parse.ts` | Payload Meta → нормализованные события (чистая функция) |
| `src/lib/whatsapp/client.ts` | Отправка сообщений в Graph API |
| `src/lib/ingest.ts` | Запись нормализованных событий в базу, идемпотентность |
| `src/lib/events.ts` | Шина событий в процессе для SSE |
| `src/app/api/webhook/route.ts` | GET-верификация и POST-приём вебхуков |
| `src/app/api/messages/route.ts` | Отправка исходящего из интерфейса |
| `src/app/api/stream/route.ts` | SSE-поток обновлений |
| `src/app/page.tsx` | Список диалогов |
| `src/app/chat/[id]/page.tsx` | Переписка одного диалога |
| `src/app/chat/[id]/Composer.tsx` | Поле ввода и отправка |
| `src/app/chat/[id]/LiveRefresh.tsx` | Подписка на SSE и обновление данных |
| `tests/*.test.ts` | Юнит-тесты чистых функций и записи в базу |

---

## Task 0: Подготовка доступов Meta

Ручной этап. Кода нет, но без него не работает ничего дальше. Выполняется в браузере под личным аккаунтом Facebook — юридическое лицо и верификация бизнеса на этом этапе не нужны.

**Files:** `.env.local` (создаётся в Task 1, значения собираются здесь)

**Interfaces:**
- Produces: значения `WHATSAPP_APP_SECRET`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `GRAPH_API_VERSION`

- [ ] **Шаг 1: Создать приложение**

Зайти на `developers.facebook.com` → My Apps → Create App → тип **Business**. Название любое, например `WhatsAppCRM Dev`.

- [ ] **Шаг 2: Добавить продукт WhatsApp**

В приложении: Add Product → **WhatsApp** → Set up. Meta автоматически создаст тестовый WABA и тестовый номер.

- [ ] **Шаг 3: Записать идентификаторы**

На странице WhatsApp → API Setup скопировать:
- **Temporary access token** → в `WHATSAPP_TOKEN` (живёт 24 часа, для старта хватает)
- **Phone number ID** → в `WHATSAPP_PHONE_NUMBER_ID`
- Версию API из примера curl (например `v22.0`) → в `GRAPH_API_VERSION`

- [ ] **Шаг 4: Добавить получателя**

Там же, в блоке To → Manage phone number list → добавить свой личный номер WhatsApp и подтвердить кодом. Тестовый номер может писать максимум пяти таким получателям.

- [ ] **Шаг 5: Записать App Secret**

App settings → Basic → App Secret → Show → скопировать в `WHATSAPP_APP_SECRET`.

- [ ] **Шаг 6: Придумать verify token**

Любая случайная строка, например `kelesu-dev-9f2a71c4`. Записать в `WHATSAPP_VERIFY_TOKEN` — она же вводится в настройках вебхука в Task 10.

- [ ] **Шаг 7: Проверить, что отправка работает**

Скопировать готовый curl со страницы API Setup и выполнить его в терминале. Ожидаемо: на личный телефон приходит шаблон `hello_world`. Если не пришло — дальше идти нет смысла, разбираться здесь.

---

## Task 1: Каркас проекта и база данных

**Files:**
- Create: весь каркас Next.js в `C:\Users\BagetPC_2\Desktop\WhatsAppCRM`
- Create: `prisma/schema.prisma`, `src/lib/env.ts`, `src/lib/db.ts`, `.env.local`, `.gitignore`, `vitest.config.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Consumes: значения из Task 0
- Produces: `prisma` (экземпляр PrismaClient из `src/lib/db.ts`), `env` (объект из `src/lib/env.ts`), модели `Contact`, `Conversation`, `Message`, enum `MessageDirection`

- [ ] **Шаг 1: Установить PostgreSQL**

```powershell
winget install --id PostgreSQL.PostgreSQL.17 --accept-package-agreements --accept-source-agreements
```

Задать пароль пользователя `postgres` при установке и запомнить его. После установки открыть новый терминал, чтобы `psql` появился в PATH.

- [ ] **Шаг 2: Создать базу**

```powershell
& "C:\Program Files\PostgreSQL\17\bin\createdb.exe" -U postgres whatsapp_crm_dev
```

Ожидаемо: команда завершается без вывода. Проверка: `& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -l` показывает базу `whatsapp_crm_dev`.

- [ ] **Шаг 3: Создать приложение Next.js**

```powershell
cd "C:\Users\BagetPC_2\Desktop"
npx create-next-app@latest WhatsAppCRM --typescript --app --src-dir --eslint --tailwind --import-alias "@/*" --use-npm
```

На вопрос про существующую папку — согласиться (в ней только `docs/`, файлы не перезаписываются).

- [ ] **Шаг 4: Поставить зависимости**

```powershell
cd "C:\Users\BagetPC_2\Desktop\WhatsAppCRM"
npm install prisma @prisma/client
npm install -D vitest @vitejs/plugin-react dotenv-cli
npx prisma init --datasource-provider postgresql
```

- [ ] **Шаг 5: Написать схему базы**

Записать в `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum MessageDirection {
  INBOUND
  OUTBOUND
}

model Contact {
  id            String         @id @default(cuid())
  waId          String         @unique
  name          String?
  createdAt     DateTime       @default(now())
  conversations Conversation[]
}

model Conversation {
  id              String    @id @default(cuid())
  contactId       String
  contact         Contact   @relation(fields: [contactId], references: [id])
  phoneNumberId   String
  lastMessageAt   DateTime  @default(now())
  windowExpiresAt DateTime?
  messages        Message[]

  @@unique([contactId, phoneNumberId])
  @@index([lastMessageAt])
}

model Message {
  id             String           @id @default(cuid())
  wamid          String           @unique
  conversationId String
  conversation   Conversation     @relation(fields: [conversationId], references: [id])
  direction      MessageDirection
  type           String
  text           String?
  status         String?
  timestamp      DateTime
  createdAt      DateTime         @default(now())

  @@index([conversationId, timestamp])
}
```

- [ ] **Шаг 6: Записать переменные окружения**

Создать `.env.local` (значения из Task 0, пароль Postgres свой):

```
DATABASE_URL="postgresql://postgres:ПАРОЛЬ@localhost:5432/whatsapp_crm_dev"
WHATSAPP_APP_SECRET="..."
WHATSAPP_VERIFY_TOKEN="kelesu-dev-9f2a71c4"
WHATSAPP_TOKEN="..."
WHATSAPP_PHONE_NUMBER_ID="..."
GRAPH_API_VERSION="v22.0"
```

Prisma CLI читает `.env`, а не `.env.local`, поэтому создать ещё файл `.env` с одной строкой `DATABASE_URL` (то же значение).

Добавить в `.gitignore`:

```
.env
.env.local
```

- [ ] **Шаг 7: Применить миграцию**

```powershell
npx prisma migrate dev --name init
```

Ожидаемо: создаётся `prisma/migrations/*_init/`, в базе появляются три таблицы.

- [ ] **Шаг 8: Написать доступ к переменным окружения**

`src/lib/env.ts`:

```ts
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Не задана переменная окружения ${name}. Проверьте .env.local`);
  }
  return value;
}

export const env = {
  appSecret: () => required("WHATSAPP_APP_SECRET"),
  verifyToken: () => required("WHATSAPP_VERIFY_TOKEN"),
  token: () => required("WHATSAPP_TOKEN"),
  phoneNumberId: () => required("WHATSAPP_PHONE_NUMBER_ID"),
  graphVersion: () => process.env.GRAPH_API_VERSION ?? "v22.0",
};
```

- [ ] **Шаг 9: Написать клиент базы**

`src/lib/db.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Шаг 10: Настроить Vitest**

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

В `package.json` в раздел `scripts` добавить:

```json
"test": "dotenv -e .env.local -- vitest run",
"test:watch": "dotenv -e .env.local -- vitest"
```

- [ ] **Шаг 11: Написать падающий тест на базу**

`tests/db.test.ts`:

```ts
import { afterAll, expect, test } from "vitest";
import { prisma } from "../src/lib/db";

afterAll(async () => {
  await prisma.message.deleteMany({ where: { wamid: "wamid.test.db" } });
  await prisma.conversation.deleteMany({ where: { phoneNumberId: "test-pnid" } });
  await prisma.contact.deleteMany({ where: { waId: "77010000001" } });
  await prisma.$disconnect();
});

test("сохраняет сообщение в цепочке контакт → диалог → сообщение", async () => {
  const contact = await prisma.contact.create({
    data: { waId: "77010000001", name: "Тест" },
  });
  const conversation = await prisma.conversation.create({
    data: { contactId: contact.id, phoneNumberId: "test-pnid" },
  });
  const message = await prisma.message.create({
    data: {
      wamid: "wamid.test.db",
      conversationId: conversation.id,
      direction: "INBOUND",
      type: "text",
      text: "Здравствуйте",
      timestamp: new Date("2026-08-16T10:00:00Z"),
    },
  });

  expect(message.text).toBe("Здравствуйте");
  expect(message.direction).toBe("INBOUND");
});
```

- [ ] **Шаг 12: Запустить тест и убедиться, что он проходит**

Run: `npm test`
Expected: PASS. Если ошибка подключения — проверить `DATABASE_URL` и что служба PostgreSQL запущена.

- [ ] **Шаг 13: Коммит**

```bash
git init
git add -A
git commit -m "feat: каркас проекта, схема базы, подключение Prisma"
```

---

## Task 2: Проверка подписи вебхука

Meta подписывает каждый POST. Без проверки любой человек, узнавший URL, сможет подсовывать фальшивые сообщения.

**Files:**
- Create: `src/lib/signature.ts`
- Test: `tests/signature.test.ts`

**Interfaces:**
- Produces: `isValidSignature(rawBody: string, header: string | null, appSecret: string): boolean`

- [ ] **Шаг 1: Написать падающие тесты**

`tests/signature.test.ts`:

```ts
import crypto from "node:crypto";
import { expect, test } from "vitest";
import { isValidSignature } from "../src/lib/signature";

const secret = "test-secret";
const body = '{"object":"whatsapp_business_account"}';

function sign(payload: string, key: string): string {
  return "sha256=" + crypto.createHmac("sha256", key).update(payload, "utf8").digest("hex");
}

test("принимает корректную подпись", () => {
  expect(isValidSignature(body, sign(body, secret), secret)).toBe(true);
});

test("отклоняет подпись, сделанную чужим ключом", () => {
  expect(isValidSignature(body, sign(body, "wrong-secret"), secret)).toBe(false);
});

test("отклоняет изменённое тело", () => {
  expect(isValidSignature('{"object":"hacked"}', sign(body, secret), secret)).toBe(false);
});

test("отклоняет отсутствующий заголовок", () => {
  expect(isValidSignature(body, null, secret)).toBe(false);
});

test("отклоняет заголовок без префикса sha256=", () => {
  expect(isValidSignature(body, "abcdef", secret)).toBe(false);
});

test("отклоняет заголовок с мусором вместо hex", () => {
  expect(isValidSignature(body, "sha256=не-хекс", secret)).toBe(false);
});
```

- [ ] **Шаг 2: Запустить тесты и убедиться, что они падают**

Run: `npm test -- tests/signature.test.ts`
Expected: FAIL с сообщением о том, что модуль `../src/lib/signature` не найден.

- [ ] **Шаг 3: Написать реализацию**

`src/lib/signature.ts`:

```ts
import crypto from "node:crypto";

/**
 * Проверяет подпись Meta из заголовка x-hub-signature-256.
 * Считать нужно от СЫРОГО тела запроса: любая пересборка JSON ломает подпись.
 */
export function isValidSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): boolean {
  if (!header || !header.startsWith("sha256=")) {
    return false;
  }

  const received = header.slice("sha256=".length);
  if (!/^[0-9a-f]+$/i.test(received)) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");
  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}
```

- [ ] **Шаг 4: Запустить тесты и убедиться, что они проходят**

Run: `npm test -- tests/signature.test.ts`
Expected: PASS, 6 тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add src/lib/signature.ts tests/signature.test.ts
git commit -m "feat: проверка подписи вебхука Meta"
```

---

## Task 3: GET-верификация вебхука

Meta один раз дёргает эндпоинт методом GET и ждёт обратно значение `hub.challenge` — иначе не подпишет на события.

**Files:**
- Create: `src/app/api/webhook/route.ts`
- Test: `tests/webhook-verify.test.ts`

**Interfaces:**
- Consumes: `env` из `src/lib/env.ts`
- Produces: экспорт `GET(request: Request): Promise<Response>` из `src/app/api/webhook/route.ts`

- [ ] **Шаг 1: Написать падающие тесты**

`tests/webhook-verify.test.ts`:

```ts
import { beforeAll, expect, test } from "vitest";
import { GET } from "../src/app/api/webhook/route";

beforeAll(() => {
  process.env.WHATSAPP_VERIFY_TOKEN = "verify-me";
});

function get(params: Record<string, string>): Request {
  const url = new URL("https://example.com/api/webhook");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url);
}

test("возвращает challenge при верном токене", async () => {
  const response = await GET(
    get({ "hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "12345" }),
  );
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("12345");
});

test("отвечает 403 при неверном токене", async () => {
  const response = await GET(
    get({ "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "12345" }),
  );
  expect(response.status).toBe(403);
});

test("отвечает 403 при неверном режиме", async () => {
  const response = await GET(
    get({ "hub.mode": "unsubscribe", "hub.verify_token": "verify-me", "hub.challenge": "12345" }),
  );
  expect(response.status).toBe(403);
});
```

- [ ] **Шаг 2: Запустить тесты и убедиться, что они падают**

Run: `npm test -- tests/webhook-verify.test.ts`
Expected: FAIL, модуль роута не найден.

- [ ] **Шаг 3: Написать реализацию**

`src/app/api/webhook/route.ts`:

```ts
import { env } from "@/lib/env";

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === env.verifyToken() && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  return new Response("Forbidden", { status: 403 });
}
```

Если импорт `@/lib/env` не резолвится в тестах, добавить в `vitest.config.ts`:

```ts
import path from "node:path";
// ... внутри defineConfig:
resolve: { alias: { "@": path.resolve(__dirname, "src") } },
```

- [ ] **Шаг 4: Запустить тесты и убедиться, что они проходят**

Run: `npm test -- tests/webhook-verify.test.ts`
Expected: PASS, 3 теста.

- [ ] **Шаг 5: Коммит**

```bash
git add src/app/api/webhook/route.ts tests/webhook-verify.test.ts vitest.config.ts
git commit -m "feat: GET-верификация вебхука"
```

---

## Task 4: Разбор payload от Meta

Формат вложенный и разнородный: в одном запросе может прийти и сообщение, и статусы доставки. Выносим в чистую функцию, чтобы тестировать без HTTP и без базы.

**Files:**
- Create: `src/lib/whatsapp/parse.ts`
- Test: `tests/parse.test.ts`

**Interfaces:**
- Produces:
  - тип `IncomingMessage = { wamid: string; from: string; profileName: string | null; phoneNumberId: string; type: string; text: string | null; timestamp: Date }`
  - тип `StatusUpdate = { wamid: string; status: string; timestamp: Date }`
  - тип `ParsedWebhook = { messages: IncomingMessage[]; statuses: StatusUpdate[] }`
  - функция `parseWebhook(payload: unknown): ParsedWebhook`

- [ ] **Шаг 1: Написать падающие тесты**

`tests/parse.test.ts`:

```ts
import { expect, test } from "vitest";
import { parseWebhook } from "../src/lib/whatsapp/parse";

const incoming = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "15550001111", phone_number_id: "PNID123" },
            contacts: [{ profile: { name: "Айбек" }, wa_id: "77011234567" }],
            messages: [
              {
                from: "77011234567",
                id: "wamid.AAA",
                timestamp: "1755300000",
                type: "text",
                text: { body: "Здравствуйте" },
              },
            ],
          },
        },
      ],
    },
  ],
};

const statusOnly = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "15550001111", phone_number_id: "PNID123" },
            statuses: [
              { id: "wamid.BBB", status: "delivered", timestamp: "1755300100", recipient_id: "77011234567" },
            ],
          },
        },
      ],
    },
  ],
};

test("разбирает входящее текстовое сообщение", () => {
  const result = parseWebhook(incoming);
  expect(result.messages).toHaveLength(1);
  expect(result.messages[0]).toEqual({
    wamid: "wamid.AAA",
    from: "77011234567",
    profileName: "Айбек",
    phoneNumberId: "PNID123",
    type: "text",
    text: "Здравствуйте",
    timestamp: new Date(1755300000 * 1000),
  });
  expect(result.statuses).toHaveLength(0);
});

test("разбирает статусы доставки", () => {
  const result = parseWebhook(statusOnly);
  expect(result.messages).toHaveLength(0);
  expect(result.statuses).toEqual([
    { wamid: "wamid.BBB", status: "delivered", timestamp: new Date(1755300100 * 1000) },
  ]);
});

test("для нетекстового типа кладёт null в text, но сообщение не теряет", () => {
  const image = structuredClone(incoming);
  image.entry[0].changes[0].value.messages[0] = {
    from: "77011234567",
    id: "wamid.CCC",
    timestamp: "1755300200",
    type: "image",
  } as never;

  const result = parseWebhook(image);
  expect(result.messages).toHaveLength(1);
  expect(result.messages[0].type).toBe("image");
  expect(result.messages[0].text).toBeNull();
});

test("не падает на пустом или чужом payload", () => {
  expect(parseWebhook({})).toEqual({ messages: [], statuses: [] });
  expect(parseWebhook(null)).toEqual({ messages: [], statuses: [] });
  expect(parseWebhook({ entry: [{ changes: [{ field: "account_update", value: {} }] }] })).toEqual({
    messages: [],
    statuses: [],
  });
});
```

- [ ] **Шаг 2: Запустить тесты и убедиться, что они падают**

Run: `npm test -- tests/parse.test.ts`
Expected: FAIL, модуль не найден.

- [ ] **Шаг 3: Написать реализацию**

`src/lib/whatsapp/parse.ts`:

```ts
export type IncomingMessage = {
  wamid: string;
  from: string;
  profileName: string | null;
  phoneNumberId: string;
  type: string;
  text: string | null;
  timestamp: Date;
};

export type StatusUpdate = {
  wamid: string;
  status: string;
  timestamp: Date;
};

export type ParsedWebhook = {
  messages: IncomingMessage[];
  statuses: StatusUpdate[];
};

function toDate(seconds: unknown): Date {
  return new Date(Number(seconds) * 1000);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Превращает вложенный payload Meta в плоские списки.
 * Ничего не бросает: на неизвестной структуре возвращает пустой результат,
 * иначе один странный запрос уронил бы приём всех остальных.
 */
export function parseWebhook(payload: unknown): ParsedWebhook {
  const messages: IncomingMessage[] = [];
  const statuses: StatusUpdate[] = [];

  for (const entry of asArray(asRecord(payload).entry)) {
    for (const change of asArray(asRecord(entry).changes)) {
      const value = asRecord(asRecord(change).value);
      const metadata = asRecord(value.metadata);
      const phoneNumberId = String(metadata.phone_number_id ?? "");

      const contacts = asArray(value.contacts);
      const nameByWaId = new Map<string, string | null>();
      for (const contact of contacts) {
        const record = asRecord(contact);
        const profile = asRecord(record.profile);
        nameByWaId.set(String(record.wa_id ?? ""), (profile.name as string) ?? null);
      }

      for (const raw of asArray(value.messages)) {
        const message = asRecord(raw);
        const from = String(message.from ?? "");
        const text = asRecord(message.text).body;

        messages.push({
          wamid: String(message.id ?? ""),
          from,
          profileName: nameByWaId.get(from) ?? null,
          phoneNumberId,
          type: String(message.type ?? "unknown"),
          text: typeof text === "string" ? text : null,
          timestamp: toDate(message.timestamp),
        });
      }

      for (const raw of asArray(value.statuses)) {
        const status = asRecord(raw);
        statuses.push({
          wamid: String(status.id ?? ""),
          status: String(status.status ?? ""),
          timestamp: toDate(status.timestamp),
        });
      }
    }
  }

  return { messages, statuses };
}
```

- [ ] **Шаг 4: Запустить тесты и убедиться, что они проходят**

Run: `npm test -- tests/parse.test.ts`
Expected: PASS, 4 теста.

- [ ] **Шаг 5: Коммит**

```bash
git add src/lib/whatsapp/parse.ts tests/parse.test.ts
git commit -m "feat: разбор payload вебхука"
```

---

## Task 5: Запись входящих в базу

Meta повторяет доставку вебхука при любом ответе, кроме 200, — одно и то же сообщение придёт несколько раз. Защита строится на уникальном `wamid`.

**Files:**
- Create: `src/lib/ingest.ts`
- Test: `tests/ingest.test.ts`

**Interfaces:**
- Consumes: `prisma`, типы `IncomingMessage` и `StatusUpdate` из Task 4
- Produces:
  - `saveIncomingMessage(message: IncomingMessage): Promise<{ conversationId: string; created: boolean }>`
  - `applyStatusUpdate(update: StatusUpdate): Promise<void>`

- [ ] **Шаг 1: Написать падающие тесты**

`tests/ingest.test.ts`:

```ts
import { afterEach, afterAll, expect, test } from "vitest";
import { prisma } from "../src/lib/db";
import { applyStatusUpdate, saveIncomingMessage } from "../src/lib/ingest";
import type { IncomingMessage } from "../src/lib/whatsapp/parse";

const waId = "77019998877";

const base: IncomingMessage = {
  wamid: "wamid.INGEST.1",
  from: waId,
  profileName: "Айбек",
  phoneNumberId: "PNID-INGEST",
  type: "text",
  text: "Первое сообщение",
  timestamp: new Date("2026-08-16T09:00:00Z"),
};

async function cleanup() {
  await prisma.message.deleteMany({ where: { conversation: { phoneNumberId: "PNID-INGEST" } } });
  await prisma.conversation.deleteMany({ where: { phoneNumberId: "PNID-INGEST" } });
  await prisma.contact.deleteMany({ where: { waId } });
}

afterEach(cleanup);
afterAll(async () => {
  await prisma.$disconnect();
});

test("создаёт контакт, диалог и сообщение", async () => {
  const result = await saveIncomingMessage(base);

  expect(result.created).toBe(true);
  const stored = await prisma.message.findUnique({ where: { wamid: base.wamid } });
  expect(stored?.text).toBe("Первое сообщение");

  const contact = await prisma.contact.findUnique({ where: { waId } });
  expect(contact?.name).toBe("Айбек");
});

test("повторная доставка того же wamid не создаёт дубль", async () => {
  await saveIncomingMessage(base);
  const second = await saveIncomingMessage(base);

  expect(second.created).toBe(false);
  const count = await prisma.message.count({ where: { wamid: base.wamid } });
  expect(count).toBe(1);
});

test("второе сообщение попадает в тот же диалог и двигает окно 24 часа", async () => {
  const first = await saveIncomingMessage(base);
  const second = await saveIncomingMessage({
    ...base,
    wamid: "wamid.INGEST.2",
    text: "Второе сообщение",
    timestamp: new Date("2026-08-16T11:00:00Z"),
  });

  expect(second.conversationId).toBe(first.conversationId);

  const conversation = await prisma.conversation.findUnique({ where: { id: first.conversationId } });
  expect(conversation?.windowExpiresAt?.toISOString()).toBe("2026-08-17T11:00:00.000Z");
});

test("статус доставки записывается в сообщение", async () => {
  await saveIncomingMessage(base);
  await applyStatusUpdate({
    wamid: base.wamid,
    status: "delivered",
    timestamp: new Date("2026-08-16T09:00:05Z"),
  });

  const stored = await prisma.message.findUnique({ where: { wamid: base.wamid } });
  expect(stored?.status).toBe("delivered");
});

test("статус для неизвестного wamid не бросает ошибку", async () => {
  await expect(
    applyStatusUpdate({ wamid: "wamid.NOPE", status: "read", timestamp: new Date() }),
  ).resolves.toBeUndefined();
});
```

- [ ] **Шаг 2: Запустить тесты и убедиться, что они падают**

Run: `npm test -- tests/ingest.test.ts`
Expected: FAIL, модуль `../src/lib/ingest` не найден.

- [ ] **Шаг 3: Написать реализацию**

`src/lib/ingest.ts`:

```ts
import { prisma } from "@/lib/db";
import type { IncomingMessage, StatusUpdate } from "@/lib/whatsapp/parse";

const WINDOW_HOURS = 24;

/**
 * Сохраняет входящее сообщение. Повторная доставка того же wamid
 * не создаёт дубликат — Meta шлёт вебхук повторно при любом ответе кроме 200.
 */
export async function saveIncomingMessage(
  message: IncomingMessage,
): Promise<{ conversationId: string; created: boolean }> {
  const contact = await prisma.contact.upsert({
    where: { waId: message.from },
    update: message.profileName ? { name: message.profileName } : {},
    create: { waId: message.from, name: message.profileName },
  });

  const windowExpiresAt = new Date(message.timestamp.getTime() + WINDOW_HOURS * 3600 * 1000);

  const conversation = await prisma.conversation.upsert({
    where: {
      contactId_phoneNumberId: {
        contactId: contact.id,
        phoneNumberId: message.phoneNumberId,
      },
    },
    update: { lastMessageAt: message.timestamp, windowExpiresAt },
    create: {
      contactId: contact.id,
      phoneNumberId: message.phoneNumberId,
      lastMessageAt: message.timestamp,
      windowExpiresAt,
    },
  });

  const existing = await prisma.message.findUnique({ where: { wamid: message.wamid } });
  if (existing) {
    return { conversationId: conversation.id, created: false };
  }

  await prisma.message.create({
    data: {
      wamid: message.wamid,
      conversationId: conversation.id,
      direction: "INBOUND",
      type: message.type,
      text: message.text,
      timestamp: message.timestamp,
    },
  });

  return { conversationId: conversation.id, created: true };
}

/** Обновляет статус доставки. Статус может прийти раньше, чем мы узнали о сообщении. */
export async function applyStatusUpdate(update: StatusUpdate): Promise<void> {
  await prisma.message.updateMany({
    where: { wamid: update.wamid },
    data: { status: update.status },
  });
}
```

- [ ] **Шаг 4: Запустить тесты и убедиться, что они проходят**

Run: `npm test -- tests/ingest.test.ts`
Expected: PASS, 5 тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add src/lib/ingest.ts tests/ingest.test.ts
git commit -m "feat: запись входящих сообщений с защитой от дублей"
```

---

## Task 6: POST-приём вебхука

Связывает подпись, разбор и запись. Отвечать нужно быстро и всегда 200 при верной подписи — иначе Meta уйдёт в повторы и в итоге отключит вебхук.

**Files:**
- Modify: `src/app/api/webhook/route.ts` (добавить экспорт `POST`)
- Create: `src/lib/events.ts`
- Test: `tests/webhook-post.test.ts`

**Interfaces:**
- Consumes: `isValidSignature`, `parseWebhook`, `saveIncomingMessage`, `applyStatusUpdate`
- Produces:
  - экспорт `POST(request: Request): Promise<Response>`
  - `messageEvents` — экземпляр `EventEmitter` из `src/lib/events.ts`, событие `"update"`

- [ ] **Шаг 1: Написать шину событий**

`src/lib/events.ts`:

```ts
import { EventEmitter } from "node:events";

const globalForEvents = globalThis as unknown as { messageEvents?: EventEmitter };

/** Шина событий в пределах процесса: вебхук уведомляет открытые SSE-соединения. */
export const messageEvents = globalForEvents.messageEvents ?? new EventEmitter();
messageEvents.setMaxListeners(100);

if (process.env.NODE_ENV !== "production") {
  globalForEvents.messageEvents = messageEvents;
}
```

- [ ] **Шаг 2: Написать падающие тесты**

`tests/webhook-post.test.ts`:

```ts
import crypto from "node:crypto";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { POST } from "../src/app/api/webhook/route";
import { prisma } from "../src/lib/db";

const secret = "post-secret";
const waId = "77015554433";

beforeAll(() => {
  process.env.WHATSAPP_APP_SECRET = secret;
});

async function cleanup() {
  await prisma.message.deleteMany({ where: { conversation: { phoneNumberId: "PNID-POST" } } });
  await prisma.conversation.deleteMany({ where: { phoneNumberId: "PNID-POST" } });
  await prisma.contact.deleteMany({ where: { waId } });
}

afterEach(cleanup);
afterAll(async () => {
  await prisma.$disconnect();
});

function payload(wamid: string) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "1555", phone_number_id: "PNID-POST" },
              contacts: [{ profile: { name: "Дана" }, wa_id: waId }],
              messages: [
                { from: waId, id: wamid, timestamp: "1755300000", type: "text", text: { body: "Привет" } },
              ],
            },
          },
        ],
      },
    ],
  };
}

function request(body: unknown, key = secret): Request {
  const raw = JSON.stringify(body);
  const signature =
    "sha256=" + crypto.createHmac("sha256", key).update(raw, "utf8").digest("hex");
  return new Request("https://example.com/api/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": signature },
    body: raw,
  });
}

test("сохраняет сообщение и отвечает 200", async () => {
  const response = await POST(request(payload("wamid.POST.1")));
  expect(response.status).toBe(200);

  const stored = await prisma.message.findUnique({ where: { wamid: "wamid.POST.1" } });
  expect(stored?.text).toBe("Привет");
});

test("отклоняет запрос с чужой подписью и ничего не пишет", async () => {
  const response = await POST(request(payload("wamid.POST.2"), "wrong-secret"));
  expect(response.status).toBe(403);

  const stored = await prisma.message.findUnique({ where: { wamid: "wamid.POST.2" } });
  expect(stored).toBeNull();
});

test("повторная доставка возвращает 200 и не создаёт дубль", async () => {
  await POST(request(payload("wamid.POST.3")));
  const second = await POST(request(payload("wamid.POST.3")));

  expect(second.status).toBe(200);
  expect(await prisma.message.count({ where: { wamid: "wamid.POST.3" } })).toBe(1);
});

test("неизвестная структура не роняет обработчик", async () => {
  const response = await POST(request({ object: "whatsapp_business_account", entry: [] }));
  expect(response.status).toBe(200);
});
```

- [ ] **Шаг 3: Запустить тесты и убедиться, что они падают**

Run: `npm test -- tests/webhook-post.test.ts`
Expected: FAIL — `POST` не экспортируется из роута.

- [ ] **Шаг 4: Дописать роут**

Добавить в `src/app/api/webhook/route.ts` (импорты — к существующим наверху файла):

```ts
import { env } from "@/lib/env";
import { messageEvents } from "@/lib/events";
import { applyStatusUpdate, saveIncomingMessage } from "@/lib/ingest";
import { isValidSignature } from "@/lib/signature";
import { parseWebhook } from "@/lib/whatsapp/parse";

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();

  if (!isValidSignature(rawBody, request.headers.get("x-hub-signature-256"), env.appSecret())) {
    return new Response("Forbidden", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Отвечаем 200: повторять такой запрос бессмысленно.
    return new Response("OK", { status: 200 });
  }

  const { messages, statuses } = parseWebhook(payload);

  for (const message of messages) {
    const { conversationId, created } = await saveIncomingMessage(message);
    if (created) {
      messageEvents.emit("update", { conversationId });
    }
  }

  for (const status of statuses) {
    await applyStatusUpdate(status);
  }

  if (statuses.length > 0) {
    messageEvents.emit("update", { conversationId: null });
  }

  return new Response("OK", { status: 200 });
}
```

- [ ] **Шаг 5: Запустить тесты и убедиться, что они проходят**

Run: `npm test -- tests/webhook-post.test.ts`
Expected: PASS, 4 теста.

- [ ] **Шаг 6: Прогнать все тесты**

Run: `npm test`
Expected: PASS, все файлы.

- [ ] **Шаг 7: Коммит**

```bash
git add src/app/api/webhook/route.ts src/lib/events.ts tests/webhook-post.test.ts
git commit -m "feat: приём вебхуков с проверкой подписи"
```

---

## Task 7: Отправка сообщений в Graph API

**Files:**
- Create: `src/lib/whatsapp/client.ts`
- Test: `tests/client.test.ts`

**Interfaces:**
- Consumes: `env`
- Produces: `sendTextMessage(to: string, text: string): Promise<{ wamid: string }>` — бросает `Error` с текстом ошибки Meta при ответе не 2xx

- [ ] **Шаг 1: Написать падающие тесты**

`tests/client.test.ts`:

```ts
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { sendTextMessage } from "../src/lib/whatsapp/client";

beforeAll(() => {
  process.env.WHATSAPP_TOKEN = "test-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "PNID-SEND";
  process.env.GRAPH_API_VERSION = "v22.0";
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("шлёт корректный запрос и возвращает wamid", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ messages: [{ id: "wamid.SENT" }] }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const result = await sendTextMessage("77011234567", "Добрый день");

  expect(result.wamid).toBe("wamid.SENT");
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://graph.facebook.com/v22.0/PNID-SEND/messages");
  expect(init.headers.Authorization).toBe("Bearer test-token");
  expect(JSON.parse(init.body)).toEqual({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "77011234567",
    type: "text",
    text: { preview_url: false, body: "Добрый день" },
  });
});

test("бросает ошибку с текстом от Meta при отказе", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Recipient not in allowed list" } }), {
        status: 400,
      }),
    ),
  );

  await expect(sendTextMessage("77010000000", "Тест")).rejects.toThrow(
    "Recipient not in allowed list",
  );
});
```

- [ ] **Шаг 2: Запустить тесты и убедиться, что они падают**

Run: `npm test -- tests/client.test.ts`
Expected: FAIL, модуль не найден.

- [ ] **Шаг 3: Написать реализацию**

`src/lib/whatsapp/client.ts`:

```ts
import { env } from "@/lib/env";

/** Отправляет текстовое сообщение. Работает только внутри 24-часового окна. */
export async function sendTextMessage(to: string, text: string): Promise<{ wamid: string }> {
  const url = `https://graph.facebook.com/${env.graphVersion()}/${env.phoneNumberId()}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text },
    }),
  });

  const data = (await response.json()) as {
    messages?: { id: string }[];
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(data.error?.message ?? `Graph API вернул ${response.status}`);
  }

  const wamid = data.messages?.[0]?.id;
  if (!wamid) {
    throw new Error("Graph API не вернул идентификатор сообщения");
  }

  return { wamid };
}
```

- [ ] **Шаг 4: Запустить тесты и убедиться, что они проходят**

Run: `npm test -- tests/client.test.ts`
Expected: PASS, 2 теста.

- [ ] **Шаг 5: Коммит**

```bash
git add src/lib/whatsapp/client.ts tests/client.test.ts
git commit -m "feat: клиент отправки сообщений в Graph API"
```

---

## Task 8: Эндпоинт отправки из интерфейса

**Files:**
- Create: `src/app/api/messages/route.ts`
- Test: `tests/messages-route.test.ts`

**Interfaces:**
- Consumes: `sendTextMessage`, `prisma`, `messageEvents`
- Produces: экспорт `POST(request: Request): Promise<Response>`; принимает JSON `{ conversationId: string, text: string }`, возвращает `{ wamid }` со статусом 200, `{ error }` со статусом 400 или 422

- [ ] **Шаг 1: Написать падающие тесты**

`tests/messages-route.test.ts`:

```ts
import { afterAll, afterEach, expect, test, vi } from "vitest";
import { POST } from "../src/app/api/messages/route";
import { prisma } from "../src/lib/db";

const waId = "77012223344";

async function seed(windowExpiresAt: Date) {
  const contact = await prisma.contact.create({ data: { waId, name: "Ержан" } });
  return prisma.conversation.create({
    data: { contactId: contact.id, phoneNumberId: "PNID-OUT", windowExpiresAt },
  });
}

async function cleanup() {
  await prisma.message.deleteMany({ where: { conversation: { phoneNumberId: "PNID-OUT" } } });
  await prisma.conversation.deleteMany({ where: { phoneNumberId: "PNID-OUT" } });
  await prisma.contact.deleteMany({ where: { waId } });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanup();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function request(body: unknown): Request {
  return new Request("https://example.com/api/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("отправляет сообщение и сохраняет его как исходящее", async () => {
  const conversation = await seed(new Date(Date.now() + 3600 * 1000));
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.OUT.1" }] }), { status: 200 }),
    ),
  );

  const response = await POST(request({ conversationId: conversation.id, text: "Готово" }));

  expect(response.status).toBe(200);
  const stored = await prisma.message.findUnique({ where: { wamid: "wamid.OUT.1" } });
  expect(stored?.direction).toBe("OUTBOUND");
  expect(stored?.text).toBe("Готово");
});

test("отказывает при истёкшем окне 24 часа", async () => {
  const conversation = await seed(new Date(Date.now() - 1000));
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const response = await POST(request({ conversationId: conversation.id, text: "Поздно" }));

  expect(response.status).toBe(422);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("отказывает при пустом тексте", async () => {
  const conversation = await seed(new Date(Date.now() + 3600 * 1000));
  const response = await POST(request({ conversationId: conversation.id, text: "   " }));
  expect(response.status).toBe(400);
});

test("отказывает при неизвестном диалоге", async () => {
  const response = await POST(request({ conversationId: "нет-такого", text: "Привет" }));
  expect(response.status).toBe(400);
});
```

- [ ] **Шаг 2: Запустить тесты и убедиться, что они падают**

Run: `npm test -- tests/messages-route.test.ts`
Expected: FAIL, модуль роута не найден.

- [ ] **Шаг 3: Написать реализацию**

`src/app/api/messages/route.ts`:

```ts
import { prisma } from "@/lib/db";
import { messageEvents } from "@/lib/events";
import { sendTextMessage } from "@/lib/whatsapp/client";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as
    | { conversationId?: string; text?: string }
    | null;

  const text = body?.text?.trim();
  if (!body?.conversationId || !text) {
    return Response.json({ error: "Укажите диалог и текст сообщения" }, { status: 400 });
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: body.conversationId },
    include: { contact: true },
  });

  if (!conversation) {
    return Response.json({ error: "Диалог не найден" }, { status: 400 });
  }

  const windowOpen =
    conversation.windowExpiresAt !== null && conversation.windowExpiresAt.getTime() > Date.now();

  if (!windowOpen) {
    return Response.json(
      { error: "Окно 24 часа закрыто. Свободный ответ недоступен, нужен одобренный шаблон." },
      { status: 422 },
    );
  }

  try {
    const { wamid } = await sendTextMessage(conversation.contact.waId, text);
    const now = new Date();

    await prisma.message.create({
      data: {
        wamid,
        conversationId: conversation.id,
        direction: "OUTBOUND",
        type: "text",
        text,
        status: "sent",
        timestamp: now,
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: now },
    });

    messageEvents.emit("update", { conversationId: conversation.id });

    return Response.json({ wamid }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось отправить сообщение";
    return Response.json({ error: message }, { status: 502 });
  }
}
```

- [ ] **Шаг 4: Запустить тесты и убедиться, что они проходят**

Run: `npm test -- tests/messages-route.test.ts`
Expected: PASS, 4 теста.

- [ ] **Шаг 5: Коммит**

```bash
git add src/app/api/messages/route.ts tests/messages-route.test.ts
git commit -m "feat: отправка сообщения из интерфейса"
```

---

## Task 9: Интерфейс — список диалогов и переписка

Тестов Vitest здесь нет: это разметка, которая проверяется глазами на шаге 5 и вживую в Task 10.

**Files:**
- Create: `src/app/page.tsx`, `src/app/chat/[id]/page.tsx`, `src/app/chat/[id]/Composer.tsx`, `src/app/chat/[id]/LiveRefresh.tsx`, `src/app/api/stream/route.ts`
- Modify: `src/app/globals.css` (только если Tailwind-классы не применяются)

**Interfaces:**
- Consumes: `prisma`, `messageEvents`, эндпоинт `POST /api/messages`
- Produces: страницы `/` и `/chat/[id]`, поток `GET /api/stream`

- [ ] **Шаг 1: Написать SSE-поток**

`src/app/api/stream/route.ts`:

```ts
import { messageEvents } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const encoder = new TextEncoder();

  let onUpdate: () => void;
  let keepAlive: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    start(controller) {
      onUpdate = () => {
        controller.enqueue(encoder.encode("data: update\n\n"));
      };

      messageEvents.on("update", onUpdate);
      controller.enqueue(encoder.encode(": connected\n\n"));

      keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 25000);
    },
    // ReadableStream не умеет чистить ресурсы из start — только отсюда.
    cancel() {
      clearInterval(keepAlive);
      messageEvents.off("update", onUpdate);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
```

- [ ] **Шаг 2: Написать список диалогов**

`src/app/page.tsx`:

```tsx
import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const conversations = await prisma.conversation.findMany({
    orderBy: { lastMessageAt: "desc" },
    include: {
      contact: true,
      messages: { orderBy: { timestamp: "desc" }, take: 1 },
    },
  });

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">Диалоги</h1>

      {conversations.length === 0 && (
        <p className="text-slate-500">
          Пока пусто. Напишите на тестовый номер из WhatsApp — сообщение появится здесь.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {conversations.map((conversation) => (
          <li key={conversation.id}>
            <Link
              href={`/chat/${conversation.id}`}
              className="block rounded border border-slate-200 p-4 hover:bg-slate-50"
            >
              <div className="font-medium">
                {conversation.contact.name ?? conversation.contact.waId}
              </div>
              <div className="truncate text-sm text-slate-500">
                {conversation.messages[0]?.text ?? "—"}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Шаг 3: Написать страницу переписки**

`src/app/chat/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Composer from "./Composer";
import LiveRefresh from "./LiveRefresh";

export const dynamic = "force-dynamic";

export default async function Chat({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      contact: true,
      messages: { orderBy: { timestamp: "asc" } },
    },
  });

  if (!conversation) {
    notFound();
  }

  const windowOpen =
    conversation.windowExpiresAt !== null && conversation.windowExpiresAt.getTime() > Date.now();

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col p-6">
      <LiveRefresh />

      <header className="mb-4 flex items-baseline justify-between border-b border-slate-200 pb-3">
        <div>
          <Link href="/" className="text-sm text-slate-500 hover:underline">
            ← Все диалоги
          </Link>
          <h1 className="text-xl font-semibold">
            {conversation.contact.name ?? conversation.contact.waId}
          </h1>
        </div>
        <span className={windowOpen ? "text-sm text-emerald-700" : "text-sm text-amber-700"}>
          {windowOpen
            ? `Окно открыто до ${conversation.windowExpiresAt!.toLocaleString("ru-RU")}`
            : "Окно 24 часа закрыто"}
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {conversation.messages.map((message) => (
          <div
            key={message.id}
            className={
              message.direction === "OUTBOUND"
                ? "self-end rounded-lg bg-emerald-600 px-3 py-2 text-white"
                : "self-start rounded-lg bg-slate-100 px-3 py-2"
            }
          >
            <div>{message.text ?? `[${message.type}]`}</div>
            <div className="mt-1 text-xs opacity-70">
              {message.timestamp.toLocaleTimeString("ru-RU")}
              {message.status ? ` · ${message.status}` : ""}
            </div>
          </div>
        ))}
      </div>

      <Composer conversationId={conversation.id} disabled={!windowOpen} />
    </main>
  );
}
```

- [ ] **Шаг 4: Написать поле ввода**

`src/app/chat/[id]/Composer.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Composer({
  conversationId,
  disabled,
}: {
  conversationId: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSending(true);

    const response = await fetch("/api/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId, text }),
    });

    setSending(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Не удалось отправить" }));
      setError(data.error);
      return;
    }

    setText("");
    router.refresh();
  }

  return (
    <form onSubmit={send} className="mt-4 flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={disabled || sending}
          placeholder={disabled ? "Окно закрыто — нужен шаблон" : "Введите сообщение"}
          className="flex-1 rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
        />
        <button
          type="submit"
          disabled={disabled || sending || text.trim() === ""}
          className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-40"
        >
          {sending ? "Отправка" : "Отправить"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
```

- [ ] **Шаг 5: Написать подписку на обновления**

`src/app/chat/[id]/LiveRefresh.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Слушает SSE и перезапрашивает серверные данные при новом сообщении. */
export default function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const source = new EventSource("/api/stream");
    source.onmessage = () => router.refresh();
    return () => source.close();
  }, [router]);

  return null;
}
```

- [ ] **Шаг 6: Проверить сборку и внешний вид**

Run: `npm run build`
Expected: сборка без ошибок типов.

Run: `npm run dev`, открыть `http://localhost:3000`
Expected: страница «Диалоги» с текстом-подсказкой о пустом списке.

- [ ] **Шаг 7: Коммит**

```bash
git add src/app
git commit -m "feat: интерфейс диалогов, переписка и живое обновление"
```

---

## Task 10: Сквозная проверка вживую

**Files:**
- Modify: `README.md` (описание запуска)

**Interfaces:**
- Consumes: всё, что сделано в задачах 1–9

- [ ] **Шаг 1: Установить туннель**

```powershell
winget install --id Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements
```

Открыть новый терминал, чтобы команда появилась в PATH.

- [ ] **Шаг 2: Запустить приложение и туннель**

В первом терминале:

```powershell
cd "C:\Users\BagetPC_2\Desktop\WhatsAppCRM"
npm run dev
```

Во втором:

```powershell
cloudflared tunnel --url http://localhost:3000
```

Скопировать выданный адрес вида `https://что-то.trycloudflare.com`. Он живёт, пока запущена команда; при перезапуске адрес меняется и вебхук надо переподключить.

- [ ] **Шаг 3: Подключить вебхук в Meta**

В приложении Meta: WhatsApp → Configuration → Webhook → Edit.
- Callback URL: `https://что-то.trycloudflare.com/api/webhook`
- Verify token: значение `WHATSAPP_VERIFY_TOKEN` из `.env.local`
- Нажать Verify and save.

Expected: Meta принимает адрес. Если пишет ошибку — в терминале `npm run dev` смотреть, дошёл ли GET-запрос.

- [ ] **Шаг 4: Подписаться на события messages**

Там же, в блоке Webhook fields, нажать Manage и включить подписку **messages**.

- [ ] **Шаг 5: Проверить входящее**

Со своего личного телефона написать на тестовый номер из WhatsApp.

Expected: в терминале виден POST на `/api/webhook`; на странице `http://localhost:3000` появляется диалог с текстом сообщения.

- [ ] **Шаг 6: Проверить исходящее**

Открыть диалог, написать ответ, нажать «Отправить».

Expected: сообщение приходит на телефон; в переписке видно справа зелёным; под ним появляется статус `sent`, затем через секунды — `delivered` и `read` без перезагрузки страницы.

- [ ] **Шаг 7: Проверить закрытие окна**

В базе вручную состарить окно. Важно: колонка хранится без часового пояса, а Node читает её как UTC — с голым `NOW()` (локальное время Алматы, +05) окно уедет в будущее и останется открытым. Поэтому явно `AT TIME ZONE 'UTC'`:

```powershell
$env:PGPASSWORD='postgres'
$sql = @'
UPDATE "Conversation" SET "windowExpiresAt" = (NOW() AT TIME ZONE 'UTC') - INTERVAL '1 hour';
'@
$sql | & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d whatsapp_crm_dev -q
```

Обновить страницу диалога.

Expected: в шапке «Окно 24 часа закрыто», поле ввода заблокировано с подсказкой про шаблон.

- [ ] **Шаг 8: Вернуть окно и записать инструкцию**

```powershell
$env:PGPASSWORD='postgres'
$sql = @'
UPDATE "Conversation" SET "windowExpiresAt" = (NOW() AT TIME ZONE 'UTC') + INTERVAL '24 hours';
'@
$sql | & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d whatsapp_crm_dev -q
```

Дописать в `README.md` раздел «Запуск разработки»: команды из шагов 1–4, требование обновлять Callback URL при перезапуске туннеля и напоминание, что временный токен Meta живёт 24 часа.

- [ ] **Шаг 9: Прогнать все тесты**

Run: `npm test`
Expected: PASS, все файлы.

- [ ] **Шаг 10: Коммит**

```bash
git add README.md
git commit -m "docs: инструкция запуска и сквозной проверки"
```

---

## Что этот срез намеренно не делает

Проверяется гипотеза «мы умеем принимать и отправлять», поэтому вне объёма осталось: авторизация и организации (мультитенантность), Embedded Signup, шаблоны и рассылки, медиафайлы, интеграции с CRM, биллинг. Всё это — модули M-01…M-09 из ТЗ, они планируются отдельно после того, как срез заработает вживую.

Отдельно: временный токен Meta живёт 24 часа. Постоянный токен системного пользователя выпускается только в верифицированном Business Manager заказчика — до этого момента токен придётся обновлять вручную примерно раз в сутки.
