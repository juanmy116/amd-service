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

  return (
    <motion.div
      ref={ref}
      className={`relative overflow-hidden border p-6 md:p-8 group cursor-pointer ${colClass}`}
      style={{ backgroundColor: '#BF0D0D', borderColor: 'rgba(255,255,255,0.08)' }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : animDelay }}
      whileHover={reduced ? {} : { scale: 1.015 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseMove={handleMouseMove}
    >
      {/* Dark overlay que da el look futurista manteniendo el rojo de base */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(135deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.30) 50%, rgba(0,0,0,0.05) 100%)' }}
      />

      {/* Featured: glow rojo ambiental desde abajo */}
      {featured && (
        <div className="absolute inset-0 opacity-40 pointer-events-none">
          <div
            className="absolute inset-0 blur-2xl"
            style={{ background: 'radial-gradient(ellipse at 30% 80%, rgba(255,80,80,0.5), transparent 60%)' }}
          />
        </div>
      )}

      {/* Mouse-follow: barrido de luz blanca */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-400 pointer-events-none"
        style={{ background: `radial-gradient(circle at ${mouse.x}% ${mouse.y}%, rgba(255,255,255,0.10), transparent 55%)` }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full">
        <motion.div
          className="w-11 h-11 flex items-center justify-center mb-5 border border-white/20 group-hover:border-white/50 transition-colors duration-300"
          style={{ background: 'rgba(0,0,0,0.30)' }}
          animate={{ boxShadow: hovered ? '0 0 16px rgba(255,255,255,0.15)' : '0 0 0px rgba(255,255,255,0)' }}
          transition={{ duration: 0.3 }}
        >
          <Icon className="w-5 h-5 text-white" />
        </motion.div>


        <h3 className={`font-bold text-white mb-3 group-hover:text-white transition-colors duration-300 ${featured ? 'text-2xl md:text-3xl' : 'text-base md:text-lg'}`}>
          {service.title_fr}
        </h3>

        <p className={`leading-relaxed group-hover:text-white/90 transition-colors duration-300 ${featured ? 'text-base' : 'text-sm'}`}
          style={{ color: 'rgba(255,255,255,0.65)' }}>
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
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/90 hover:text-white border-b border-white/30 pb-0.5 hover:border-white/70 transition-colors duration-200"
          >
            {index === 5 ? 'Demander un devis' : 'En savoir plus'}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </motion.div>
      </div>

      {/* Hover: borde blanco sutil */}
      <div className="absolute inset-0 border border-white/0 group-hover:border-white/15 transition-colors duration-500 pointer-events-none" />
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
