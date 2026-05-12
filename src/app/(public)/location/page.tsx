import type { Metadata } from 'next';
import Link from 'next/link';
import PlanCards from '@/components/PlanCards';
import PhotoFrame from '@/components/PhotoFrame';
import { CTA_MESSAGES } from '@/lib/constants';
import { PHOTO_ASSETS, PHOTO_CREDITS } from '@/lib/visuals';
import LocationStats from '@/components/LocationStats';
import {
  ArrowRight,
  CheckCircle,
  Clock,
  Package,
  ShieldCheck,
  Wrench,
  BarChart3,
  Headphones,
} from 'lucide-react';

export const metadata: Metadata = {
  title: "Location d'imprimante & photocopieur à Dakar — AMD Service",
  description:
    "Louez une imprimante ou photocopieur professionnelle à Dakar sans investissement initial. Coût par copie transparent, maintenance incluse, toner livré automatiquement. AMD Service, +10 ans au Sénégal.",
  keywords: [
    "location imprimante Dakar",
    "location photocopieur Dakar",
    "coût par copie Sénégal",
    "louer imprimante entreprise Dakar",
    "location multifonction Dakar",
    "impression gérée Sénégal",
  ],
  openGraph: {
    title: "Location d'imprimante & photocopieur à Dakar — AMD Service",
    description:
      "Zéro investissement initial. Maintenance, toner et support inclus. Payez uniquement vos copies.",
    locale: 'fr_SN',
  },
};

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Audit gratuit',
    desc: 'Nous analysons votre parc actuel : volumes, besoins couleur, criticité des équipements et coûts cachés. Sans engagement.',
  },
  {
    step: '02',
    title: 'Déploiement',
    desc: "Installation des équipements, configuration réseau et formation de vos équipes. Opérationnel dès le premier jour.",
  },
  {
    step: '03',
    title: 'Suivi mensuel',
    desc: 'Maintenance préventive planifiée, toner livré avant rupture, support technique sur site. Vous ne gérez plus rien.',
  },
];

const INCLUDED = [
  { Icon: Wrench, label: 'Maintenance préventive & corrective' },
  { Icon: Package, label: 'Toner livré automatiquement' },
  { Icon: ShieldCheck, label: 'SLA garanti par contrat' },
  { Icon: Clock, label: 'Intervention sous délai garanti' },
  { Icon: Headphones, label: 'Support technique dédié' },
  { Icon: BarChart3, label: 'Suivi de consommation mensuel' },
];


const FAQ = [
  {
    q: "C'est quoi le coût par copie ?",
    a: "Vous payez un tarif fixe pour chaque page imprimée. Ce tarif inclut l'utilisation de l'équipement, la maintenance et les consommables. Zéro surprise en fin de mois.",
  },
  {
    q: 'Y a-t-il un investissement initial ?',
    a: "Non. Vous accédez à des équipements professionnels récents sans immobiliser votre capital. La location démarre sans apport.",
  },
  {
    q: 'La maintenance et le toner sont-ils inclus ?',
    a: "Oui. Toute la maintenance préventive, les interventions correctives, le toner et les pièces sont inclus dans votre contrat de location.",
  },
  {
    q: 'Proposez-vous des imprimantes A3 et couleur ?',
    a: "Oui. Notre catalogue inclut des multifonctions A4 et A3, en couleur et en monochrome, adaptés à tous les volumes — de la TPE à la grande administration.",
  },
];

