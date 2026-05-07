'use client';

import Image from 'next/image';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

export default function ClientLogosDisplay({ logos }: { logos: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  if (logos.length === 0) return null;

  return (
    <section style={{ backgroundColor: '#BF0D0D' }} className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">

        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-4 bg-white" style={{ opacity: 0.7 }} />
          <span className="text-xs font-semibold uppercase tracking-widest text-white" style={{ opacity: 0.75 }}>
            Références
          </span>
        </div>
        <h2
          className="text-3xl md:text-4xl font-bold text-white mb-14"
          style={{ fontFamily: 'Poppins, sans-serif' }}
        >
          Ils nous font confiance
        </h2>

        <div
          ref={ref}
          className="flex flex-wrap justify-center items-center gap-x-14 gap-y-10"
        >
          {logos.map((src, i) => (
            <motion.div
              key={src}
              initial={{ opacity: 0, y: 12 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: i * 0.08 }}
            >
              <Image
                src={src}
                alt={`Client ${i + 1}`}
                width={130}
                height={60}
                style={{
                  objectFit: 'contain',
                  filter: 'brightness(0) invert(1)',
                  opacity: 0.85,
                }}
              />
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
}
