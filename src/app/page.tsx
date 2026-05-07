import Link from 'next/link';
import HeroVideo from '@/components/HeroVideo';
import HeroStats from '@/components/HeroStats';
import ServicesBento from '@/components/ServicesBento';
import BenefitsList from '@/components/BenefitsList';
import PlanCards from '@/components/PlanCards';
import ClientLogos from '@/components/ClientLogos';
import PhotoFrame from '@/components/PhotoFrame';
import { HERO, CTA_MESSAGES } from '@/lib/constants';
import { PHOTO_ASSETS, PHOTO_CREDITS } from '@/lib/visuals';
import { ArrowRight, Clock, Wrench, BarChart3, Headphones, ShieldCheck, Repeat } from 'lucide-react';

const SUPPORT_ITEMS = [
  {
    Icon: Clock,
    title: 'Intervention sous délai garanti',
    desc: 'Nos techniciens sont basés à Dakar. Aucun sous-traitant — une équipe propre qui intervient en temps record pour ne pas interrompre votre activité.',
  },
  {
    Icon: Wrench,
    title: 'Maintenance préventive & corrective',
    desc: 'Nous intervenons avant l\'apparition des pannes grâce à la maintenance planifiée, et résolvons rapidement tout incident. Votre équipement reste opérationnel.',
  },
  {
    Icon: BarChart3,
    title: 'Monitoring en temps réel',
    desc: 'Vos équipements sont suivis en permanence. Détection proactive des anomalies et déclenchement automatique des interventions avant la panne.',
  },
  {
    Icon: Repeat,
    title: 'Toner livré automatiquement',
    desc: 'Le toner est réapprovisionné avant rupture. Vous n\'avez jamais à gérer les commandes — c\'est entièrement pris en charge par AMD Service.',
  },
  {
    Icon: Headphones,
    title: 'Un interlocuteur unique dédié',
    desc: 'Une équipe humaine et proche. Un seul contact pour toutes vos demandes : technique, administrative ou commerciale. Fini la gestion de prestataires multiples.',
  },
  {
    Icon: ShieldCheck,
    title: 'SLA garanti par contrat',
    desc: 'Délai d\'intervention défini et garanti dans votre contrat. Vous savez exactement ce que vous obtenez — sans mauvaise surprise, sans zone grise.',
  },
];

