import Link from 'next/link';
import { SERVICES, CTA_MESSAGES } from '@/lib/constants';
import { Printer, ShoppingCart, BarChart3, Wrench, Package, CreditCard, CheckCircle, ArrowRight } from 'lucide-react';

const SERVICE_ICONS = [Printer, ShoppingCart, BarChart3, Wrench, Package, CreditCard];

const SERVICE_DETAILS: Record<string, string[]> = {
  rental: ['Équipements A4 et A3', 'Couleur et monochrome', 'Multifonctions (impression, copie, scan)', 'Sans investissement initial'],
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

export default function ServicesPage() {
  return (
    <div style={{ backgroundColor: '#FFFFFF' }}>

      {/* Hero — RED */}
      <section className="py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#BF0D0D' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4 bg-white" style={{ opacity: 0.7 }} />
            <span className="text-xs font-semibold uppercase tracking-widest text-white" style={{ opacity: 0.75 }}>Nos services</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Solutions d&apos;impression professionnelle
          </h1>
          <p className="text-lg max-w-2xl" style={{ color: 'rgba(255,255,255,0.85)' }}>
            De la location à la gestion complète, tout ce dont vous avez besoin pour maîtriser votre parc d&apos;impression.
          </p>
        </div>
      </section>

      {/* Services Grid — GREY */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-b" style={{ backgroundColor: '#F5F5F5', borderColor: '#E5E7EB' }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px" style={{ backgroundColor: '#E5E7EB' }}>
            {SERVICES.map((service, i) => {
              const Icon = SERVICE_ICONS[i] || Printer;
              const details = SERVICE_DETAILS[service.id] || [];
              return (
                <div key={service.id} className="service-card flex flex-col p-8">
                  <Icon className="w-5 h-5 mb-6" style={{ color: '#BF0D0D' }} />
                  <h3 className="text-lg font-semibold mb-3" style={{ color: '#111827' }}>{service.title_fr}</h3>
                  <p className="text-sm leading-relaxed mb-6" style={{ color: '#6B7280' }}>{service.description_fr}</p>

                  <ul className="space-y-2.5 flex-1">
                    {details.map((d) => (
                      <li key={d} className="flex items-start gap-2.5 text-sm" style={{ color: '#374151' }}>
                        <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#BF0D0D' }} />
                        {d}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-8 pt-6 border-t" style={{ borderColor: '#E5E7EB' }}>
                    <Link
                      href="/contact"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold transition-opacity duration-150 hover:opacity-70 cursor-pointer"
                      style={{ color: '#BF0D0D' }}
                    >
                      Demander un devis <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Stats — RED */}
      <section style={{ backgroundColor: '#BF0D0D' }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
            {STATS.map(({ value, label }) => (
              <div key={label} className="px-8 py-12 text-center" style={{ backgroundColor: '#BF0D0D' }}>
                <div className="text-4xl font-bold mb-1 text-white" style={{ fontFamily: 'Poppins, sans-serif' }}>{value}</div>
                <div className="text-xs uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.75)' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA — GREY */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-b" style={{ backgroundColor: '#F5F5F5', borderColor: '#E5E7EB' }}>
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>Prochaine étape</span>
          </div>
          <h2 className="text-3xl font-bold mb-3" style={{ color: '#111827' }}>
            Vous ne savez pas quelle solution choisir ?
          </h2>
          <p className="mb-8" style={{ color: '#6B7280' }}>
            Nos conseillers analysent votre situation et vous proposent la formule la plus adaptée.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 px-8 py-4 text-white font-semibold transition-opacity duration-150 hover:opacity-80 cursor-pointer"
            style={{ backgroundColor: '#BF0D0D' }}
          >
            {CTA_MESSAGES.audit_fr} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

    </div>
  );
}
