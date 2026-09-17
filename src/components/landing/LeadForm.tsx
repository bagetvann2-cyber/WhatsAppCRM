"use client";

import { useState } from "react";
import styles from "./landing.module.css";

/**
 * Заявка с лендинга. Бэкенд под неё ещё не подключён — форма сознательно
 * ничего не отправляет за пределы страницы, только подтверждает получение
 * визуально. Подключить, когда появится реальный приёмник заявок.
 */
export function LeadForm() {
  const [sent, setSent] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setSent(true);
    setTimeout(() => {
      setSent(false);
      form.reset();
    }, 3000);
  }

  return (
    <form className={styles.leadForm} aria-label="Оставить заявку" onSubmit={handleSubmit}>
      <input type="tel" name="phone" placeholder="Ваш номер телефона" required autoComplete="tel" />
      <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={sent}>
        {sent ? "Заявка отправлена ✓" : "Оставить заявку"}
      </button>
    </form>
  );
}
