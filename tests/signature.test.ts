import crypto from "node:crypto";
import { expect, test } from "vitest";
import { isValidSignature } from "@/lib/signature";

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
