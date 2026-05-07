'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { Award, Printer, Monitor } from 'lucide-react';
import { SOCIAL_PROOF } from '@/lib/constants';
import { useCounter } from '@/lib/hooks';

const stats = [
  { numericValue: 10,   suffix: '+', label: SOCIAL_PROOF.description_fr,       icon: Award   },
  { numericValue: 1200, suffix: '+', label: SOCIAL_PROOF.equipments_label_fr,   icon: Printer },
  { numericValue: 2600, suffix: '+', label: SOCIAL_PROOF.machines_label_fr,     icon: Monitor },
];

function formatNumber(n: number) {
  if (n >= 1000) return n.toLocaleString('fr-FR').replace(' ', '.');
  return String(n);
}

export default function HeroStats({ theme = 'dark' }: { theme?: 'dark' | 'light' }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const reduced = useReducedMotion();

  const c0 = useCounter(stats[0].numericValue, 1200, inView && !reduced);
  const c1 = useCounter(stats[1].numericValue, 1600, inView && !reduced);
  const c2 = useCounter(stats[2].numericValue, 1800, inView && !reduced);
  const counts = [c0, c1, c2];

  const isLight = theme === 'light';

  return (
    <div
      ref={ref}
      className="flex flex-col gap-0 overflow-hidden"
      style={{
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        backgroundColor: isLight ? 'rgba(255,255,255,0.18)' : 'rgba(11,17,32,0.35)',
        border: isLight ? '1px solid rgba(255,255,255,0.35)' : '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {stats.map(({ numericValue, suffix, label, icon: Icon }, i) => (
        <motion.div
          key={label}
          className="flex items-center gap-5 p-6"
          style={{ borderBottom: i < 2 ? `1px solid ${isLight ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)'}` : 'none' }}
          initial={{ opacity: 0, x: 40 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{
            duration: reduced ? 0 : 0.55,
            delay: reduced ? 0 : i * 0.18,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
        >
          <Icon className="w-5 h-5 flex-shrink-0" style={{ color: isLight ? 'white' : '#BF0D0D' }} />
          <div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: 'Poppins, sans-serif' }}>
              {formatNumber(reduced ? numericValue : counts[i])}{suffix}
            </div>
            <div className="text-sm mt-0.5" style={{ color: isLight ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.65)' }}>
              {label}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
