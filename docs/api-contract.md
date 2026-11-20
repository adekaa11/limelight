# Контракт API

Менять только по договорённости всей команды. Живая документация: `{API}/docs` (Swagger).

## Эндпоинты

| Метод | Путь | Вход | Выход |
|---|---|---|---|
| POST | `/api/days` | multipart: `text`, `photos` (несколько), `song_url?`, `song_file?`, `date?` (YYYY-MM-DD) | `Day` |
| GET | `/api/days` | | `Day[]`, новые сверху |
| GET | `/api/days/{id}` | | `Day` |
| GET | `/api/days/{id}/zip` | | zip папки дня |
| PUT | `/api/days/{id}/memory` | multipart: `file` (video/webm) | `Day` с `video_url` (*дополнение*) |
| POST | `/api/style` | JSON `{text_analysis, photo_analysis?, song_analysis?, caption?}` | `{style, voice, explanation}` для /lab (*дополнение*) |
| GET | `/api/health` | | `{ok, storage, llm}` |

Ошибки: `422` (текст короче 10 символов, кривая дата, больше 8 фото), `413` (файл > 20 МБ), `415` (не тот тип файла), `404`.

## Day

```ts
type Day = {
  id: string; date: string; title: string; text: string;
  photos: string[];
  song: null | {
    title: string | null; artist: string | null; source_url: string | null; preview_url: string | null;
    analysis: { bpm: number; mode: "major" | "minor"; energy: number; valence: number;
                genre: string | null; year: number | null; beats: number[]; sections: number[] };
  };
  text_analysis: { mood: string; energy: number; valence: number; season: string | null;
                   time_of_day: string | null; places: string[]; people: string[]; details: string[] };
  photo_analysis: { dominant_colors: string[]; brightness: number; warmth: number }[];
  style: { technique: "monet" | "kandinsky" | "film" | "collage" | "japanese"; palette: string[]; // 5, [0] = фон
           grain: number; beat_step: 1 | 2 | 4; motion: number; density: number; font_weight: number; caption: string };
  voice: { name: string; rate: string; pitch: string; url: string | null };
  explanation: string[];
  // дополнения (необязательные)
  folder?: string; video_url?: string | null; created_at?: string;
  meta?: { llm: "gemini" | "groq" | "fallback" | "mock"; song_source: string };
};
```

## Папка дня

Bucket `days`, путь `{date}_{slug-title}/` (при совпадении имени добавляется `-xxxx`):

```
2026-11-19_osenniy-park-i-kakao/
  text.txt
  photos/01.jpg, 02.jpg ...
  song.json
  song.mp3        # 30-сек превью или файл пользователя (для плеера и WebAudio)
  voice.mp3
  memory.webm     # после экспорта на фронте
  day.json        # «рецепт»: весь Day
```

## Модули анализа (Айкайнар)

Сигнатуры фиксированы, лежат в `backend/app/analyzers/`:

```python
analyze_song(song_url: str | None, file_path: str | None) -> dict
# ключи: title, artist, source_url, preview_url, bpm, mode, energy, valence, genre, year,
#        beats, sections, source ("deezer" | "file" | "fallback"), audio_path (локальный mp3, необязательно)
analyze_photos(paths: list[str]) -> list[dict]          # [{dominant_colors, brightness, warmth}]
synthesize_voice(text: str, voice_params: dict, out_path: str) -> str   # путь к mp3 или ""
```

Если `audio_path` вернулся, бэк загружает его в папку дня как `song.mp3` и подставляет `preview_url` на наш Storage.
