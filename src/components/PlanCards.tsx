'use client';

import Image from 'next/image';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useRef } from 'react';
import { CheckCircle } from 'lucide-react';
import RippleButton from '@/components/RippleButton';

const PLANS = [
  {
    id: 'pantum-cm1100',
    model: 'Pantum CM1100',
    type: 'A4 — Couleur & Monochrome',
    target: 'TPE & petites équipes',
    price: '25.000 FCFA',
    recommended: false,
    image: '/images/copiers-1.png',
    features: [
      'Format A4 couleur & monochrome',
      'Idéal : faibles à moyens volumes',
      'Maintenance intégrale incluse',
      'Toner inclus sans limitation',
      'Assistance technique sur site',
      'Sans investissement initial',
    ],
  },
  {
    id: 'ricoh-mpc2003',
    model: 'Ricoh MP C2003',
    type: 'A4 / A3 — Multifonction couleur',
    target: 'PME & bureaux actifs',
    price: 'Sur devis',
    recommended: true,
    image: '/images/copiers-2.png',
    features: [
      'Impression A3 & A4, couleur & N&B',
      'Idéal : volumes modérés à élevés',
      'Maintenance intégrale incluse',
      'Toner inclus sans limitation',
      'Assistance technique sur site',
      'Sans investissement initial',
    ],
  },
  {
    id: 'ricoh-mpc3003',
    model: 'Ricoh MP C3003',
    type: 'A4 / A3 — Haute cadence',
    target: 'Grandes structures',
    price: 'Sur devis',
    recommended: false,
    image: '/images/copiers-3.png',
    features: [
      'Impression A3 haute cadence',
      'Idéal : forts volumes quotidiens',
      'Maintenance intégrale incluse',
      'Toner inclus sans limitation',
      'Assistance technique prioritaire',
      'Sans investissement initial',
    ],
  },
];

export default function PlanCards() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const reduced = useReducedMotion();

  return (
    <div ref={ref} className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 md:items-start">
      {PLANS.map((plan, i) => (
        <motion.div
          key={plan.id}
          className={`relative flex flex-col overflow-hidden${plan.recommended ? ' md:scale-105 md:z-10' : ''}`}
          style={{
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            backgroundColor: plan.recommended
              ? 'rgba(255,255,255,0.18)'
              : 'rgba(255,255,255,0.10)',
            border: plan.recommended
              ? '1px solid rgba(255,255,255,0.35)'
              : '1px solid rgba(255,255,255,0.15)',
            borderRadius: '10px',
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: reduced ? 0 : 0.45, delay: reduced ? 0 : i * 0.12 }}
        >
          {/* Recommandé badge */}
          {plan.recommended && (
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white"
              style={{ backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: '0 0 6px 6px' }}
            >
              Recommandé
            </div>
          )}

          {/* Image */}
          <div
            className="relative h-36 border-b"
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              borderColor: 'rgba(255,255,255,0.1)',
              borderRadius: '10px 10px 0 0',
              paddingTop: plan.recommended ? '28px' : '0',
            }}
          >
            <Image
              src={plan.image}
              alt={plan.model}
              fill
              style={{ objectFit: 'contain', padding: '24px' }}
            />
          </div>

          {/* Content */}
          <div className="flex flex-col flex-1 p-5">
            <div className="mb-3 text-center">
              <span
                className="inline-block text-xs font-semibold uppercase tracking-widest px-2 py-1 text-white"
                style={{ backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: '4px' }}
              >
                {plan.target}
              </span>
            </div>
            <h3
              className="text-xl font-bold mb-1 text-center text-white"
              style={{ fontFamily: 'Poppins, sans-serif' }}
            >
              {plan.model}
            </h3>
            <p className="text-sm mb-4 text-center" style={{ color: 'rgba(255,255,255,0.65)' }}>
              {plan.type}
            </p>

            {/* Price */}
            <div
              className="mb-4 pb-4 border-b text-center"
              style={{ borderColor: 'rgba(255,255,255,0.12)' }}
            >
              {plan.price === 'Sur devis' ? (
                <span className="text-3xl font-bold text-white" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  Sur devis
                </span>
              ) : (
                <>
                  <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    Dès
                  </p>
                  <span className="text-3xl font-bold text-white" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {plan.price}
                  </span>
                  <span className="text-sm font-medium ml-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    /mois
                  </span>
                </>
              )}
            </div>

            {/* Features */}
            <ul className="flex-1 mb-5 overflow-hidden" style={{ backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
              {plan.features.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 text-sm px-4 py-2 border-b"
                  style={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.1)' }}
                >
                  <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-white" />
                  {item}
                </li>
              ))}
            </ul>

            {/* CTA con ripple */}
            <RippleButton
              href="/contact"
              className="w-full px-6 py-3 text-sm font-semibold"
              style={{
                backgroundColor: 'rgba(255,255,255,0.95)',
                color: '#BF0D0D',
                borderRadius: '6px',
              }}
              rippleColor="rgba(191,13,13,0.2)"
            >
              Je suis intéressé
            </RippleButton>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
