# Sevensave

Лаунчер для своих игр: библиотека, установка, обновление и запуск в одну кнопку. Сейчас в каталоге Ривер и Намёк.

## Как устроено

- `catalog/catalog.json` — список игр (схема в `src/shared/catalog.ts`) и арт в `catalog/assets/<id>/`. Копия вшита в сборку; свежая подтягивается с `raw.githubusercontent.com/vldvr/sevensave/main/catalog/`, так что новая игра появляется без релиза лаунчера.
- Сборки игр берутся из последнего релиза их репозитория (`releases/latest`, с ETag). Ставится zip по шаблону из каталога: на Mac `<Name>-<v>-mac-<arch>.zip`, на Windows `<Name>-<v>-win-x64.zip`. Если zip для системы нет, на кнопке «Скоро».
- Установка: загрузка в `<библиотека>/.sevensave-staging`, проверка размера, распаковка (`ditto` + `codesign --verify --deep` на Mac, `extract-zip` на Windows), затем замена папки игры переименованием с откатом. Отмена и обрыв не трогают установленную версию.
- Игра запускается с `SEVENSAVE_LAUNCHER=1`: сама она тогда не обновляется. Пока процесс жив — «Запущено», время в игре пишется в `installed.json` раз в минуту и при выходе.
- Данные: `installed.json`, `settings.json`, `releases.json` в папке данных приложения.
- Самообновление: Windows — electron-updater (NSIS), Mac — скачивание zip и подмена `.app` при выходе.

## Разработка

```bash
npm install
npm run dev         # лаунчер
npm test            # схема каталога, выбор сборки, версии, загрузка и замена с откатом
npm run typecheck
npm run art         # перерисовать обложки, hero и иконку из tools/art/*.html
npm run pack:mac    # release/Sevensave.app, dmg и zip
```

`site/` — статический лендинг, публикуется на GitHub Pages (`.github/workflows/pages.yml`). Ссылки на скачивание ведут на постоянные имена `releases/latest/download/Sevensave-Setup.exe` и `Sevensave-mac-<arch>.dmg`.

Новая игра: zip-цели в её `electron-builder.yml`, проверка `SEVENSAVE_LAUNCHER` в её самообновлении, запись в `catalog/catalog.json` и арт в `catalog/assets/<id>/`.
