# Фронтенд (Дан + Алимжан)

React + Vite + TS + Tailwind. Роуты: `/` архив-книга, `/year` год в цветах, `/new` запись, `/day/:id` просмотр, `/lab` настройка техник.

- Тип `Day` и эндпоинты: [../docs/api-contract.md](../docs/api-contract.md)
- Моки: `src/mocks/days.json` (5 дней, все 5 техник, один день годичной давности для проверки старения). Сгенерированы из `backend/scripts/make_mocks.py`, то есть совпадают с реальными правилами бэка. Перегенерировать: `cd backend && python -m scripts.make_mocks`.
- `palette[0]` — фон страницы, `palette[1..4]` — акценты.
- `song.preview_url` указывает на наш Storage (с CORS), поэтому `createMediaElementSource` + AnalyserNode работают. На `<audio>` ставить `crossOrigin="anonymous"`.
- После экспорта видео: `PUT /api/days/{id}/memory` с `file` = webm.
- `/lab` может дёргать `POST /api/style` и показывать, как меняется стиль от ползунков.
