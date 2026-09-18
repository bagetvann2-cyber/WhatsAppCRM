import crypto from "node:crypto";
import type { ChannelAdapter } from "./types";

/** Симулятор ничего никуда не шлёт — просто подтверждает синтетическим id. */
export const simulatorAdapter: ChannelAdapter = {
  async sendText() {
    return { externalMessageId: `sim:${crypto.randomUUID()}` };
  },
};
