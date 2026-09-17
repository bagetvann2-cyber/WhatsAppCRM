import { Golos_Text, JetBrains_Mono, Unbounded } from "next/font/google";
import Link from "next/link";
import { DemoChat } from "./DemoChat";
import { LeadForm } from "./LeadForm";
import styles from "./landing.module.css";

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "700", "900"],
  display: "swap",
});

const golosText = Golos_Text({
  variable: "--font-golos-text",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
  display: "swap",
});

/**
 * Публичный лендинг — единственная страница на дизайн-системе "Ночная смена"
 * (см. DESIGN.md). Остальной кабинет живёт на своей отдельной теме
 * (globals.css) — здесь намеренно свои шрифты и палитра, не общие токены.
 */
export function LandingPage() {
  return (
    <div className={`${unbounded.variable} ${golosText.variable} ${jetbrainsMono.variable} ${styles.page}`}>
      <a href="#main" className={styles.skipLink}>
        Перейти к содержимому
      </a>

      <header className={styles.siteHeader}>
        <nav className={`${styles.siteNav} ${styles.wrap}`} aria-label="Основная навигация">
          <a href="#top" className={styles.brand}>
            WhatsApp<span className={styles.brandDot}>CRM</span>
          </a>
          <div className={styles.navLinks}>
            <a href="#how">Как это работает</a>
            <a href="#proof">Почему не так, как у всех</a>
            <a href="#export">Экспорт заказов</a>
          </div>
          <div className={styles.navActions}>
            <Link href="/login" className={styles.navLogin}>
              Войти
            </Link>
            <a href="#lead" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`}>
              Оставить заявку
            </a>
          </div>
        </nav>
      </header>

      <main id="main">
        <div className={styles.wrap}>
          <section className={styles.hero} id="top">
            <div className={styles.heroGrid}>
              <div>
                <h1 className={styles.heroHeading}>
                  Вы отвечаете
                  <br />в <span className={styles.heroAccent}>2:47</span>.
                  <br />
                  Уже нет.
                </h1>
                <p className={styles.lede}>
                  ИИ-бот сам отвечает клиентам в WhatsApp и Telegram и вытаскивает заказ в таблицу — пока вы
                  спите.
                </p>
                <div className={styles.ctaRow}>
                  <a href="#lead" className={`${styles.btn} ${styles.btnPrimary}`}>
                    Оставить заявку →
                  </a>
                  <a href="#how" className={`${styles.btn} ${styles.btnGhost}`}>
                    Посмотреть как работает
                  </a>
                </div>
                <p className={styles.heroNote}>Работает уже сейчас — не концепт, не обещание.</p>

                <div className={styles.tickerWrap} aria-hidden="true">
                  <div className={styles.tickerLabel}>Заказы за последнюю ночь — без человека</div>
                  <div className={styles.tickerRow}>
                    <span className={styles.tickerTime}>23:41</span>
                    <span className={styles.tickerItem}>Доставка, ул. Абая 12</span>
                    <span className={styles.tickerStatus}>принято</span>
                  </div>
                  <div className={styles.tickerRow}>
                    <span className={styles.tickerTime}>01:12</span>
                    <span className={styles.tickerItem}>2× Плов, самовывоз</span>
                    <span className={styles.tickerStatus}>принято</span>
                  </div>
                  <div className={styles.tickerRow}>
                    <span className={styles.tickerTime}>02:47</span>
                    <span className={styles.tickerItem}>Букет на завтра, 18:00</span>
                    <span className={styles.tickerStatus}>принято</span>
                  </div>
                </div>
              </div>

              <div>
                <DemoChat />
              </div>
            </div>
          </section>

          <section className={styles.sectionTight} id="proof">
            <h2 className={styles.sectionLabel}>Почему не так, как у всех</h2>
            <div className={styles.proofList}>
              <div className={styles.proofRow}>
                <div className={styles.proofNum}>01</div>
                <div className={styles.proofText}>
                  Никаких логотипов чужих компаний и значков «10 000+ клиентов» — здесь{" "}
                  <b>реальные заказы</b>, принятые ботом, пока владелец спал.
                </div>
              </div>
              <div className={styles.proofRow}>
                <div className={styles.proofNum}>02</div>
                <div className={styles.proofText}>
                  Бот слева — не картинка. Напишите ему что угодно прямо на сайте — это демо{" "}
                  <b>того же принципа</b>, что отвечает вашим клиентам.
                </div>
              </div>
              <div className={styles.proofRow}>
                <div className={styles.proofNum}>03</div>
                <div className={styles.proofText}>
                  Настраиваете промт под свою нишу сами — доставка, услуги, магазин. Бот пишет так, как{" "}
                  <b>вы бы сами написали</b>, только не засыпая.
                </div>
              </div>
            </div>
          </section>

          <section className={styles.sectionTight} id="how">
            <h2 className={styles.sectionLabel}>Как это работает</h2>
            <div className={styles.steps}>
              <div className={styles.step}>
                <div className={styles.stepN}>01 — 2 минуты</div>
                <h3>Подключаете WhatsApp или Telegram</h3>
                <p>
                  Свой номер через WhatsApp Business, или бот через @BotFather в Telegram — оба варианта
                  работают сразу.
                </p>
              </div>
              <div className={styles.step}>
                <div className={styles.stepN}>02 — 5 минут</div>
                <h3>Пишете боту, как он должен отвечать</h3>
                <p>Обычным текстом, без кода — тон, ассортимент, что спрашивать у клиента перед заказом.</p>
              </div>
              <div className={styles.step}>
                <div className={styles.stepN}>03 — сразу</div>
                <h3>Заказы падают в таблицу</h3>
                <p>Оператор подтверждает или правит, выгружает в Excel одной кнопкой в конце дня.</p>
              </div>
            </div>
          </section>
        </div>

        <section id="export">
          <div className={styles.paperOuter}>
            <div className={styles.paperSection}>
              <div>
                <h2 className={styles.sectionLabel}>Единственный светлый момент — ваш отчёт</h2>
                <p className={styles.paperLead}>Всё, что бот собрал за ночь — одним файлом.</p>
                <p>Настраиваемые поля под вашу нишу, выгрузка в Excel/CSV без плясок с интеграциями.</p>
              </div>
              <div className={styles.csvCard}>
                <div className={`${styles.csvRow} ${styles.csvRowHead}`}>
                  <span>Клиент</span>
                  <span>Заказ</span>
                  <span>Время</span>
                  <span>Статус</span>
                </div>
                <div className={styles.csvRow}>
                  <span>Айгерим Т.</span>
                  <span>2× сет «Филадельфия»</span>
                  <span>02:47</span>
                  <span>DRAFT</span>
                </div>
                <div className={styles.csvRow}>
                  <span>Ержан С.</span>
                  <span>Доставка, ул. Абая 12</span>
                  <span>23:41</span>
                  <span>CONFIRMED</span>
                </div>
                <div className={styles.csvRow}>
                  <span>Дана К.</span>
                  <span>Букет, завтра 18:00</span>
                  <span>01:12</span>
                  <span>CONFIRMED</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className={styles.wrap}>
          <section className={styles.finalCta} id="lead">
            <div className={styles.finalCtaGrid}>
              <h2>Поставьте бота вместо себя в 2:47.</h2>
              <div className={styles.finalCtaActions}>
                <LeadForm />
                <span className={styles.finalCtaNote}>Свяжемся в течение рабочего дня. Без звонков без повода.</span>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className={styles.siteFooter}>
        <div className={`${styles.wrap} ${styles.footerGrid}`}>
          <span>© 2026 WhatsAppCRM · Казахстан</span>
          <div className={styles.footerLinks}>
            <a href="#how">Как это работает</a>
            <a href="#lead">Оставить заявку</a>
            <Link href="/login">Войти</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
