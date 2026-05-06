'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { Printer, ShoppingCart, BarChart3, Wrench, Package, Award } from 'lucide-react';
import { SERVICES } from '@/lib/constants';

type CardConfig = {
  Icon: React.ElementType;
  index: number;
  colSpan: 1 | 2 | 3;
  featured?: boolean;
  href: string;
};

const CARDS: CardConfig[] = [
  { Icon: Printer,      index: 0, colSpan: 2, featured: true, href: '/services' },
  { Icon: ShoppingCart, index: 1, colSpan: 1, href: '/services' },
  { Icon: BarChart3,    index: 2, colSpan: 1, href: '/services' },
  { Icon: Wrench,       index: 3, colSpan: 1, href: '/services' },
  { Icon: Package,      index: 4, colSpan: 1, href: '/services' },
  { Icon: Award,        index: 5, colSpan: 3, href: '/contact' },
];

function BentoCard({ card, animDelay }: { card: CardConfig; animDelay: number }) {
  const { Icon, index, colSpan, featured, href } = card;
  const [hovered, setHovered] = useState(false);
  const [mouse, setMouse] = useState({ x: 50, y: 50 });
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const service = SERVICES[index];

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setMouse({
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    });
  };

  const colClass =
    colSpan === 3 ? 'md:col-span-3' : colSpan === 2 ? 'md:col-span-2' : 'md:col-span-1';

  const bgColor = featured ? '#172033' : '#111827';
  const borderColor = featured ? '#BF0D0D' : '#1E2D45';

  return (
    <motion.div
      ref={ref}
      className={`relative overflow-hidden border p-6 md:p-8 group cursor-pointer ${colClass}`}
      style={{ backgroundColor: bgColor, borderColor }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : animDelay }}
      whileHover={reduced ? {} : { scale: 1.015 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseMove={handleMouseMove}
    >
      {/* Featured: glow rojo ambiental sutil */}
      {featured && (
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div
            className="absolute inset-0 blur-3xl"
            style={{ background: 'radial-gradient(ellipse at 30% 80%, rgba(191,13,13,0.6), transparent 60%)' }}
          />
        </div>
      )}

      {/* Mouse-follow: barrido de luz roja */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-400 pointer-events-none"
        style={{ background: `radial-gradient(circle at ${mouse.x}% ${mouse.y}%, rgba(191,13,13,0.08), transparent 55%)` }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full">
        <motion.div
          className="w-11 h-11 flex items-center justify-center mb-5 border transition-colors duration-300"
          style={{ borderColor: '#BF0D0D', background: 'rgba(191,13,13,0.10)' }}
          animate={{ boxShadow: hovered ? '0 0 16px rgba(191,13,13,0.25)' : '0 0 0px rgba(191,13,13,0)' }}
          transition={{ duration: 0.3 }}
        >
          <Icon className="w-5 h-5" style={{ color: '#BF0D0D' }} />
        </motion.div>

        <h3 className={`font-bold text-white mb-3 transition-colors duration-300 ${featured ? 'text-2xl md:text-3xl' : 'text-base md:text-lg'}`}>
          {service.title_fr}
        </h3>

        <p className={`leading-relaxed transition-colors duration-300 ${featured ? 'text-base' : 'text-sm'}`}
          style={{ color: '#94A3B8' }}>
          {service.description_fr}
        </p>

        {/* CTA link */}
        <motion.div
          className="mt-auto pt-5"
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: hovered ? 1 : 0, x: hovered ? 0 : -8 }}
          transition={{ duration: 0.25 }}
        >
          <Link
            href={href}
            className="inline-flex items-center gap-1.5 text-sm font-semibold pb-0.5 transition-colors duration-200"
            style={{ color: '#BF0D0D', borderBottom: '1px solid rgba(191,13,13,0.4)' }}
          >
            {index === 5 ? 'Demander un devis' : 'En savoir plus'}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </motion.div>
      </div>

      {/* Hover: borde rojo sutil */}
      <div
        className="absolute inset-0 pointer-events-none transition-colors duration-500"
        style={{ border: `1px solid ${hovered ? 'rgba(191,13,13,0.3)' : 'transparent'}` }}
      />
    </motion.div>
  );
}

export default function ServicesBento() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <div ref={ref} className="relative">
      {/* Subtle grid background */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="bento-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#bento-grid)" />
        </svg>
      </div>

      {inView && (
        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {CARDS.map((card, i) => (
            <BentoCard key={card.index} card={card} animDelay={i * 0.1} />
          ))}
        </div>
      )}
    </div>
  );
}
