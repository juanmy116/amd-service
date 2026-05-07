'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';

export default function ClientLogosDisplay({ logos }: { logos: string[] }) {
  const reduced = useReducedMotion();

  if (logos.length === 0) return null;

  const doubled = [...logos, ...logos];

  return (
    <section
      className="py-12 overflow-hidden border-t-4 border-b-4"
      style={{ backgroundColor: '#FFFFFF', borderTopColor: '#BF0D0D', borderBottomColor: '#BF0D0D' }}
    >

      {/* Encabezado */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>
            Références
          </span>
        </div>
        <h2
          className="text-3xl md:text-4xl font-bold"
          style={{ color: '#111827', fontFamily: 'Poppins, sans-serif' }}
        >
          Ils nous font confiance
        </h2>
      </div>

      {/* Carrusel — ancho completo */}
      <div className="relative">
        {/* Fade izquierda */}
        <div
          className="absolute left-0 top-0 bottom-0 w-32 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to right, #FFFFFF, transparent)' }}
        />
        {/* Fade derecha */}
        <div
          className="absolute right-0 top-0 bottom-0 w-32 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to left, #FFFFFF, transparent)' }}
        />

        <motion.div
          className="flex items-center"
          style={{ width: 'max-content' }}
          animate={reduced ? {} : { x: ['0%', '-50%'] }}
          transition={{
            repeat: Infinity,
            ease: 'linear',
            duration: 45,
          }}
        >
          {doubled.map((src, i) => {
            const name = src.split('/').pop()?.replace(/\.\w+$/, '').replace(/[-_]/g, ' ') ?? `Logo client ${(i % logos.length) + 1}`;
            return (
              <div key={i} className="flex-shrink-0 px-12">
                <Image
                  src={src}
                  alt={name}
                  width={150}
                  height={70}
                  style={{
                    objectFit: 'contain',
                    opacity: 0.85,
                  }}
                />
              </div>
            );
          })}
        </motion.div>
      </div>

    </section>
  );
}
