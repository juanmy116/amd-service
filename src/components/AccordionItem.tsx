'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function AccordionItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const slug = q.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const panelId = `faq-panel-${slug}`;
  const buttonId = `faq-btn-${slug}`;

  return (
    <div className="border-b" style={{ borderColor: '#E5E7EB' }}>
      <button
        id={buttonId}
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-0 py-5 text-left transition-colors duration-150 cursor-pointer"
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="font-medium pr-8" style={{ color: '#111827' }}>{q}</span>
        <ChevronDown
          className="w-4 h-4 flex-shrink-0 transition-transform duration-200"
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            color: open ? '#BF0D0D' : '#9CA3AF',
          }}
        />
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows 200ms ease-out',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <p className="pb-5 text-sm leading-relaxed" style={{ color: '#6B7280' }}>{a}</p>
        </div>
      </div>
    </div>
  );
}
