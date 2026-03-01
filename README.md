# Kaskad Project Admin

> Fork of [WinCC OA Project Admin](https://github.com/winccoa-tools-pack/vscode-winccoa-project-admin) by winccoa-tools-pack, adapted for Kaskad and OEM SCADA.

Управление проектами Kaskad и OEM SCADA в VS Code: список проектов, статус PMON, запуск/остановка менеджеров.

## Возможности

- Список проектов, переключение из status bar
- Старт/стоп проектов и менеджеров через PMON
- Статус менеджеров в реальном времени

## Настройки

| Настройка | Описание |
| --------- | -------- |
| `kaskadProjectAdmin.pvssInstConfPath` | Путь к pvssInst.conf (пусто = путь по умолчанию) |
| `kaskadProjectAdmin.installationPathBase` | Базовый путь установки (напр. `C:\Sybcom\Kaskad`) |
| `kaskadProjectAdmin.binPath` | Путь к bin (если нужен в PATH для pmon) |
| `kaskadProjectAdmin.pmonRunningExitCodes` | Коды выхода pmon -status для статуса «запущен» (по умолчанию `[0]`) |
| `kaskadProjectAdmin.logLevel` | Уровень логирования: `ERROR`, `WARN`, `INFO`, `DEBUG`, `TRACE` |

## Известные проблемы

- Переключение проектов может потребовать перезагрузки окна VS Code
- При смене версии проекта — возможны сбои
- Мультикорневые workspace — ограниченная поддержка
- Add Manager — может работать нестабильно

## Требования

- VS Code 1.105+
- Kaskad или OEM SCADA

## Лицензия

MIT. WinCC OA и Siemens — товарные знаки Siemens AG.
