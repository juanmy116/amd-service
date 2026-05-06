'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { TrendingDown, Wrench, Zap, BarChart3, ShieldCheck, MapPin } from 'lucide-react';
import { BENEFITS } from '@/lib/constants';

const ICONS = [TrendingDown, Wrench, Zap, BarChart3, ShieldCheck, MapPin];

export default function BenefitsList() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const reduced = useReducedMotion();

  return (
    <div ref={ref} className="divide-y" style={{ borderColor: '#1E2D45' }}>
      {BENEFITS.map((benefit, i) => {
        const Icon = ICONS[i];
        const num = String(i + 1).padStart(2, '0');

        return (
          <motion.div
            key={benefit.title_fr}
            className="group flex items-start gap-6 py-6 cursor-default"
            initial={{ opacity: 0, x: -24 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{
              duration: reduced ? 0 : 0.45,
              delay: reduced ? 0 : i * 0.08,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
          >
            {/* Número */}
            <span
              className="text-xs font-bold tabular-nums select-none pt-0.5 w-6 shrink-0 transition-colors duration-200"
              style={{ color: 'rgba(191,13,13,0.5)', fontVariantNumeric: 'tabular-nums' }}
            >
              {num}
            </span>

            {/* Icono */}
            <div
              className="w-9 h-9 shrink-0 flex items-center justify-center border transition-colors duration-300"
              style={{ borderColor: '#1E2D45', backgroundColor: '#111827' }}
            >
              <Icon
                className="w-4 h-4 transition-colors duration-300"
                style={{ color: '#BF0D0D' }}
              />
            </div>

            {/* Texto */}
            <div className="flex-1 min-w-0">
              <h3
                className="font-semibold text-white mb-1 transition-colors duration-200 group-hover:text-red-100"
                style={{ fontSize: '0.9375rem' }}
              >
                {benefit.title_fr}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: '#64748B' }}>
                {benefit.description_fr}
              </p>
            </div>

            {/* Línea roja animada al hover */}
            <div
              className="self-stretch w-px shrink-0 origin-top scale-y-0 group-hover:scale-y-100 transition-transform duration-300"
              style={{ backgroundColor: '#BF0D0D' }}
            />
          </motion.div>
        );
      })}
    </div>
  );
}
