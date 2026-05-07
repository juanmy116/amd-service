'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useCounter } from '@/lib/hooks';

function formatNumber(n: number) {
  if (n >= 1000) return n.toLocaleString('fr-FR').replace(/ /, '.');
  return String(n);
}

const STATS = [
  { value: 10,   suffix: '+', label: "Années d'expérience" },
  { value: 1200, suffix: '+', label: 'Équipements en location' },
  { value: 2600, suffix: '+', label: 'Machines au Sénégal' },
];

export default function HomeStats() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const reduced = useReducedMotion();

  const c0 = useCounter(STATS[0].value, 1200, inView && !reduced);
  const c1 = useCounter(STATS[1].value, 1600, inView && !reduced);
  const c2 = useCounter(STATS[2].value, 1800, inView && !reduced);
  const counts = [c0, c1, c2];

  return (
    <div
      ref={ref}
      className="grid grid-cols-1 md:grid-cols-3 gap-px"
      style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
    >
      {STATS.map(({ value, suffix, label }, i) => (
        <motion.div
          key={label}
          className="flex flex-col items-center justify-center py-14 px-8 text-center"
          style={{ backgroundColor: '#BF0D0D' }}
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{
            duration: reduced ? 0 : 0.55,
            delay: reduced ? 0 : i * 0.18,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
        >
          <div
            className="text-5xl font-bold mb-2"
            style={{ fontFamily: 'Poppins, sans-serif', color: '#FFFFFF' }}
          >
            {formatNumber(reduced ? value : counts[i])}{suffix}
          </div>
          <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.75)' }}>
            {label}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
