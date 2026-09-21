#!/usr/bin/env bash
#
# Выкладка демо-стенда на crm.neiroflow.kz.
#
#   bash scripts/deploy.sh
#
# Сборка идёт на рабочей машине: на сервере 2 ГБ памяти на пять приложений,
# и `next build` там рискует увести в OOM соседние проекты.
#
# Миграции базы этот скрипт не трогает — они накатываются отдельно через
# SSH-туннель, см. README, раздел «Демо-стенд».
set -euo pipefail

SERVER="root@95.85.233.195"
REMOTE_DIR="/var/www/whatsappcrm"
APP="crm"

cd "$(dirname "$0")/.."

echo "==> Проверки перед выкладкой"
# Выкатываем только master, совпадающий с origin: прод однажды упал из-за сборки
# с чужой ветки, под которую база была мигрирована иначе.
git fetch -q origin
branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$branch" != "master" ] && [ -z "${DEPLOY_ANY_BRANCH:-}" ]; then
  echo "Выкатывать можно только с master, сейчас: $branch (обход: DEPLOY_ANY_BRANCH=1)"; exit 1
fi
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Есть незакоммиченные изменения — выкладывать нечего, кроме коммитов"; exit 1
fi
if [ "$branch" = "master" ] && [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/master)" ]; then
  echo "master расходится с origin/master — сначала push/pull"; exit 1
fi
# Все миграции из репозитория должны быть на проде: deploy.sh их не накатывает,
# а код ждёт новую схему. Лишние на проде (из другой ветки) — тоже стоп.
applied="$(ssh "$SERVER" "cd $REMOTE_DIR && U=\$(grep '^DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '\"' | cut -d'?' -f1) && psql \"\$U\" -At -c \"select distinct migration_name from _prisma_migrations where finished_at is not null\"" | sort)"
local_migrations="$(ls prisma/migrations | grep -v toml | sort)"
if [ "$applied" != "$local_migrations" ]; then
  echo "Миграции репозитория и прод-базы расходятся:"
  diff <(echo "$local_migrations") <(echo "$applied") || true
  echo "Накатите миграции (README, «Демо-стенд») или выкатывайте нужную ветку."; exit 1
fi

echo "==> Сборка"
npm run build

echo "==> Чистка сборки от того, что серверу не нужно"
# src и scripts остаются: их запускает через tsx воркер очереди (см. ниже).
cd .next/standalone
rm -rf docs tests tools storage \
       eslint.config.mjs postcss.config.mjs vitest.config.mts \
       tsconfig.tsbuildinfo skills-lock.json AGENTS.md CLAUDE.md README.md
cd ../..

echo "==> Статика и public внутрь сборки"
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

echo "==> Заливка"
# storage исключён намеренно: там вложения переписки, они живут только на сервере.
tar czf - -C .next/standalone --exclude=storage . | ssh "$SERVER" "tar xzf - -C $REMOTE_DIR"

# Next выносит внешние пакеты (@prisma/client, pg) в .next/node_modules под
# именами с хешем сборки и не кладёт их в standalone — на сервере им нужны
# симлинки, иначе приложение падает с «Cannot find module ...-<хеш>».
# Хеш меняется от сборки к сборке, поэтому ссылки пересоздаются каждый раз.
echo "==> Ссылки на внешние пакеты"
for link in .next/node_modules/*/ .next/node_modules/@*/*/; do
  # Каталоги областей (@prisma) сами ссылками не являются — пропускаем.
  [ -L "${link%/}" ] || continue
  name="${link#.next/node_modules/}"
  name="${name%/}"
  target="$(basename "$(readlink "${link%/}")")"
  ssh "$SERVER" "mkdir -p \$(dirname $REMOTE_DIR/node_modules/$name) && ln -sfn $target $REMOTE_DIR/node_modules/$name"
  echo "    $name -> $target"
done

echo "==> Перезапуск"
ssh "$SERVER" "chown -R root:root $REMOTE_DIR && pm2 restart $APP --update-env >/dev/null && sleep 4 && curl -s -o /dev/null -w 'ответ приложения: %{http_code}\n' http://127.0.0.1:4100/login"

# Воркер очереди (scripts/worker.ts, npm run worker) запускается через tsx,
# который не входит в standalone-сборку Next — tsx/dotenv/dotenv-cli на сервере
# поставлены руками один раз (devDependencies, кросс-собраны под linux-x64,
# см. историю сессии), обычная сборка их не трогает и не обновляет.
echo "==> Перезапуск воркера"
ssh "$SERVER" "cd $REMOTE_DIR && (pm2 restart crm-worker --update-env >/dev/null || pm2 start npm --name crm-worker --cwd $REMOTE_DIR -- run worker)"

echo "==> Готово: https://crm.neiroflow.kz"
