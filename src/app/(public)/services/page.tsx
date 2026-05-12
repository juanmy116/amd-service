import type { Metadata } from 'next';
import Link from 'next/link';
import PhotoFrame from '@/components/PhotoFrame';
import { SERVICES, CTA_MESSAGES } from '@/lib/constants';
import { PHOTO_ASSETS, PHOTO_CREDITS } from '@/lib/visuals';
import {
  ArrowRight,
  BarChart3,
  CheckCircle,
  CreditCard,
  Package,
  Printer,
  ShoppingCart,
  Wrench,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Services techniques — Vente, Maintenance & Gestion de parc — AMD Service',
  description:
    'Vente d\'équipements, maintenance préventive et corrective, gestion de parc et fourniture de consommables à Dakar, Sénégal. AMD Service, +10 ans d\'expertise.',
};

const SERVICE_ICONS = [Printer, ShoppingCart, BarChart3, Wrench, Package, CreditCard];

const SERVICE_DETAILS: Record<string, string[]> = {
  rental: ['Équipements A4 et A3', 'Couleur et monochrome', 'Multifonctions impression, copie, scan', 'Sans investissement initial'],
  sales: ['Gamme professionnelle complète', 'Installation et mise en service', 'Formation des utilisateurs', 'SAV inclus'],
  management: ['Tableau de bord centralisé', 'Suivi de consommation', 'Optimisation du parc', 'Rapports mensuels'],
  maintenance: ['Interventions préventives planifiées', 'Corrective sous délai garanti', 'Pièces d\'origine', 'Techniciens certifiés'],
  consumables: ['Toner d\'origine', 'Pièces détachées', 'Livraison sur site', 'Stock géré par AMD'],
  managed: ['Coût par copie fixe', 'Tout inclus : matériel + service', 'Facturation mensuelle simplifiée', 'Visibilité budgétaire totale'],
};

const STATS = [
  { value: '10+', label: 'Années d\'expérience' },
  { value: '1.200+', label: 'Équipements en location' },
  { value: '2.600+', label: 'Machines au Sénégal' },
  { value: '24h', label: 'Délai d\'intervention' },
];

const SERVICE_GROUPS = [
  {
    label: 'Acheter vos équipements',
    title: 'Acquérir sans complexité',
    serviceIds: ['sales'],
  },
  {
    label: 'Exploiter au quotidien',
    title: 'Gérer, maintenir et approvisionner',
    serviceIds: ['management', 'maintenance', 'consumables'],
  },
];

function ServiceTile({ serviceId }: { serviceId: string }) {
  const serviceIndex = SERVICES.findIndex((service) => service.id === serviceId);
  const service = SERVICES[serviceIndex];
  const Icon = SERVICE_ICONS[serviceIndex] || Printer;
  const details = SERVICE_DETAILS[service.id] || [];

  return (
    <article className="service-card flex flex-col p-7">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div
          className="flex h-11 w-11 items-center justify-center border"
          style={{ borderColor: 'rgba(191,13,13,0.15)', backgroundColor: 'rgba(191,13,13,0.06)' }}
        >
          <Icon className="h-5 w-5" style={{ color: '#BF0D0D' }} />
        </div>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#9CA3AF' }}>
          {String(serviceIndex + 1).padStart(2, '0')}
        </span>
      </div>

      <h3 className="mb-3 text-lg font-semibold" style={{ color: '#111827' }}>
        {service.title_fr}
      </h3>
      <p className="mb-6 flex-1 text-sm leading-relaxed" style={{ color: '#6B7280' }}>
        {service.description_fr}
      </p>

      <ul className="space-y-2.5">
        {details.map((detail) => (
          <li key={detail} className="flex items-start gap-2.5 text-sm" style={{ color: '#374151' }}>
            <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: '#BF0D0D' }} />
            {detail}
          </li>
        ))}
      </ul>
    </article>
  );
}

