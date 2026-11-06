#!/bin/bash
# D&N — запуск на MacBook. iPhone в той же Wi-Fi сети открывает адрес, который покажет этот скрипт.
# Запуск: двойной клик по файлу (или в Терминале: bash start-mac.command). Остановить: закрыть окно Терминала.

cd "$(dirname "$0")" || exit 1
echo ""
echo "=== D&N ==="

if ! command -v node >/dev/null 2>&1; then
  echo "Не найден Node.js. Сейчас откроется сайт nodejs.org — скачайте версию LTS, установите и запустите этот файл снова."
  open "https://nodejs.org" 2>/dev/null
  read -r -p "Нажмите Enter, чтобы закрыть…"
  exit 1
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
NODE_MINOR=$(node -p "process.versions.node.split('.')[1]")
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 13 ]; }; then
  echo "Нужен Node.js 22.13 или новее (сейчас $(node -v)). Установите LTS с nodejs.org и запустите снова."
  open "https://nodejs.org" 2>/dev/null
  read -r -p "Нажмите Enter, чтобы закрыть…"
  exit 1
fi

# Пароль и ключ создаются один раз и хранятся в .env.local (в git не попадает).
if [ ! -f .env.local ]; then
  PASS=$(node -e "console.log(require('crypto').randomInt(100000,999999))")
  KEY=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")
  printf "DN_APP_PASSWORD=%s\nDN_INGEST_TOKEN=%s\n" "$PASS" "$KEY" > .env.local
  echo "Создан пароль для входа (сохранён в .env.local)."
fi
PASS=$(grep '^DN_APP_PASSWORD=' .env.local | cut -d= -f2-)

echo "Устанавливаю и собираю (первый раз — пара минут)…"
npm install --no-audit --no-fund --loglevel=error || { read -r -p "Ошибка установки. Enter — закрыть…"; exit 1; }
npm run build --silent >/tmp/dn-build.log 2>&1 || { cat /tmp/dn-build.log; read -r -p "Ошибка сборки. Enter — закрыть…"; exit 1; }

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
PORT=3000

echo ""
echo "======================================================"
echo "  Готово. На iPhone (в той же Wi-Fi сети) откройте в Safari:"
echo ""
echo "      http://${IP:-IP-адрес-этого-Mac}:$PORT"
echo ""
echo "  Пароль: $PASS"
echo ""
echo "  На этом Mac: http://localhost:$PORT"
echo "  Чтобы остановить — закройте это окно."
echo "======================================================"
echo ""
exec npx next start -H 0.0.0.0 -p "$PORT"
