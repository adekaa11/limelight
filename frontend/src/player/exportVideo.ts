/** Экспорт воспоминания: canvas.captureStream + аудио из WebAudio -> MediaRecorder -> .webm */
export function pickMime() {
  const list = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return list.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

export const canExport = () => typeof MediaRecorder !== "undefined" && !!pickMime() && "captureStream" in HTMLCanvasElement.prototype;

export function startRecording(canvas: HTMLCanvasElement, audio: MediaStream | null) {
  const stream = canvas.captureStream(30);
  audio?.getAudioTracks().forEach((t) => stream.addTrack(t));
  const mimeType = pickMime();
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_000_000, audioBitsPerSecond: 160_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<Blob>((res) => {
    rec.onstop = () => {
      stream.getVideoTracks().forEach((t) => t.stop());
      res(new Blob(chunks, { type: mimeType.split(";")[0] || "video/webm" }));
    };
  });
  rec.start(500);
  return { stop: () => rec.state !== "inactive" && rec.stop(), done };
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