export default function ServicesPage() {
  return (
    <div style={{ backgroundColor: '#FFFFFF' }}>
      <section className="px-4 py-16 sm:px-6 lg:px-8" style={{ backgroundColor: '#BF0D0D' }}>
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-px lg:grid-cols-5" style={{ backgroundColor: 'rgba(255,255,255,0.22)' }}>
          <div className="p-8 md:p-12 lg:col-span-3" style={{ backgroundColor: '#BF0D0D' }}>
            <div className="mb-5 flex items-center gap-2">
              <div className="h-4 w-1 bg-white" style={{ opacity: 0.7 }} />
              <span className="text-xs font-semibold uppercase tracking-widest text-white" style={{ opacity: 0.75 }}>
                Nos services
              </span>
            </div>
            <h1 className="mb-5 max-w-3xl text-4xl font-bold leading-tight text-white md:text-5xl">
              Services techniques pour votre parc d&apos;impression
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed" style={{ color: 'rgba(255,255,255,0.85)' }}>
              Vente d&apos;équipements, maintenance préventive et corrective, gestion de parc et fourniture de consommables — tout l&apos;appui technique dont votre entreprise a besoin.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/contact"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 font-semibold transition-opacity duration-150 hover:opacity-90"
                style={{ backgroundColor: '#FFFFFF', color: '#BF0D0D' }}
              >
                {CTA_MESSAGES.audit_fr}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="#services"
                className="inline-flex items-center justify-center gap-2 border px-6 py-3 font-semibold text-white transition-colors duration-150 hover:bg-white/10"
                style={{ borderColor: 'rgba(255,255,255,0.42)' }}
              >
                Explorer les offres
              </Link>
            </div>
          </div>

          <PhotoFrame
            src={PHOTO_ASSETS.printerDetail}
            alt="Imprimante multifonction professionnelle installée en environnement de bureau"
            credit={PHOTO_CREDITS.printerDetail}
            priority
            className="h-[360px] border-0 lg:col-span-2 lg:h-full"
          />
        </div>
      </section>

      <section className="border-b px-4 py-16 sm:px-6 lg:px-8" style={{ backgroundColor: '#F5F5F5', borderColor: '#E5E7EB' }}>
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-px lg:grid-cols-3" style={{ backgroundColor: '#E5E7EB' }}>
          <div className="p-8 lg:col-span-1" style={{ backgroundColor: '#FFFFFF' }}>
            <div className="mb-4 flex items-center gap-2">
              <div className="h-4 w-1" style={{ backgroundColor: '#BF0D0D' }} />
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>
                Diagnostic
              </span>
            </div>
            <h2 className="mb-4 text-2xl font-bold" style={{ color: '#111827' }}>
              La bonne offre dépend surtout de votre usage réel
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>
              Volume mensuel, nombre de services, couleur ou monochrome, criticité des documents : notre rôle est de dimensionner le parc avant de parler machine.
            </p>
          </div>
          {[
            ['01', 'Mesurer', 'Comprendre les volumes, les pannes, les urgences toner et les coûts dispersés.'],
            ['02', 'Dimensionner', 'Choisir les équipements adaptés au rythme de vos équipes et à vos contraintes.'],
            ['03', 'Exploiter', 'Installer, maintenir, approvisionner et suivre les coûts dans la durée.'],
          ].map(([step, title, text]) => (
            <div key={step} className="p-8" style={{ backgroundColor: '#FFFFFF' }}>
              <div className="mb-5 text-xs font-bold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>
                {step}
              </div>
              <h3 className="mb-2 font-semibold" style={{ color: '#111827' }}>
                {title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>
                {text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Banner — Location */}
      <section className="border-b px-4 py-8 sm:px-6 lg:px-8" style={{ backgroundColor: '#FFF5F5', borderColor: '#FECACA' }}>
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-1 h-8 flex-shrink-0" style={{ backgroundColor: '#BF0D0D' }} />
            <div>
              <p className="font-semibold text-sm" style={{ color: '#111827' }}>
                Vous cherchez à louer une imprimante ou un photocopieur ?
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#6B7280' }}>
                Découvrez nos offres de location avec coût par copie, maintenance et toner inclus.
              </p>
            </div>
          </div>
          <Link
            href="/location"
            className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-80 cursor-pointer"
            style={{ backgroundColor: '#BF0D0D' }}
          >
            Voir les offres de location <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <section id="services" className="border-b px-4 py-20 sm:px-6 lg:px-8" style={{ borderColor: '#E5E7EB' }}>
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 max-w-3xl">
            <div className="mb-4 flex items-center gap-2">
              <div className="h-4 w-1" style={{ backgroundColor: '#BF0D0D' }} />
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>
                Catalogue
              </span>
            </div>
            <h2 className="mb-3 text-3xl font-bold" style={{ color: '#111827' }}>
              Six services, organisés comme un système
            </h2>
            <p className="leading-relaxed" style={{ color: '#6B7280' }}>
              Les offres peuvent être activées séparément, mais elles prennent toute leur valeur quand elles fonctionnent ensemble.
            </p>
          </div>

          <div className="space-y-px" style={{ backgroundColor: '#E5E7EB' }}>
            {SERVICE_GROUPS.map((group) => (
              <div key={group.label} className="grid grid-cols-1 lg:grid-cols-4" style={{ backgroundColor: '#FFFFFF' }}>
                <div className="p-7 lg:border-r" style={{ borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' }}>
                  <div className="mb-4 text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>
                    {group.label}
                  </div>
                  <h3 className="text-xl font-bold" style={{ color: '#111827' }}>
                    {group.title}
                  </h3>
                </div>
                <div className="grid grid-cols-1 gap-px md:grid-cols-2 lg:col-span-3" style={{ backgroundColor: '#E5E7EB' }}>
                  {group.serviceIds.map((serviceId) => (
                    <ServiceTile key={serviceId} serviceId={serviceId} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ backgroundColor: '#BF0D0D' }}>
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px md:grid-cols-4" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
          {STATS.map(({ value, label }) => (
            <div key={label} className="px-8 py-12 text-center" style={{ backgroundColor: '#BF0D0D' }}>
              <div className="mb-1 text-4xl font-bold text-white" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {value}
              </div>
              <div className="text-xs uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.75)' }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6 lg:px-8" style={{ backgroundColor: '#F5F5F5' }}>
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-px lg:grid-cols-5" style={{ backgroundColor: '#E5E7EB' }}>
          <PhotoFrame
            src={PHOTO_ASSETS.advisoryMeeting}
            alt="Réunion de conseil autour de documents professionnels"
            credit={PHOTO_CREDITS.advisoryMeeting}
            className="h-[320px] border-0 lg:col-span-2 lg:h-full"
          />
          <div className="p-8 md:p-12 lg:col-span-3" style={{ backgroundColor: '#FFFFFF' }}>
            <div className="mb-5 flex items-center gap-2">
              <div className="h-4 w-1" style={{ backgroundColor: '#BF0D0D' }} />
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>
                Prochaine étape
              </span>
            </div>
            <h2 className="mb-4 text-3xl font-bold" style={{ color: '#111827' }}>
              Vous ne savez pas quelle solution choisir ?
            </h2>
            <p className="mb-8 max-w-2xl leading-relaxed" style={{ color: '#6B7280' }}>
              Nos conseillers analysent votre situation, clarifient vos priorités et vous proposent la formule la plus adaptée à votre parc actuel.
            </p>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-8 py-4 font-semibold text-white transition-opacity duration-150 hover:opacity-80"
              style={{ backgroundColor: '#BF0D0D' }}
            >
              {CTA_MESSAGES.audit_fr}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
