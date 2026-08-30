# Earn2Surf — Платформа заработка на заданиях

Сервис, где исполнители выполняют простые задания (подписки, регистрации, лайки, просмотры) за деньги, а рекламодатели платят за активность своих пользователей.

## Бизнес-модель

Деньги в системе — **от рекламодателей**, не от новых участников:
- Рекламодатель создаёт задание и пополняет баланс
- Исполнитель выполняет → деньги удерживаются на платформе (escrow)
- После модерации → исполнитель получает `userReward` (например 80% от суммы)
- Платформа оставляет `platformFee` (например 20%)

Это легитимная PTC-модель (paid-to-click), работающая с 2000-х годов.

## Структура проекта

```
earn2surf/
├── src/
│   ├── app.ts                  # Express-приложение
│   ├── index.ts                # Точка входа
│   ├── config.ts               # Конфигурация
│   ├── middleware/
│   │   └── auth.ts             # JWT-аутентификация
│   ├── models/
│   │   ├── database.ts         # SQLite-схема
│   │   ├── user.ts             # Пользователи
│   │   ├── task.ts             # Задания + выполнения
│   │   ├── withdrawal.ts       # Выплаты
│   │   └── types.ts            # TypeScript-типы
│   ├── routes/
│   │   ├── auth.ts             # /api/auth
│   │   ├── tasks.ts            # /api/tasks
│   │   ├── withdraw.ts         # /api/withdraw
│   │   └── admin.ts            # /api/admin
│   └── views/
│       ├── index.ejs           # Главная (лендинг)
│       ├── register.ejs        # Регистрация
│       ├── login.ejs           # Вход
│       ├── tasks.ejs           # Лента заданий
│       ├── profile.ejs         # Профиль + рефералка
│       ├── withdraw.ejs        # Вывод средств
│       ├── admin.ejs           # Админ-панель
│       └── partials/           # header.ejs, footer.ejs
├── public/
│   ├── css/style.css           # Тёмный стиль
│   └── js/app.js               # Клиентские утилиты
├── .env.example
├── package.json
└── tsconfig.json
```

## Запуск

### 1. Установка зависимостей

```bash
cd C:\Users\mvideo\earn2surf
npm install
```

> **Примечание:** `better-sqlite3` требует нативной компиляции. На Windows нужны `windows-build-tools` или Visual Studio Build Tools. Альтернатива — запустить в WSL2/Docker.

### 2. Конфигурация

```bash
cp .env.example .env
```

Отредактируйте `.env`:
- `JWT_SECRET` — длинная случайная строка (минимум 32 символа)
- `MIN_WITHDRAWAL_USD` — минималка (по умолчанию $5)
- `PLATFORM_FEE_PERCENT` — комиссия платформы (по умолчанию 20%)
- `REFERRAL_BONUS_PERCENT` — бонус рефереру (по умолчанию 10%)

### 3. Создание первого админа

После установки создайте админа через Node REPL:

```bash
node
```

```js
const { UserModel } = require('./dist/models/user');
const { db } = require('./dist/models/database');
const u = UserModel.create({
  username: 'admin',
  email: 'admin@earn2surf.com',
  password: 'your-strong-password',
});
db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(u.id);
console.log('Admin created:', u.username);
```

### 4. Запуск

```bash
npm run build    # Компиляция TypeScript
npm start        # Запуск сервера на http://localhost:3000
```

Или в режиме разработки:
```bash
npm run dev
```

## API

### Аутентификация

```
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me (требует токен)
```

### Задания

```
GET  /api/tasks                  # Список активных
GET  /api/tasks/:id
POST /api/tasks/:id/start        # Начать выполнение
POST /api/tasks/:id/submit       # Отправить доказательство
GET  /api/tasks/user/history     # История выполнения
```

### Вывод средств

```
GET  /api/withdraw/methods
POST /api/withdraw               # Создать заявку
GET  /api/withdraw/history
```

### Админ

```
GET  /api/admin/stats
GET  /api/admin/tasks/pending
POST /api/admin/tasks/:id/approve
POST /api/admin/tasks/:id/reject
GET  /api/admin/completions/pending
POST /api/admin/completions/:id/approve
POST /api/admin/completions/:id/reject
GET  /api/admin/withdraw/pending
POST /api/admin/withdraw/:id/approve
POST /api/admin/withdraw/:id/reject
GET  /api/admin/users
POST /api/admin/users/:id/ban
```

## Бизнес-процессы

### Жизненный цикл задания

1. Рекламодатель создаёт задание → статус `pending_review`
2. Админ одобряет → статус `active`
3. Исполнитель нажимает "Выполнить" → создаётся `task_completion` со статусом `pending`
4. Слот захватывается (`remaining_slots -= 1`)
5. Если требуется proof — исполнитель отправляет доказательство
6. Админ одобряет → пользователю начисляется `userReward`, рефереру — бонус
7. Или отклоняет → слот возвращается, баланс не начисляется

### Жизненный цикл выплаты

1. Пользователь запрашивает вывод → деньги списываются с баланса
2. Заявка со статусом `pending` появляется в админке
3. Админ переводит деньги вне системы (ЮMoney, USDT, карта)
4. Админ нажимает "Одобрить" с TX hash → статус `paid`
5. Если отклонено — деньги возвращаются на баланс

### Реферальная программа

При регистрации с `referralCode`:
- Создаётся запись в `referrals`
- При каждом заработке реферала рефереру автоматически капает 10%
- Вознаграждение пожизненное

## Тарифы и комиссии

| Способ вывода | Комиссия | Лимит |
|---------------|----------|-------|
| USDT TRC20 | $1.00 | от $5 |
| ЮMoney | $0.50 | от $5 |
| Банковская карта | $2.00 | от $5 |

Платформа удерживает с каждого задания `PLATFORM_FEE_PERCENT` (по умолчанию 20%).
Это и есть основной заработок проекта.

## База данных

SQLite, файл `data/earn2surf.db`. Таблицы:

- `users` — пользователи + балансы
- `tasks` — задания от рекламодателей
- `task_completions` — выполнения (pending/approved/rejected)
- `withdrawals` — заявки на вывод
- `advertisers` — рекламодатели
- `referrals` — связи реферер → реферал
- `sessions` — JWT-токены (если используются в дополнение к JWT)

## Стек

- **Backend:** Node.js 20, Express, TypeScript
- **DB:** SQLite (better-sqlite3)
- **Auth:** JWT (jsonwebtoken), bcrypt
- **Views:** EJS, vanilla JS на клиенте
- **Безопасность:** helmet, rate-limit-ready

## Безопасность

- Пароли хешируются bcrypt (12 раундов)
- JWT с 7-дневным сроком действия
- Helmet для базовых HTTP-заголовков
- Бан-флаг блокирует вход
- Все суммы — в центах (integer) — нет float-ошибок
- Атомарные транзакции в БД

## TODO для продакшена

- [ ] Интеграция с ЮMoney API для автоматических выплат
- [ ] Интеграция с TRON API для авто-переводов USDT
- [ ] Email-верификация при регистрации
- [ ] 2FA через Telegram
- [ ] Платёжный шлюз для рекламодателей (ЮKassa, Stripe)
- [ ] WebSocket для live-обновлений ленты
- [ ] Модерация фото-доказательств с распознаванием
- [ ] Anti-fraud: проверка IP, fingerprint, лимиты на аккаунт

## Лицензия

MIT — используйте свободно.
