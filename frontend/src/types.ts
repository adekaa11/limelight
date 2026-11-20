// Тип Day по контракту: docs/api-contract.md. Менять только по договорённости всей команды.

export type Technique = "monet" | "kandinsky" | "film" | "collage" | "japanese";
export type Mode = "major" | "minor";

export interface SongAnalysis {
  bpm: number;
  mode: Mode;
  energy: number; // 0..1
  valence: number; // 0..1
  genre: string | null;
  year: number | null;
  beats: number[]; // сек
  sections: number[]; // сек
}

export interface Song {
  title: string | null;
  artist: string | null;
  source_url: string | null;
  preview_url: string | null;
  analysis: SongAnalysis;
}

export interface TextAnalysis {
  mood: string;
  energy: number;
  valence: number;
  season: string | null;
  time_of_day: string | null;
  places: string[];
  people: string[];
  details: string[];
}

export interface PhotoAnalysis {
  dominant_colors: string[];
  brightness: number;
  warmth: number;
}

export interface Style {
  technique: Technique;
  palette: string[]; // 5 цветов, [0] = фон
  grain: number;
  beat_step: 1 | 2 | 4;
  motion: number;
  density: number;
  font_weight: number;
  caption: string;
}

export interface Voice {
  name: string;
  rate: string;
  pitch: string;
  url: string | null;
}

export interface Day {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  text: string;
  photos: string[];
  song: Song | null;
  text_analysis: TextAnalysis;
  photo_analysis: PhotoAnalysis[];
  style: Style;
  voice: Voice;
  explanation: string[];
  // дополнения (необязательные)
  folder?: string;
  video_url?: string | null;
  created_at?: string;
  meta?: { llm: "gemini" | "groq" | "fallback" | "mock"; song_source: string };
}

export interface NewDayInput {
  text: string;
  photos: File[];
  song_url?: string;
  song_file?: File | null;
  date?: string;
}

export interface StylePreviewIn {
  text_analysis: TextAnalysis;
  photo_analysis?: PhotoAnalysis[];
  song_analysis?: SongAnalysis | null;
  caption?: string;
}

export interface StylePreviewOut {
  style: Style;
  voice: Voice;
  explanation: string[];
}

export const TECHNIQUES: { id: Technique; name: string; ref: string; when: string }[] = [
  { id: "monet", name: "Моне", ref: "импрессионизм, мазки и свет", when: "спокойно, тепло, медленный мажор" },
  { id: "kandinsky", name: "Кандинский", ref: "геометрия, жёсткая сетка", when: "напряжение, работа, быстрая электроника" },
  { id: "film", name: "Плёнка", ref: "зерно, засветы, выцветание", when: "ностальгия, старые песни, минор" },
  { id: "collage", name: "Коллаж", ref: "вырезки Матисса", when: "радость, много людей, энергичный мажор" },
  { id: "japanese", name: "Ма", ref: "японский минимализм, пустота", when: "тишина, одиночество, дождь, медленный минор" },
];

export const techniqueName = (t: Technique) => TECHNIQUES.find((x) => x.id === t)?.name ?? t;
