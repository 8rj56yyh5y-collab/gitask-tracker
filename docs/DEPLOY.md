# Как запустить D&N в интернете (Railway)

Railway — хостинг, который сам берёт код из GitHub и даёт адрес вида `https://dn-production.up.railway.app`.
Нужен постоянный диск (volume), потому что база хранится в файле. Ориентировочно $5 в месяц.

## 1. Создать проект

1. Зайти на https://railway.com и войти через GitHub.
2. **New Project → Deploy from GitHub repo** → выбрать `gitask-tracker`.
3. Если pull request ещё не влит в `main`: в сервисе **Settings → Source → Branch** выбрать
   `claude/hopeful-davinci-yrcko2`.

## 2. Диск для базы

1. В проекте: **+ Create → Volume** (или правой кнопкой по сервису → Attach volume).
2. Подключить к сервису D&N, путь (Mount path): `/data`.

## 3. Переменные (вкладка Variables)

| Переменная | Значение |
| --- | --- |
| `DN_APP_PASSWORD` | ваш пароль для входа (от 6 символов) |
| `DN_INGEST_TOKEN` | длинный случайный ключ (от 16 символов), для «Команд» и Monobank |
| `DN_DB_PATH` | `/data/dn.db` |
| `DN_PUBLIC_URL` | адрес из шага 4, например `https://dn-production.up.railway.app` |

Сгенерировать ключ можно на https://1password.com/password-generator (длина 32, без символов).

## 4. Адрес

**Settings → Networking → Generate Domain**. Railway выдаст адрес — его вписать в `DN_PUBLIC_URL`
(сервис перезапустится сам).

## 5. Проверить

1. Открыть адрес в Safari на iPhone, войти паролем.
2. «Поделиться» → «На экран „Домой“» — появится иконка D&N.
3. Настроить «Команды» по [IPHONE_SETUP.md](IPHONE_SETUP.md), подставив адрес и `DN_INGEST_TOKEN`.

Обновления: каждый push в выбранную ветку Railway выкатывает сам.
