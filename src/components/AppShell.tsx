"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Boxes,
  FileText,
  TriangleAlert,
  Upload,
  Plug,
  GitBranch,
  ScrollText,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { dictionary, type Locale } from "@/i18n/locales";
import { useUiText } from "@/i18n/ui-client";
const items = [
  ["/operations", "operations", Activity],
  ["/shipments", "shipments", Boxes],
  ["/documents", "documents", FileText],
  ["/exceptions", "exceptions", TriangleAlert],
  ["/imports", "imports", Upload],
  ["/integrations", "integrations", Plug],
  ["/mappings", "mappings", GitBranch],
  ["/audit", "audit", ScrollText],
  ["/settings", "settings", Settings],
] as const;
export function AppShell({
  children,
  user,
  locale,
  mode,
}: {
  children: React.ReactNode;
  user: { name: string; role: string; organization: string };
  locale: Locale;
  mode: string;
}) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const t = dictionary(locale);
  const ui = useUiText();
  const visibleItems = items.filter(([href]) =>
    href === "/settings"
      ? ["OWNER", "ADMIN"].includes(user.role)
      : ["/imports", "/mappings"].includes(href)
        ? ["OWNER", "ADMIN", "OPERATIONS"].includes(user.role)
        : href === "/audit"
          ? ["OWNER", "ADMIN", "OPERATIONS", "ACCOUNTING"].includes(user.role)
          : true,
  );
  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  async function setLocale(value: string) {
    await fetch("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: value }),
    });
    window.location.reload();
  }
  return (
    <div className="app-frame">
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <Link
            href="/operations"
            className="brand"
            onClick={() => setOpen(false)}
          >
            <span className="brand-mark">O</span>
            <span>OtpremaOps</span>
          </Link>
          <button
            className="icon-button mobile-only"
            onClick={() => setOpen(false)}
            aria-label={ui("Close menu")}
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-label">{ui("RADNI PROSTOR")}</div>
        <nav aria-label={ui("Primary navigation")}>
          {visibleItems.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`nav-link ${path === href || path.startsWith(href + "/") ? "active" : ""}`}
            >
              <Icon size={16} strokeWidth={1.8} />
              <span>{t[label]}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="org-name">{user.organization}</div>
          <div className="user-row">
            <span className="avatar">{user.name.slice(0, 1)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{ui(user.role)}</small>
            </div>
            <button
              className="icon-button"
              aria-label={t.signOut}
              title={t.signOut}
              onClick={signOut}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-frame">
        <header className="topbar">
          <button
            className="icon-button mobile-only"
            onClick={() => setOpen(true)}
            aria-label={ui("Open menu")}
          >
            <Menu size={19} />
          </button>
          <div className="topbar-context">
            {user.organization} <span>/</span> {ui("Operativni sistem")}
          </div>
          <div className="topbar-right">
            <span className="mode-badge">
              {mode === "mock" ? ui("DEMO / MOCK") : mode.toUpperCase()}
            </span>
            <select
              aria-label={ui("Language")}
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
              className="locale-select"
            >
              <option value="sr-Latn">SR</option>
              <option value="en">EN</option>
              <option value="ru">RU</option>
            </select>
          </div>
        </header>
        <main className="main-content">{children}</main>
      </div>
      {open && (
        <button
          className="sidebar-backdrop"
          onClick={() => setOpen(false)}
          aria-label={ui("Close menu")}
        />
      )}
    </div>
  );
}
