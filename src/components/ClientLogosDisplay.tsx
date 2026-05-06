'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { CTA_MESSAGES } from '@/lib/constants';

export default function ClientLogosDisplay({ logos }: { logos: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section style={{ backgroundColor: '#BF0D0D' }} className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">

        {logos.length > 0 && (
          <>
            {/* Eyebrow */}
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

            {/* Logos */}
            <div
              ref={ref}
              className="flex flex-wrap justify-center items-center gap-x-14 gap-y-10 mb-16 pb-16 border-b"
              style={{ borderColor: 'rgba(255,255,255,0.2)' }}
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
          </>
        )}

        {/* CTA */}
        <div ref={logos.length === 0 ? ref : undefined}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4 bg-white" style={{ opacity: 0.7 }} />
            <span className="text-xs font-semibold uppercase tracking-widest text-white" style={{ opacity: 0.75 }}>
              Prochaine étape
            </span>
          </div>
          <h2
            className="text-3xl md:text-4xl font-bold text-white mb-4"
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            Prêt à maîtriser vos coûts d&apos;impression ?
          </h2>
          <p className="text-lg mb-8" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Obtenez un diagnostic gratuit de votre parc, sans engagement.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 px-8 py-4 font-semibold transition-opacity duration-150 hover:opacity-90 cursor-pointer"
            style={{ backgroundColor: '#FFFFFF', color: '#BF0D0D' }}
          >
            {CTA_MESSAGES.audit_fr}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

      </div>
    </section>
  );
}
