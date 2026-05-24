# OpenWeb

**[English](README.md)** · **[Русский](README.ru.md)** · **[简体中文](README.zh.md)**

Браузерная автоматизация с открытым исходным кодом для AI-агентов. Управляйте Chrome из Claude Code, Cursor, Windsurf, OpenCode или любого MCP-совместимого инструмента.

## Архитектура

```
AI-агент (Claude/Cursor/Windsurf)
    ↓ MCP (stdio)
MCP-сервер (mcp-server.js)
    ↓ WebSocket
Демон (daemon.js)
    ↓ WebSocket
Расширение Chrome
    ↓ CDP
Браузер
```

## Быстрый старт

### Установка одной командой

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/QWKiks/openweb/main/install.ps1 | iex
```

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/QWKiks/openweb/main/install.sh | bash
```

Скрипт:
1. Клонирует репозиторий и установит зависимости
2. Зарегистрирует MCP-сервер во всех найденных AI-инструментах
3. Выведет инструкции по загрузке расширения Chrome

### Ручная установка

```bash
git clone https://github.com/QWKiks/openweb.git
cd openweb
npm install
```

### Шаг 1: Загрузите расширение Chrome

1. Откройте `chrome://extensions`
2. Включите **Режим разработчика** (справа вверху)
3. Нажмите **Загрузить распакованное расширение** → выберите папку `openweb`
4. Иконка расширения появится на панели инструментов

### Шаг 2: Подключите расширение

1. Нажмите на иконку OpenWeb на панели инструментов
2. Нажмите **Подключиться** — статус станет зелёным с анимированной рамкой

### Шаг 3: Зарегистрируйте MCP в вашем AI-инструменте

```bash
# Интерактивный режим — покажет, что установлено
npm run setup-mcp

# Зарегистрировать во всех найденных инструментах
npm run setup-mcp -- --all

# Или выбрать конкретные инструменты
npm run setup-mcp -- --claude
npm run setup-mcp -- --cursor
npm run setup-mcp -- --windsurf
npm run setup-mcp -- --gemini
npm run setup-mcp -- --antigravity
npm run setup-mcp -- --opencode
npm run setup-mcp -- --codex

# Удалить из всех инструментов
npm run setup-mcp -- --remove
```

Перезапустите AI-инструмент после регистрации.

## Инструменты

| Инструмент | Описание |
|------------|----------|
| `navigate` | Открыть URL (новая вкладка или текущая) |
| `snapshot` | Снять дерево доступности с рефами элементов (`@e1`, `@e2`...) |
| `screenshot` | Сделать скриншот в формате PNG |
| `click` | Кликнуть элемент по CSS-селектору или `@e` рефу |
| `fill` | Заполнить поле формы по CSS-селектору или `@e` рефу |
| `hover` | Навести курсор на элемент (вызывает mouseover/mouseenter) |
| `select` | Выбрать опцию в выпадающем списке `<select>` |
| `scroll` | Прокрутить страницу или элемент (вниз/вверх/наверх/вниз) |
| `get_text` | Извлечь текстовое содержимое страницы или элемента |
| `key_type` | Ввести текст в активный элемент |
| `send_keys` | Отправить комбинацию клавиш (Enter, Ctrl+A, Tab и т.д.) |
| `drag_drop` | Перетащить элемент и бросить на другой |
| `wait` | Дождаться селектора, навигации или простоя сети |
| `evaluate` | Выполнить JavaScript на странице |
| `list_tabs` | Показать все открытые вкладки |
| `find_tab` | Найти вкладку по шаблону URL |
| `close_tab` | Закрыть вкладку по ID |
| `mouse_click` | Физический клик мышью через CDP |
| `network` | Захватить/показать/инспектировать HTTP-запросы |
| `intercept` | Блокировать, перенаправлять, изменять или подменять HTTP-запросы |
| `cookie` | Получить, установить или удалить cookies |
| `history` | Назад, вперёд или обновить страницу |
| `viewport` | Изменить размер viewport и device scale factor |
| `console` | Захватить и прочитать вывод консоли браузера |
| `dialog` | Обработать JS-диалоги (alert, confirm, prompt) |
| `emulate` | Эмулировать мобильное устройство, геолокацию, user agent |
| `session` | Сохранить и восстановить состояние сессии браузера |
| `speech_to_text` | Распознать речь из видео/аудио через локальный Whisper (офлайн, без API-ключа). Опциональный авто-перевод |
| `translate` | Перевести текст офлайн через argos-translate (без API-ключа) |

## Распознавание речи (Local Whisper)

Распознаёт речь из видео и аудио с любого сайта **офлайн** — API-ключ не нужен.

**Поддерживаемые платформы:** YouTube, X/Twitter, TikTok, Instagram, Vimeo и 100+ сайтов через `yt-dlp`.

### Установка

