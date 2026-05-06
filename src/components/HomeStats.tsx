'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';

function useCounter(target: number, duration: number, active: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active) return;
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else { setCount(Math.floor(start)); }
    }, 16);
    return () => clearInterval(timer);
  }, [active, target, duration]);
  return count;
}

function formatNumber(n: number) {
  if (n >= 1000) return n.toLocaleString('fr-FR').replace(/ /, '.');
  return String(n);
}

const STATS = [
  { value: 10,   suffix: '+', label: "Années d'expérience" },
  { value: 1200, suffix: '+', label: 'Équipements en location' },
  { value: 2600, suffix: '+', label: 'Machines au Sénégal' },
];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.18 } },
};

const itemVariants = {
  hidden:   { opacity: 0, y: 24 },
  visible:  { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] as const } },
};

export default function HomeStats() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  const c0 = useCounter(STATS[0].value, 1200, inView);
  const c1 = useCounter(STATS[1].value, 1600, inView);
  const c2 = useCounter(STATS[2].value, 1800, inView);
  const counts = [c0, c1, c2];

  return (
    <motion.div
      ref={ref}
      className="grid grid-cols-1 md:grid-cols-3 gap-px"
      style={{ backgroundColor: '#E5E7EB' }}
      variants={containerVariants}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
    >
      {STATS.map(({ suffix, label }, i) => (
        <motion.div
          key={label}
          className="flex flex-col items-center justify-center py-14 px-8 text-center"
          style={{ backgroundColor: '#FFFFFF' }}
          variants={itemVariants}
        >
          <div
            className="text-5xl font-bold mb-2"
            style={{ fontFamily: 'Poppins, sans-serif', color: '#BF0D0D' }}
          >
            {formatNumber(counts[i])}{suffix}
          </div>
          <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6B7280' }}>
            {label}
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}
