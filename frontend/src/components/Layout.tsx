import { NavLink, Outlet } from "react-router-dom";
import { USE_MOCK, warmUp } from "../api";
import { useEffect } from "react";
import ServerBanner from "./ServerBanner";
import { useTheme } from "../lib/theme";

const links = [
  { to: "/", label: "Архив" },
  { to: "/year", label: "Год в цветах" },
  { to: "/lab", label: "Лаборатория" },
  { to: "/rules", label: "Как это работает" },
];

/** Выключатель света: в тёмной комнате лампа погашена, на свету — горит. */
function LightSwitch() {
  const { theme, toggle } = useTheme();
  const label = theme === "dark" ? "Включить свет" : "Выключить свет";
  return (
    <button
      onClick={toggle}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-muted transition hover:border-text/50 hover:text-text"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {/* лампа фотолаборатории: колпак и шнур */}
        <path d="M12 2v4" />
        <path d="M5 14a7 7 0 0 1 14 0z" fill={theme === "light" ? "currentColor" : "none"} />
        <path d="M10 17.5a2 2 0 0 0 4 0" />
        {theme === "light" && <path d="M5 20l-1.5 1.5M19 20l1.5 1.5M12 21v1.5" />}
      </svg>
    </button>
  );
}

export default function Layout() {
  // будим Render сразу при входе: пока человек смотрит архив или пишет о дне, сервер успеет проснуться
  useEffect(() => void warmUp(), []);
  const navCls = (active: boolean, base: string) => `${base} ${active ? "text-safelight" : "text-muted hover:text-text"}`;
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-room/95">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:gap-3">
          <NavLink to="/" className="mr-auto font-serif text-2xl font-semibold tracking-tight">
            LimeLight
            {USE_MOCK && <span className="ml-2 align-middle font-sans text-[11px] font-normal uppercase tracking-widest text-muted">демо</span>}
          </NavLink>
          <nav className="hidden gap-1 md:flex">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end className={({ isActive }) => navCls(isActive, "rounded-full px-3 py-1.5 text-sm transition")}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <LightSwitch />
          <NavLink to="/new" className="btn-primary">
            + Записать день
          </NavLink>
        </div>
        <nav className="flex justify-center border-t border-line/50 py-1.5 md:hidden">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end className={({ isActive }) => navCls(isActive, "whitespace-nowrap rounded-full px-1.5 py-1 text-xs")}>
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