export default function LocationPage() {
  return (
    <div style={{ backgroundColor: '#FFFFFF' }}>

      {/* 1 — Hero — RED */}
      <section className="py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#BF0D0D' }}>
        <div
          className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-px"
          style={{ backgroundColor: 'rgba(255,255,255,0.22)' }}
        >
          <div className="p-8 md:p-12 lg:col-span-3" style={{ backgroundColor: '#BF0D0D' }}>
            <div className="flex items-center gap-2 mb-5">
              <div className="w-1 h-4 bg-white" style={{ opacity: 0.7 }} />
              <span
                className="text-xs font-semibold uppercase tracking-widest text-white"
                style={{ opacity: 0.75 }}
              >
                Location d&apos;imprimantes · Dakar, Sénégal
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-5 leading-tight">
              Location d&apos;imprimante et photocopieur à Dakar
            </h1>
            <p className="text-lg max-w-2xl mb-8 leading-relaxed" style={{ color: 'rgba(255,255,255,0.85)' }}>
              Accédez à des équipements professionnels récents sans investissement initial.
              Coût par copie transparent, maintenance incluse, toner livré avant rupture.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/contact"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 font-semibold transition-opacity duration-150 hover:opacity-90 cursor-pointer"
                style={{ backgroundColor: '#FFFFFF', color: '#BF0D0D' }}
              >
                {CTA_MESSAGES.audit_fr}
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="#plans"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 font-semibold border-2 text-white transition-colors duration-150 hover:bg-white/10 cursor-pointer"
                style={{ borderColor: 'rgba(255,255,255,0.5)' }}
              >
                Voir les équipements
              </Link>
            </div>
          </div>
          <PhotoFrame
            src={PHOTO_ASSETS.locationHero}
            alt="Photocopieur multifonction professionnel installé dans un bureau à Dakar"
            credit={PHOTO_CREDITS.locationHero}
            priority
            className="h-[340px] border-0 lg:col-span-2 lg:h-full"
          />
        </div>
      </section>

      {/* 2 — Value bar — DARK */}
      <section className="border-b" style={{ backgroundColor: '#111827', borderColor: '#1E2D45' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-wrap justify-center gap-8">
            {[
              'Zéro investissement initial',
              'Coût par copie transparent',
              'Maintenance & toner inclus',
              'Techniciens basés à Dakar',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-white/80">
                <div className="w-1 h-4 flex-shrink-0 bg-white/50" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3 — Coût par copie expliqué — WHITE */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-b" style={{ borderColor: '#E5E7EB' }}>
        <div
          className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-px"
          style={{ backgroundColor: '#E5E7EB' }}
        >
          <div className="p-8 md:p-10 lg:col-span-3" style={{ backgroundColor: '#FFFFFF' }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>
                Le modèle
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-4" style={{ color: '#111827' }}>
              Pourquoi louer plutôt qu&apos;acheter ?
            </h2>
            <p className="text-sm leading-relaxed mb-6" style={{ color: '#6B7280' }}>
              Acheter une imprimante, c&apos;est immobiliser du capital, gérer les pannes, commander le toner en urgence
              et anticiper le remplacement. Avec AMD Service, vous payez uniquement ce que vous imprimez —
              un coût par copie fixe, tout inclus, sans mauvaise surprise.
            </p>
            <p className="text-sm leading-relaxed mb-8" style={{ color: '#6B7280' }}>
              Ce modèle est utilisé par les grandes entreprises, les administrations et les ONG au Sénégal
              pour transformer une dépense imprévisible en charge mensuelle contrôlée.
            </p>
            <Link
              href="/why"
              className="inline-flex items-center gap-2 text-sm font-semibold transition-opacity duration-150 hover:opacity-70 cursor-pointer"
              style={{ color: '#BF0D0D' }}
            >
              Comparer achat vs location <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <PhotoFrame
            src={PHOTO_ASSETS.locationDetail}
            alt="Conseiller AMD Service présentant les options de location d'imprimante"
            credit={PHOTO_CREDITS.locationDetail}
            className="h-[300px] border-0 lg:col-span-2 lg:h-full"
          />
        </div>
      </section>

      {/* 4 — Plans — RED */}
      <section id="plans" className="py-14 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#BF0D0D' }}>
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 bg-white" style={{ opacity: 0.7 }} />
              <span className="text-xs font-semibold uppercase tracking-widest text-white" style={{ opacity: 0.75 }}>
                Nos équipements en location
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
              Choisissez votre équipement
            </h2>
            <p className="text-base max-w-2xl" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Imprimantes A4, multifonctions A3, couleur ou monochrome. Maintenance et toner inclus dans chaque formule.
            </p>
          </div>
          <PlanCards />
        </div>
      </section>

      {/* 5 — Comment ça marche — GREY */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-b" style={{ backgroundColor: '#F5F5F5', borderColor: '#E5E7EB' }}>
        <div className="max-w-7xl mx-auto">
          <div className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>
                Le processus
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold" style={{ color: '#111827' }}>
              Comment ça marche ?
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px" style={{ backgroundColor: '#E5E7EB' }}>
            {HOW_IT_WORKS.map(({ step, title, desc }) => (
              <div key={step} className="p-8" style={{ backgroundColor: '#FFFFFF' }}>
                <div className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: '#BF0D0D' }}>
                  {step}
                </div>
                <h3 className="text-lg font-semibold mb-3" style={{ color: '#111827' }}>{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6 — Ce qui est inclus — WHITE */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-b" style={{ borderColor: '#E5E7EB' }}>
        <div className="max-w-7xl mx-auto">
          <div className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>
                Inclus dans chaque contrat
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold" style={{ color: '#111827' }}>
              Tout est pris en charge — sans exception
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px" style={{ backgroundColor: '#E5E7EB' }}>
            {INCLUDED.map(({ Icon, label }) => (
              <div key={label} className="flex items-center gap-4 p-6" style={{ backgroundColor: '#FFFFFF' }}>
                <div
                  className="w-10 h-10 flex-shrink-0 flex items-center justify-center border"
                  style={{ borderColor: '#E5E7EB', backgroundColor: 'rgba(191,13,13,0.06)' }}
                >
                  <Icon className="w-4 h-4" style={{ color: '#BF0D0D' }} />
                </div>
                <span className="font-medium text-sm" style={{ color: '#111827' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7 — Stats — DARK */}
      <LocationStats />

      {/* 8 — FAQ — GREY */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-b" style={{ backgroundColor: '#F5F5F5', borderColor: '#E5E7EB' }}>
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>
              Questions fréquentes
            </span>
          </div>
          <h2 className="text-2xl font-bold mb-10" style={{ color: '#111827' }}>
            Ce que vous voulez savoir avant de louer
          </h2>
          <div className="space-y-px" style={{ backgroundColor: '#E5E7EB' }}>
            {FAQ.map(({ q, a }) => (
              <div key={q} className="p-6" style={{ backgroundColor: '#FFFFFF' }}>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#BF0D0D' }} />
                  <div>
                    <p className="font-semibold mb-2" style={{ color: '#111827', fontSize: '0.9375rem' }}>{q}</p>
                    <p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>{a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Link
              href="/faq"
              className="text-sm font-semibold transition-opacity hover:opacity-70 cursor-pointer"
              style={{ color: '#BF0D0D' }}
            >
              Voir toutes les questions <ArrowRight className="w-4 h-4 inline ml-1" />
            </Link>
          </div>
        </div>
      </section>

      {/* 9 — CTA final — RED */}
      <section className="py-20 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#BF0D0D' }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-1 h-4 bg-white" style={{ opacity: 0.7 }} />
            <span className="text-xs font-semibold uppercase tracking-widest text-white" style={{ opacity: 0.75 }}>
              Prochaine étape
            </span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Prêt à louer votre imprimante à Dakar ?
          </h2>
          <p className="text-lg mb-8" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Obtenez un audit gratuit de votre parc et un devis personnalisé sous 24h. Sans engagement.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-8 py-4 font-semibold transition-opacity duration-150 hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: '#FFFFFF', color: '#BF0D0D' }}
            >
              {CTA_MESSAGES.audit_fr}
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/services"
              className="inline-flex items-center gap-2 px-8 py-4 font-semibold border text-white transition-opacity duration-150 hover:opacity-80 cursor-pointer"
              style={{ borderColor: 'rgba(255,255,255,0.4)' }}
            >
              Voir nos services techniques
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
