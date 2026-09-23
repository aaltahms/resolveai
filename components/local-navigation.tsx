'use client';
import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const getLocal = () =>
  ['127.0.0.1', 'localhost'].includes(window.location.hostname);
const getServerLocal = () => false;

export function LocalNavigation({
  current,
}: {
  current: 'desk' | 'procedures';
}) {
  const local = useSyncExternalStore(subscribe, getLocal, getServerLocal);
  if (!local) return null;
  const items = [
    ['checks', 'http://resolveai.localhost:4318/', 'Mac checks'],
    ['procedures', '/troubleshoot', 'Guided procedures'],
    ['desk', '/', 'Incident desk'],
    ['lab', 'http://resolveai.localhost:4318/lab', 'Repair lab'],
    ['help', 'http://resolveai.localhost:4318/guide', 'How to use'],
  ];
  return (
    <nav
      aria-label="ResolveAI sections"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        padding: '18px 24px',
        background: '#fff',
        borderBottom: '1px solid #dce5ec',
      }}
    >
      {items.map(([id, href, label]) => (
        <a
          key={id}
          href={href}
          aria-current={id === current ? 'page' : undefined}
          style={{
            padding: '9px 14px',
            borderRadius: 8,
            color: id === current ? '#194dab' : '#405971',
            background: id === current ? '#edf3ff' : 'transparent',
            fontSize: 14,
            fontWeight: 650,
            textDecoration: 'none',
          }}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
