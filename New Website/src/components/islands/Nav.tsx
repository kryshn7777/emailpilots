import { useState } from 'react';

const LINKS = [
  { href: '/features', label: 'Flight manual' },
  { href: '/pricing', label: 'Boarding pass' },
  { href: '/download', label: 'Download' },
];

export default function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <nav aria-label="Main">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'none',
          border: '1px solid color-mix(in srgb, currentColor 25%, transparent)',
          borderRadius: '999px',
          color: 'inherit',
          font: 'inherit',
          padding: '0.4rem 1rem',
          cursor: 'pointer',
        }}
      >
        Menu
      </button>
      {open && (
        <ul
          style={{
            listStyle: 'none',
            margin: '0.5rem 0 0',
            padding: '0.5rem 1rem',
            position: 'absolute',
            right: 'clamp(1rem, 4vw, 3rem)',
            background: 'rgba(5, 7, 15, 0.85)',
            borderRadius: '0.75rem',
            backdropFilter: 'blur(8px)',
          }}
        >
          {LINKS.map((l) => (
            <li key={l.href} style={{ padding: '0.35rem 0' }}>
              <a href={l.href} style={{ color: 'inherit', textDecoration: 'none' }}>
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
