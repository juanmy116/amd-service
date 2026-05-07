'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useRef } from 'react';
import { CheckCircle } from 'lucide-react';

const PLANS = [
  {
    id: 'pantum-cm1100',
    model: 'Pantum CM1100',
    type: 'A4 — Couleur & Monochrome',
    image: '/images/copiers-1.png',
  },
  {
    id: 'ricoh-mpc2003',
    model: 'Ricoh MP C2003',
    type: 'A4 / A3 — Monochrome & Couleur',
    image: '/images/copiers-2.png',
  },
  {
    id: 'ricoh-mpc3003',
    model: 'Ricoh MP C3003',
    type: 'A4 / A3 — Monochrome & Couleur',
    image: '/images/copiers-3.png',
  },
];

const INCLUDED = [
  'Équipement en location',
  'Maintenance intégrale incluse',
  'Toner inclus sans limitation',
  'Assistance technique sur site',
  'Sans investissement initial',
  'Coût par copie transparent',
];

export default function PlanCards() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const reduced = useReducedMotion();

  return (
    <div ref={ref} className="grid grid-cols-1 md:grid-cols-3 gap-px" style={{ backgroundColor: '#E5E7EB' }}>
      {PLANS.map((plan, i) => (
        <motion.div
          key={plan.id}
          className="flex flex-col bg-white"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: reduced ? 0 : 0.45, delay: reduced ? 0 : i * 0.12 }}
        >
          {/* Image */}
          <div
            className="relative h-56 border-b"
            style={{ backgroundColor: '#F9FAFB', borderColor: '#F3F4F6' }}
          >
            <Image
              src={plan.image}
              alt={plan.model}
              fill
              style={{ objectFit: 'contain', padding: '24px' }}
            />
          </div>

          {/* Content */}
          <div className="flex flex-col flex-1 p-8">
            <h3
              className="text-xl font-bold mb-1 text-center"
              style={{ color: '#111827', fontFamily: 'Poppins, sans-serif' }}
            >
              {plan.model}
            </h3>
            <p className="text-sm mb-6 text-center" style={{ color: '#6B7280' }}>{plan.type}</p>

            {/* Price */}
            <div className="mb-6 pb-6 border-b text-center" style={{ borderColor: '#F3F4F6' }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: '#6B7280' }}>Dès</p>
              <span
                className="text-3xl font-bold"
                style={{ color: '#BF0D0D', fontFamily: 'Poppins, sans-serif' }}
              >
                25.000 FCFA
              </span>
              <span className="text-sm font-medium ml-2" style={{ color: '#6B7280' }}>/mois</span>
            </div>

            {/* Included */}
            <ul className="flex-1 mb-8" style={{ backgroundColor: '#BF0D0D' }}>
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm px-5 py-3 border-b" style={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.15)' }}>
                  <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-white" />
                  {item}
                </li>
              ))}
            </ul>

            {/* CTA */}
            <Link
              href="/contact"
              className="w-full inline-flex items-center justify-center px-6 py-3 text-sm font-semibold text-white transition-opacity duration-150 hover:opacity-80 cursor-pointer"
              style={{ backgroundColor: '#BF0D0D' }}
            >
              Je suis intéressé
            </Link>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
