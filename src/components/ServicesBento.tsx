'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { Printer, ShoppingCart, BarChart3, Wrench, ArrowRight } from 'lucide-react';
import { SERVICES } from '@/lib/constants';

const CARDS = [
  { Icon: Printer,      index: 0, href: '/services' },
  { Icon: ShoppingCart, index: 1, href: '/services' },
  { Icon: BarChart3,    index: 2, href: '/services' },
  { Icon: Wrench,       index: 3, href: '/services' },
];

function BrandServiceCard({
  card,
  animDelay,
  inView,
}: {
  card: typeof CARDS[number];
  animDelay: number;
  inView: boolean;
}) {
  const { Icon, index, href } = card;
  const reduced = useReducedMotion();
  const service = SERVICES[index];

  return (
    <motion.div
      className="group relative flex flex-col overflow-hidden cursor-pointer"
      style={{ backgroundColor: '#BF0D0D' }}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: reduced ? 0 : 0.4, delay: reduced ? 0 : animDelay }}
    >
      {/* Background effects */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-white/10 opacity-40 group-hover:opacity-60 transition-opacity duration-500" />
        <div
          className={`absolute -bottom-20 -left-20 w-48 h-48 rounded-full bg-gradient-to-tr from-white/10 to-transparent blur-3xl opacity-30 group-hover:opacity-50 group-hover:scale-110 transition-all duration-700${reduced ? '' : ' animate-bounce'}`}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 translate-x-full group-hover:-translate-x-full transition-transform duration-1000" />
      </div>

      {/* Content */}
      <div className="relative z-10 p-8 flex flex-col items-center text-center flex-1">

        {/* Icon with rings */}
        <div className="relative mb-6 flex-shrink-0">
          {!reduced && (
            <>
              <div className="absolute inset-0 rounded-full border-2 border-white/25 animate-ping" />
              <div className="absolute inset-0 rounded-full border border-white/15 animate-pulse" />
            </>
          )}
          <div
            className="p-5 rounded-full border border-white/20 shadow-2xl"
            style={{ background: 'linear-gradient(135deg, rgba(154,10,10,0.9), rgba(100,6,6,0.8))' }}
          >
            <Icon className="w-8 h-8 text-white" />
          </div>
        </div>

        {/* Title */}
        <h3 className="mb-3 text-lg font-bold text-white group-hover:scale-105 transition-transform duration-300">
          {service.title_fr}
        </h3>

        {/* Description */}
        <p className="text-sm leading-relaxed flex-1 group-hover:text-white transition-colors duration-300" style={{ color: 'rgba(255,255,255,0.78)' }}>
          {service.description_fr}
        </p>

        {/* Animated line */}
        <div className={`mt-6 h-px bg-gradient-to-r from-transparent via-white to-transparent w-1/3 group-hover:w-1/2 transition-all duration-500${reduced ? '' : ' animate-pulse'}`} />

        {/* Bouncing dots */}
        <div className="flex gap-1.5 mt-4 opacity-50 group-hover:opacity-100 transition-opacity duration-300">
          <div className={`w-1.5 h-1.5 bg-white rounded-full${reduced ? '' : ' animate-bounce'}`} />
          <div className={`w-1.5 h-1.5 bg-white rounded-full${reduced ? '' : ' animate-bounce'}`} style={{ animationDelay: '0.1s' }} />
          <div className={`w-1.5 h-1.5 bg-white rounded-full${reduced ? '' : ' animate-bounce'}`} style={{ animationDelay: '0.2s' }} />
        </div>

        {/* CTA */}
        <Link
          href={href}
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold cursor-pointer transition-opacity duration-150 hover:opacity-70"
          style={{ color: 'rgba(255,255,255,0.85)' }}
        >
          En savoir plus <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Corner accents on hover */}
      <div className="absolute top-0 left-0 w-16 h-16 bg-gradient-to-br from-white/10 to-transparent rounded-br-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-16 h-16 bg-gradient-to-tl from-white/10 to-transparent rounded-tl-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
    </motion.div>
  );
}

function ServiceCard({
  card,
  animDelay,
  inView,
}: {
  card: typeof CARDS[number];
  animDelay: number;
  inView: boolean;
}) {
  const { Icon, index, href } = card;
  const reduced = useReducedMotion();
  const service = SERVICES[index];

  return (
    <motion.div
      className="group relative flex flex-col p-8 border cursor-default transition-colors duration-200"
      style={{ backgroundColor: '#111827', borderColor: '#1E2D45' }}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: reduced ? 0 : 0.4, delay: reduced ? 0 : animDelay }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.backgroundColor = '#172033';
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(191,13,13,0.35)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.backgroundColor = '#111827';
        (e.currentTarget as HTMLElement).style.borderColor = '#1E2D45';
      }}
    >
      <div
        className="w-12 h-12 flex items-center justify-center mb-6 border"
        style={{ backgroundColor: 'rgba(191,13,13,0.10)', borderColor: '#BF0D0D' }}
      >
        <Icon className="w-5 h-5" style={{ color: '#BF0D0D' }} />
      </div>
      <h3 className="text-lg font-bold mb-3" style={{ color: '#F1F5F9' }}>
        {service.title_fr}
      </h3>
      <p className="text-sm leading-relaxed flex-1" style={{ color: '#94A3B8' }}>
        {service.description_fr}
      </p>
      <div className="mt-6 pt-5 border-t" style={{ borderColor: '#1E2D45' }}>
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 text-sm font-semibold transition-opacity duration-150 hover:opacity-70 cursor-pointer"
          style={{ color: '#BF0D0D' }}
        >
          En savoir plus <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </motion.div>
  );
}

export default function ServicesBento({ theme = 'dark' }: { theme?: 'dark' | 'light' | 'brand' }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  const gapColor = theme === 'brand' ? '#9A0A0A' : theme === 'light' ? '#E5E7EB' : '#1E2D45';

  return (
    <div ref={ref}>
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px"
        style={{ backgroundColor: gapColor }}
      >
        {CARDS.map((card, i) =>
          theme === 'brand' ? (
            <BrandServiceCard key={card.index} card={card} animDelay={i * 0.08} inView={inView} />
          ) : (
            <ServiceCard key={card.index} card={card} animDelay={i * 0.08} inView={inView} />
          )
        )}
      </div>
    </div>
  );
}
