import { NavLink } from 'react-router-dom';
import { useUiStore } from '../../store/uiStore';

const navItems = [
  { to: '/',           label: 'Dashboard',   icon: '⊞', exact: true },
  { to: '/swap',       label: 'Swap',         icon: '⇌' },
  { to: '/lend',       label: 'Lend / Earn',  icon: '%' },
  { to: '/trigger',    label: 'Limit Orders', icon: '⊕' },
  { to: '/recurring',  label: 'DCA',          icon: '↺' },
  { to: '/portfolio',  label: 'Portfolio',    icon: '◎' },
  { to: '/send',       label: 'Send',         icon: '➤' },
  { to: '/history',    label: 'History',      icon: '◷' },
  { to: '/settings',   label: 'Settings',     icon: '⚙' },
];

export function Sidebar() {
  const collapsed   = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <aside
      className={`flex flex-col h-full bg-surface border-r border-border transition-all duration-200 shrink-0 ${
        collapsed ? 'w-14' : 'w-52'
      }`}
    >
      {/* Logo + hamburger */}
      <div className="flex items-center gap-2 px-3 border-b border-border h-14 shrink-0">
        {/* Hamburger toggle */}
        <button
          onClick={toggleSidebar}
          className="text-text-dim hover:text-text transition-colors p-1.5 rounded-md hover:bg-surface-2 shrink-0"
          aria-label="Toggle sidebar"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Brand */}
        <span className="text-green font-bold text-lg shrink-0">⚡</span>
        {!collapsed && (
          <span className="text-text font-bold text-sm tracking-wide truncate">SupaSOL</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {navItems.map(({ to, label, icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
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

      {/* Footer */}
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
    </aside>
  );
}
