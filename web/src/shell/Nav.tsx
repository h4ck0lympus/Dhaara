import { Link, useRouterState } from '@tanstack/react-router';
import { useState, type JSX } from 'react';
import { Icon, type IconName } from '../ui/Icon';
import { openDialog } from './dialogs';

export const SIDEBAR_KEY = 'dhara-sidebar-collapsed';
const LEGACY_SIDEBAR_KEY = 'noema-sidebar-collapsed';   // rename-shim: read until the next toggle writes the new key

type Item = { to: '/overview' | '/capture' | '/notes' | '/plan'; label: string; icon: IconName; prefix?: string };
const ITEMS: Item[] = [
  { to: '/overview', label: 'Overview', icon: 'home' },
  { to: '/capture', label: 'Capture', icon: 'pen' },
  { to: '/notes', label: 'Notes', icon: 'notes', prefix: '/note/' },
  { to: '/plan', label: 'Tasks', icon: 'task-check' },
];

function readCollapsed(): boolean {
  try { return (localStorage.getItem(SIDEBAR_KEY) ?? localStorage.getItem(LEGACY_SIDEBAR_KEY)) === '1'; } catch { return false; }
}

export function Nav(): JSX.Element {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const [collapsed, setCollapsed] = useState(readCollapsed);
  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0'); } catch { /* remembered for this page only */ }
  }
  return (
    <aside className="sidebar" data-collapsed={collapsed ? 'true' : 'false'}>
      <div className="brand">
        <span>Noema</span>
        <button type="button" className="icon-button collapse-toggle" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed} onClick={toggle}><Icon name="sidebar" /></button>
      </div>
      <nav aria-label="Main navigation">
        {ITEMS.map(item => {
          const active = pathname === item.to || (item.prefix !== undefined && pathname.startsWith(item.prefix));
          return (
            <Link key={item.to} to={item.to} className={active ? 'nav-item active' : 'nav-item'} aria-current={active ? 'page' : undefined}>
              <Icon name={item.icon} /><span className="nav-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        <button type="button" className="nav-item" onClick={() => openDialog({ kind: 'settings' })}>
          <Icon name="settings" /><span className="nav-label">Settings</span>
        </button>
      </div>
    </aside>
  );
}
