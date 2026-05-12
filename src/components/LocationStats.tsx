'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion, motion } from 'framer-motion';

const STATS = [
  { numeric: 10,   prefix: '',  suffix: '+',  thousands: false, label: "Ans d'expérience" },
  { numeric: 1200, prefix: '',  suffix: '+',  thousands: true,  label: 'Équipements en location' },
  { numeric: 2600, prefix: '',  suffix: '+',  thousands: true,  label: 'Machines au Sénégal' },
  { numeric: 24,   prefix: '<', suffix: 'h',  thousands: false, label: "Délai d'intervention" },
];

function formatNumber(n: number, thousands: boolean): string {
  if (!thousands) return String(Math.round(n));
  const int = Math.floor(n / 1000);
  const dec = String(Math.round(n % 1000)).padStart(3, '0');
  return `${int}.${dec}`;
}

function Counter({
  numeric,
  prefix,
  suffix,
  thousands,
  active,
}: {
  numeric: number;
  prefix: string;
  suffix: string;
  thousands: boolean;
  active: boolean;
}) {
  const [count, setCount] = useState(0);
  const reduced = useReducedMotion();
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    if (reduced) { setCount(numeric); return; }

    const duration = 1600;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(eased * numeric);
      if (progress < 1) raf.current = requestAnimationFrame(tick);
    }

    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [active, numeric, reduced]);

  return (
    <span>
      {prefix}{formatNumber(count, thousands)}{suffix}
    </span>
  );
}

export default function LocationStats() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const reduced = useReducedMotion();

  return (
    <section style={{ backgroundColor: '#111827' }}>
      <div
        ref={ref}
        className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-px"
        style={{ backgroundColor: '#1E2D45' }}
      >
        {STATS.map(({ numeric, prefix, suffix, thousands, label }, i) => (
          <motion.div
            key={label}
            className="px-8 py-12 text-center"
            style={{ backgroundColor: '#111827' }}
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: reduced ? 0 : 0.4, delay: reduced ? 0 : i * 0.1 }}
          >
            <div
              className="text-4xl font-bold mb-1 text-white tabular-nums"
              style={{ fontFamily: 'Poppins, sans-serif' }}
            >
              <Counter
                numeric={numeric}
                prefix={prefix}
                suffix={suffix}
                thousands={thousands}
                active={inView}
              />
            </div>
            <div className="text-xs uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {label}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
