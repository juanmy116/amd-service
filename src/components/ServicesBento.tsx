'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { Printer, ShoppingCart, BarChart3, Wrench } from 'lucide-react';
import { SERVICES } from '@/lib/constants';

const CARDS = [
  { Icon: Printer,      index: 0, href: '/services' },
  { Icon: ShoppingCart, index: 1, href: '/services' },
  { Icon: BarChart3,    index: 2, href: '/services' },
  { Icon: Wrench,       index: 3, href: '/services' },
];

function ServiceCard({
  card,
  animDelay,
  theme = 'dark',
}: {
  card: typeof CARDS[number];
  animDelay: number;
  theme?: 'dark' | 'light';
}) {
  const { Icon, index, href } = card;
  const reduced = useReducedMotion();
  const service = SERVICES[index];
  const isLight = theme === 'light';

  return (
    <motion.div
      className="group relative flex flex-col p-8 border cursor-default transition-colors duration-200"
      style={{
        backgroundColor: isLight ? '#FFFFFF' : '#111827',
        borderColor: isLight ? '#E5E7EB' : '#1E2D45',
      }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.4, delay: reduced ? 0 : animDelay }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.backgroundColor = isLight ? '#FAFAFA' : '#172033';
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(191,13,13,0.35)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.backgroundColor = isLight ? '#FFFFFF' : '#111827';
        (e.currentTarget as HTMLElement).style.borderColor = isLight ? '#E5E7EB' : '#1E2D45';
      }}
    >
      {/* Icono */}
      <div
        className="w-12 h-12 flex items-center justify-center mb-6 border"
        style={{
          backgroundColor: isLight ? 'rgba(191,13,13,0.06)' : 'rgba(191,13,13,0.10)',
          borderColor: isLight ? 'rgba(191,13,13,0.15)' : '#BF0D0D',
        }}
      >
        <Icon className="w-5 h-5" style={{ color: '#BF0D0D' }} />
      </div>

      {/* Título */}
      <h3
        className="text-lg font-bold mb-3"
        style={{ color: isLight ? '#111827' : '#F1F5F9' }}
      >
        {service.title_fr}
      </h3>

      {/* Descripción */}
      <p
        className="text-sm leading-relaxed flex-1"
        style={{ color: isLight ? '#6B7280' : '#94A3B8' }}
      >
        {service.description_fr}
      </p>

      {/* CTA */}
      <div className="mt-6 pt-5 border-t" style={{ borderColor: isLight ? '#F3F4F6' : '#1E2D45' }}>
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 text-sm font-semibold transition-opacity duration-150 hover:opacity-70 cursor-pointer"
          style={{ color: '#BF0D0D' }}
        >
          En savoir plus
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </motion.div>
  );
}

export default function ServicesBento({ theme = 'dark' }: { theme?: 'dark' | 'light' }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <div ref={ref}>
      {inView && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px" style={{ backgroundColor: theme === 'light' ? '#E5E7EB' : '#1E2D45' }}>
          {CARDS.map((card, i) => (
            <ServiceCard key={card.index} card={card} animDelay={i * 0.08} theme={theme} />
          ))}
        </div>
      )}
    </div>
  );
}
