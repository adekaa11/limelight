import { NavLink, Outlet } from "react-router-dom";
import { USE_MOCK, warmUp } from "../api";
import { useEffect } from "react";
import ServerBanner from "./ServerBanner";

const links = [
  { to: "/", label: "Архив" },
  { to: "/year", label: "Год в цветах" },
  { to: "/lab", label: "Лаборатория" },
];

export default function Layout() {
  // будим Render сразу при входе: пока человек смотрит архив или пишет о дне, сервер успеет проснуться
  useEffect(() => void warmUp(), []);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <NavLink to="/" className="mr-auto font-serif text-2xl font-semibold tracking-tight">
            Проявка
            {USE_MOCK && <span className="ml-2 align-middle font-sans text-[10px] font-normal uppercase tracking-widest text-muted">демо</span>}
          </NavLink>
          <nav className="hidden gap-1 sm:flex">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end className={({ isActive }) => `rounded-full px-3 py-1.5 text-sm ${isActive ? "bg-ink/5 text-ink" : "text-muted hover:text-ink"}`}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <NavLink to="/new" className="btn-primary">
            + Записать день
          </NavLink>
        </div>
        <nav className="flex justify-center gap-1 border-t border-line/50 py-1.5 sm:hidden">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end className={({ isActive }) => `rounded-full px-3 py-1 text-xs ${isActive ? "bg-ink/5 text-ink" : "text-muted"}`}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <ServerBanner />
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-6">
        <Outlet />
      </main>
    </div>
  );
}