export default function Home() {
  return (
    <div style={{ backgroundColor: '#FFFFFF' }}>

      {/* 1 ── Hero ── RED */}
      <section className="relative overflow-hidden border-b" style={{ borderColor: '#9A0A0A' }}>
        <HeroVideo />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-36" style={{ zIndex: 2 }}>
          <div className="grid md:grid-cols-3 gap-16 items-center">

            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-1 h-4 bg-white" style={{ opacity: 0.7 }} />
                <span className="text-xs font-semibold uppercase tracking-widest text-white" style={{ opacity: 0.75 }}>
                  +10 ans d&apos;expertise · Dakar, Sénégal
                </span>
              </div>
              <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-6 text-white">
                {HERO.title_fr}
              </h1>
              <p className="text-lg mb-10 leading-relaxed" style={{ color: 'rgba(255,255,255,0.85)' }}>
                {HERO.subtitle_fr}
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 font-semibold transition-opacity duration-150 hover:opacity-90 cursor-pointer"
                  style={{ backgroundColor: '#FFFFFF', color: '#BF0D0D' }}
                >
                  {HERO.cta_primary_fr}
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/#plans"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 font-semibold border-2 cursor-pointer text-white transition-colors duration-150 hover:bg-white/10"
                  style={{ borderColor: 'rgba(255,255,255,0.6)' }}
                >
                  Voir nos plans
                </Link>
              </div>
            </div>

            <HeroStats theme="light" />
          </div>
        </div>
      </section>

      {/* 2 ── Value bar ── DARK */}
      <section className="border-b" style={{ backgroundColor: '#111827', borderColor: '#1E2D45' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-wrap justify-center gap-8">
            {['Zéro investissement initial', 'Maintenance incluse', 'Coût par copie transparent', 'Support local Dakar'].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-white/80">
                <div className="w-1 h-4 flex-shrink-0 bg-white/50" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3 ── Service proof ── WHITE */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-b" style={{ borderColor: '#E5E7EB' }}>
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-px" style={{ backgroundColor: '#E5E7EB' }}>
          <div className="p-8 md:p-10 lg:col-span-2" style={{ backgroundColor: '#FFFFFF' }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>Sur le terrain</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-4" style={{ color: '#111827' }}>
              La confiance commence par un parc lisible
            </h2>
            <p className="text-sm leading-relaxed mb-6" style={{ color: '#6B7280' }}>
              Chaque contrat AMD Service est construit autour d&apos;un seul objectif : que votre parc ne s&apos;arrête jamais. Équipements récents, toner livré avant rupture, technicien disponible à Dakar — tout est inclus dès le premier jour.
            </p>
            <Link
              href="/services"
              className="inline-flex items-center gap-2 text-sm font-semibold transition-opacity duration-150 hover:opacity-70"
              style={{ color: '#BF0D0D' }}
            >
              Voir l&apos;approche service <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <PhotoFrame
            src={PHOTO_ASSETS.printerDetail}
            alt="Imprimante professionnelle installée dans un espace de bureau"
            credit={PHOTO_CREDITS.printerDetail}
            className="h-[320px] border-0 lg:col-span-3"
          />
        </div>
      </section>

      {/* 4 ── Nos solutions ── GREY */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-b" style={{ backgroundColor: '#F5F5F5', borderColor: '#E5E7EB' }}>
        <div className="max-w-7xl mx-auto">
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>Nos solutions</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-2" style={{ color: '#111827' }}>
              Une offre complète pour votre parc d&apos;impression
            </h2>
            <p className="text-base max-w-2xl" style={{ color: '#6B7280' }}>
              Nous prenons en charge tout le cycle de vie de vos équipements.
            </p>
          </div>
          <ServicesBento theme="light" />
        </div>
      </section>

      {/* 5 ── Plans ── WHITE */}
      <section id="plans" className="py-16 px-4 sm:px-6 lg:px-8 border-b" style={{ borderColor: '#E5E7EB' }}>
        <div className="max-w-7xl mx-auto">
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>Nos plans de Location</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-2" style={{ color: '#111827' }}>
              Choisissez votre plan
            </h2>
            <p className="text-base max-w-2xl" style={{ color: '#6B7280' }}>
              Même formule pour les trois équipements — location, maintenance et toner inclus. Aucun frais caché.
            </p>
          </div>
          <PlanCards />
        </div>
      </section>

      {/* 6 ── Ils nous font confiance + CTA ── RED */}
      <ClientLogos />

      {/* 7 ── Support technique ── GREY */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-b" style={{ backgroundColor: '#F5F5F5', borderColor: '#E5E7EB' }}>
        <div className="max-w-7xl mx-auto">
          <div className="mb-14">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>Service technique</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-3" style={{ color: '#111827' }}>
              Un support qui ne vous laisse jamais tomber
            </h2>
            <p className="text-base max-w-2xl" style={{ color: '#6B7280' }}>
              Nos techniciens basés à Dakar prennent en charge l&apos;intégralité de vos équipements, de l&apos;installation au suivi quotidien.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px" style={{ backgroundColor: '#E5E7EB' }}>
            {SUPPORT_ITEMS.map(({ Icon, title, desc }) => (
              <div key={title} className="flex gap-5 p-8" style={{ backgroundColor: '#F5F5F5' }}>
                <div
                  className="w-10 h-10 flex-shrink-0 flex items-center justify-center border mt-0.5"
                  style={{ borderColor: '#E5E7EB', backgroundColor: 'rgba(191,13,13,0.06)' }}
                >
                  <Icon className="w-4 h-4" style={{ color: '#BF0D0D' }} />
                </div>
                <div>
                  <h3 className="font-semibold mb-2" style={{ color: '#111827', fontSize: '0.9375rem' }}>{title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8 ── Pourquoi AMD ── GREY */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-b" style={{ backgroundColor: '#F5F5F5', borderColor: '#E5E7EB' }}>
        <div className="max-w-7xl mx-auto">
          <div className="mb-14">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>Pourquoi AMD Service</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold" style={{ color: '#111827' }}>Ce que vous gagnez avec nous</h2>
          </div>
          <BenefitsList theme="light" />
        </div>
      </section>

      {/* 10 ── CTA final ── RED */}
      <section className="py-20 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#BF0D0D' }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-1 h-4 bg-white" style={{ opacity: 0.7 }} />
            <span className="text-xs font-semibold uppercase tracking-widest text-white" style={{ opacity: 0.75 }}>Prochaine étape</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
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
      </section>

    </div>
  );
}
