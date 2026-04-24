import { NavLink } from 'react-router-dom';
import { useUiStore } from '../../store/uiStore';

const navItems = [
  { to: '/',           label: 'Dashboard',   icon: '⊞', exact: true },
  { to: '/trending',   label: 'Trending',     icon: '🔥' },
  { to: '/bot',        label: 'Auto Trader',  icon: '⚡' },
  { to: '/swap',       label: 'Swap',         icon: '⇌' },
  { to: '/lend',       label: 'Lend / Earn',  icon: '%' },
  { to: '/trigger',    label: 'Limit Orders', icon: '⊕' },
  { to: '/recurring',  label: 'DCA',          icon: '↺' },
  { to: '/portfolio',  label: 'Portfolio',    icon: '◎' },
  { to: '/liquidity',  label: 'DLMM',         icon: '◈' },
  { to: '/perps',      label: 'Perps',        icon: '↕' },
  { to: '/send',       label: 'Send',         icon: '➤' },
  { to: '/history',    label: 'History',      icon: '◷' },
  { to: '/notis',      label: 'Notis',        icon: '🔔' },
  { to: '/settings',   label: 'Settings',     icon: '⚙' },
];

function NavItems({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 py-2 overflow-y-auto">
      {navItems.map(({ to, label, icon, exact }) => (
        <NavLink
          key={to}
          to={to}
          end={exact}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
              isActive
                ? 'text-green bg-green/10 border-r-2 border-green'
                : 'text-text-dim hover:text-text hover:bg-surface-2'
            }`
          }
        >
          <span className="text-base w-5 text-center shrink-0">{icon}</span>
          {!collapsed && <span className="truncate">{label}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="p-3 border-t border-border">
      <a
        href="https://portal.jup.ag"
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-2 text-xs text-text-dim hover:text-text transition-colors ${
          collapsed ? 'justify-center' : ''
        }`}
      >
        <span>🪐</span>
        {!collapsed && <span>Jupiter Portal</span>}
      </a>
    </div>
  );
}

export function Sidebar() {
  const collapsed         = useUiStore((s) => s.sidebarCollapsed);
  const mobileSidebarOpen = useUiStore((s) => s.mobileSidebarOpen);
  const toggleSidebar     = useUiStore((s) => s.toggleSidebar);
  const closeMobileSidebar = useUiStore((s) => s.closeMobileSidebar);

  return (
    <>
      {/* ── Desktop sidebar (md+) ─────────────────────────────── */}
      <aside
        className={`hidden md:flex flex-col h-full bg-surface border-r border-border transition-all duration-200 shrink-0 ${
          collapsed ? 'w-14' : 'w-52'
        }`}
      >
        {/* Logo + hamburger */}
        <div className="flex items-center gap-2 px-3 border-b border-border h-14 shrink-0">
          <button
            onClick={toggleSidebar}
            className="text-text-dim hover:text-text transition-colors p-1.5 rounded-md hover:bg-surface-2 shrink-0"
            aria-label="Toggle sidebar"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-green font-bold text-lg shrink-0">⚡</span>
          {!collapsed && (
            <span className="text-text font-bold text-sm tracking-wide truncate">SupaSOL</span>
          )}
        </div>

        <NavItems collapsed={collapsed} />
        <SidebarFooter collapsed={collapsed} />
      </aside>

      {/* ── Mobile overlay sidebar (below md) ─────────────────── */}
      <>
        {/* Backdrop */}
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={closeMobileSidebar}
          />
        )}

        {/* Slide-in panel */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-64 flex flex-col bg-surface border-r border-border transition-transform duration-200 md:hidden ${
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Logo + close */}
          <div className="flex items-center justify-between px-4 border-b border-border h-14 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-green font-bold text-lg">⚡</span>
              <span className="text-text font-bold text-sm tracking-wide">SupaSOL</span>
            </div>
            <button
              onClick={closeMobileSidebar}
              className="text-text-dim hover:text-text transition-colors p-1.5 rounded-md hover:bg-surface-2"
              aria-label="Close menu"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <NavItems collapsed={false} onNavigate={closeMobileSidebar} />
          <SidebarFooter collapsed={false} />
        </aside>
      </>
    </>
  );
}