```bash
# 1. Python-зависимости
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install faster-whisper flask

# 2. Системные зависимости (macOS)
brew install ffmpeg yt-dlp

# Linux
# sudo apt install ffmpeg yt-dlp
```

### Запуск сервера Whisper

```bash
# Терминал 1: Запуск демона
npm start

# Терминал 2: Запуск локального Whisper
python whisper-server.py

# Или с конкретной моделью
WHISPER_MODEL=small python whisper-server.py
```

Сервер работает на `http://127.0.0.1:5001` по умолчанию.

### Использование

```bash
# Открыть страницу с видео
navigate url: "https://x.com/username/status/1234567890"

# Распознать речь
speech_to_text tabId: <tab_id> language: "ru"
```

**Параметры:**
- `tabId` — Вкладка с видео (опционально, автоопределение активной)
- `videoUrl` — Прямая ссылка на видео (опционально, автоопределение со страницы)
- `language` — Код языка для распознавания (например `"en"`, `"ru"`, `"zh"`)

**Доступные модели:** `tiny`, `base` (по умолчанию), `small`, `medium`, `large` — чем больше, тем точнее, но медленнее.

**Производительность на M1 Mac:**
- Модель `base`: ~70с для 25мин аудио
- Модель `small`: ~2мин для 25мин аудио (рекомендуется)

### Авто-перевод

Добавьте параметр `translateTo` для автоматического перевода транскрипции:

```bash
speech_to_text tabId: <tab_id> language: "en" translateTo: "ru"
```

Или используйте standalone инструмент `translate` для любого текста:

```bash
translate text: "Hello world" from: "en" to: "ru"
```

**Поддерживаемые языковые пары:** Любые пары, поддерживаемые argos-translate (часто: en↔ru, en↔zh, en↔es, en↔fr, en↔de и др.)

## REPL демона

У демона есть встроенный REPL для быстрого тестирования:

```
openweb> navigate https://example.com
openweb> snapshot
openweb> click a
openweb> screenshot
openweb> evaluate document.title
openweb> help
openweb> quit
```

## MCP-сервер

MCP-сервер подключается к демону через WebSocket и предоставляет все инструменты через Model Context Protocol.

**Режимы транспорта:**

```bash
# stdio (по умолчанию) — для Claude Desktop, Cursor, Windsurf
node mcp-server.js

# SSE — для HTTP-клиентов
node mcp-server.js --transport sse --port 3001
```

**Свой URL демона:**

```bash
WEBBRIDGE_WS_URL=ws://192.168.1.100:10086/ws node mcp-server.js
```

## Безопасность

- **Аутентификация:** установите `WEBBRIDGE_TOKEN` для защиты контроллерных подключений (Bearer token)
- При включённом токене демон отклоняет незащищённые `ws://` подключения — используйте `wss://`
- SSE-транспорт также требует Bearer-токен в заголовке `Authorization`
- Сравнение токенов использует `crypto.timingSafeEqual` для защиты от timing-атак

## Структура проекта

```
openweb/
├── manifest.json          # Манифест расширения Chrome
├── background.js          # Точка входа service worker
├── daemon.js              # WebSocket-демон + REPL
├── mcp-server.js          # MCP-сервер (stdio/SSE)
├── whisper-server.py      # Локальный Whisper-сервер для распознавания речи
├── setup-mcp.js           # Скрипт регистрации MCP
├── package.json
├── _locales/              # Локализация (en, ru, zh_CN)
├── icon/                  # Иконки расширения
├── popup/                 # UI всплывающего окна
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── lib/                   # Общие библиотеки
│   ├── cdp.js             # Менеджер Chrome DevTools Protocol
│   ├── ws-client.js       # WebSocket-клиент (сторона расширения)
│   ├── tab-manager.js     # Отслеживание и группировка вкладок
│   ├── snapshot-refs.js   # Система рефов дерева доступности
│   ├── i18n.js            # Runtime-модуль интернационализации
│   └── match-pattern.js   # Парсер шаблонов URL
└── tools/                 # Инструменты автоматизации браузера
    ├── registry.js        # Реестр и диспетчер инструментов
    ├── navigate.js
    ├── click.js
    ├── fill.js
    ├── hover.js
    ├── select.js
    ├── scroll.js
    ├── get-text.js
    ├── snapshot.js
    ├── screenshot.js
    ├── evaluate.js
    ├── key-type.js
    ├── send-keys.js
    ├── mouse-click.js
    ├── drag-drop.js
    ├── wait.js
    ├── list-tabs.js
    ├── find-tab.js
    ├── close-tab.js
    ├── network.js
    ├── intercept.js
    ├── cookie.js
    ├── history.js
    ├── viewport.js
    ├── console.js
    ├── dialog.js
    ├── emulate.js
    ├── session.js
    ├── save-as-pdf.js
    ├── upload.js
    └── close-session.js
```

## Лицензия

MIT
