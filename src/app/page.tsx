import Link from 'next/link';
import HeroVideo from '@/components/HeroVideo';
import HeroStats from '@/components/HeroStats';
import ServicesBento from '@/components/ServicesBento';
import BenefitsList from '@/components/BenefitsList';
import { HERO, CTA_MESSAGES } from '@/lib/constants';
import { ArrowRight } from 'lucide-react';

export default function Home() {
  return (
    <div style={{ backgroundColor: '#0B1120' }}>

      {/* Hero */}
      <section className="relative border-b overflow-hidden" style={{ borderColor: '#1E2D45' }}>
        <HeroVideo />
        {/* Dark overlay */}
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(11,17,32,0.40)', zIndex: 1 }} />
        <div className="absolute top-0 left-0 right-0 h-px" style={{ backgroundColor: '#BF0D0D', zIndex: 2 }} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-36" style={{ zIndex: 2 }}>
          <div className="grid md:grid-cols-3 gap-16 items-center">

            {/* Left */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>
                  +10 ans d&apos;expertise · Dakar, Sénégal
                </span>
              </div>

              <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-6 text-white">
                {HERO.title_fr}
              </h1>

              <p className="text-lg mb-10 leading-relaxed text-white">
                {HERO.subtitle_fr}
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 text-white font-semibold transition-opacity duration-150 hover:opacity-80 cursor-pointer"
                  style={{ backgroundColor: '#BF0D0D' }}
                >
                  {HERO.cta_primary_fr}
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/services"
                  className="btn-ghost inline-flex items-center justify-center gap-2 px-6 py-3 font-semibold border cursor-pointer text-white"
                >
                  {HERO.cta_secondary_fr}
                </Link>
              </div>
            </div>

            {/* Right: Stats */}
            <HeroStats />
          </div>
        </div>
      </section>

      {/* Value bar */}
      <section className="border-b" style={{ backgroundColor: '#111827', borderColor: '#1E2D45' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-wrap justify-center gap-8">
            {['Zéro investissement initial', 'Maintenance incluse', 'Coût par copie transparent', 'Support local Dakar'].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm" style={{ color: '#94A3B8' }}>
                <div className="w-1 h-4 flex-shrink-0" style={{ backgroundColor: '#BF0D0D' }} />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 border-b" style={{ borderColor: '#1E2D45' }}>
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>Nos solutions</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
              Une offre complète pour votre parc d&apos;impression
            </h2>
            <p className="text-base max-w-2xl" style={{ color: '#94A3B8' }}>
              Nous prenons en charge tout le cycle de vie de vos équipements.
            </p>
          </div>

          <ServicesBento />
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-b" style={{ borderColor: '#1E2D45' }}>
        <div className="max-w-7xl mx-auto">
          <div className="mb-14">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>Pourquoi AMD Service</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white">Ce que vous gagnez avec nous</h2>
          </div>

          <BenefitsList />
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#111827' }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>Prochaine étape</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Prêt à maîtriser vos coûts d&apos;impression ?
          </h2>
          <p className="text-lg mb-8" style={{ color: '#94A3B8' }}>
            Obtenez un diagnostic gratuit de votre parc, sans engagement.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 px-8 py-4 text-white font-semibold transition-opacity duration-150 hover:opacity-80 cursor-pointer"
            style={{ backgroundColor: '#BF0D0D' }}
          >
            {CTA_MESSAGES.audit_fr}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
