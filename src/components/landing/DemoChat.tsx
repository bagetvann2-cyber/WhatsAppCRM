"use client";

import { useRef, useState } from "react";
import styles from "./landing.module.css";

type Bubble = { id: number; kind: "in" | "out"; text: string };

const RULES: { test: RegExp; reply: string; order?: boolean }[] = [
  { test: /стоит|цена|сколько/i, reply: "Зависит от деталей, уточните и я посчитаю." },
  { test: /доставк|привезти|привезёте/i, reply: "Доставим сегодня до 21:00 или завтра с утра, что удобнее?" },
  { test: /когда|время/i, reply: "Обычно занимает 30–40 минут." },
  { test: /документ|чек|квитанц|пошлин|деклараци/i, reply: "Приняла, данные уже в таблице.", order: true },
  { test: /адрес|улица|ул\./i, reply: "Записала адрес, добавляю в таблицу.", order: true },
  { test: /.+/, reply: "Поняла, уточните детали и я всё запишу." },
];

/**
 * Демо-бот на клиенте — имитация по ключевым словам, не настоящий бэкенд.
 * Показывает принцип диалога прямо на лендинге, без риска для реальных
 * учётных данных продукта: серьёзная интеграция с ИИ-ботом — отдельная задача.
 */
export function DemoChat() {
  const [bubbles, setBubbles] = useState<Bubble[]>([
    { id: 1, kind: "in", text: "Добрый вечер, оплатил гос. пошлину за ввоз посылки из США. Чек и декларация во вложении." },
    { id: 2, kind: "out", text: "Приняла, всё зафиксировала. Данные уже в таблице." },
  ]);
  const [orderAdded, setOrderAdded] = useState(true);
  const [typing, setTyping] = useState(false);
  const [value, setValue] = useState("");
  const [showHint, setShowHint] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(3);

  function scrollToEnd() {
    requestAnimationFrame(() => {
      const el = bodyRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  function send() {
    const text = value.trim();
    if (!text) return;

    const id = nextId.current++;
    setBubbles((prev) => [...prev, { id, kind: "in", text }]);
    setValue("");
    setShowHint(false);
    setTyping(true);
    scrollToEnd();

    const rule = RULES.find((r) => r.test.test(text))!;
    const delay = 500 + Math.random() * 500;
    setTimeout(() => {
      setTyping(false);
      const replyId = nextId.current++;
      setBubbles((prev) => [...prev, { id: replyId, kind: "out", text: rule.reply }]);
      scrollToEnd();
      if (rule.order) {
        setTimeout(() => {
          setOrderAdded(true);
          scrollToEnd();
        }, 350);
      }
    }, delay);
  }

  return (
    <div className={styles.chatDemo}>
      <div className={styles.chatHead}>
        <span className={styles.liveDot} aria-hidden="true" />
        демо-бот · попробуйте написать
      </div>
      <div
        ref={bodyRef}
        className={styles.chatBody}
        role="log"
        aria-live="polite"
        aria-label="Демо-переписка с ботом"
      >
        {bubbles.map((b) => (
          <div key={b.id} className={`${styles.bubble} ${b.kind === "in" ? styles.bubbleIn : styles.bubbleOut}`}>
            {b.text}
          </div>
        ))}
        {typing && (
          <div className={styles.typingIndicator} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        )}
        {orderAdded && (
          <div className={styles.orderCard}>
            <span className="k">DRAFT →</span> данные добавлены в таблицу
          </div>
        )}
      </div>
      <div className={styles.chatFoot}>
        <label htmlFor="landing-chat-input" className={styles.srOnly}>
          Написать демо-боту
        </label>
        <input
          id="landing-chat-input"
          type="text"
          className={styles.chatInput}
          placeholder="Напишите что-нибудь…"
          autoComplete="off"
          maxLength={140}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
        />
        <button type="button" className={styles.chatSend} aria-label="Отправить сообщение" onClick={send}>
          →
        </button>
      </div>
      {showHint && <div className={styles.chatHint}>попробуйте: «сколько стоит» или «когда доставите»</div>}
    </div>
  );
}
