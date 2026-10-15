import { Link, useRouterState } from '@tanstack/react-router';
import type { JSX } from 'react';

type Item = { to: '/overview' | '/notes' | '/plan'; label: string; match(path: string): boolean };
const ITEMS: Item[] = [
  { to: '/overview', label: 'Home', match: path => path === '/overview' || path === '/capture' },
  { to: '/notes', label: 'Notes', match: path => path === '/notes' || path.startsWith('/note/') },
  { to: '/plan', label: 'Tasks', match: path => path === '/plan' || path.startsWith('/task/') },
];

export function Nav(): JSX.Element {
  const pathname = useRouterState({ select: state => state.location.pathname });
  return (
    <nav className="main-nav" aria-label="Main navigation">
      {ITEMS.map(item => {
        const active = item.match(pathname);
        return <Link key={item.to} to={item.to} className={active ? 'nav-item active' : 'nav-item'} aria-current={active ? 'page' : undefined}>{item.label}</Link>;
      })}
    </nav>
  );
}
