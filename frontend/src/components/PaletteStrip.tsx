export default function PaletteStrip({ palette, className = "h-2" }: { palette: string[]; className?: string }) {
  return (
    <div className={`flex overflow-hidden rounded-full ${className}`} aria-label="палитра дня">
      {palette.map((c, i) => (
        <span key={i} className="flex-1" style={{ background: c }} title={c} />
      ))}
    </div>
  );
}
