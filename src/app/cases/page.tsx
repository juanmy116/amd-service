import Link from 'next/link';
import { CTA_MESSAGES } from '@/lib/constants';
import { Building2, Landmark, Factory, Globe, CheckCircle, ArrowRight } from 'lucide-react';

const CASES = [
  {
    id: 'enterprise',
    Icon: Building2,
    sector: 'Grande entreprise',
    title: 'Coûts réduits de 35% en 6 mois',
    problem: 'Une grande entreprise de Dakar gérait 40 imprimantes en interne. Les pannes fréquentes, les achats d\'urgence de toner et les interventions non planifiées généraient des dépenses incontrôlables.',
    solution: 'AMD Service a remplacé l\'ensemble du parc par des équipements récents, mis en place un contrat de coût par copie avec maintenance incluse et un système de suivi centralisé.',
    results: ['Réduction de 35% des coûts', 'Zéro arrêt de production', 'Visibilité totale sur la consommation', 'Équipe IT libérée'],
    metric: '−35%', metricLabel: 'de coûts',
  },
  {
    id: 'administration',
    Icon: Landmark,
    sector: 'Administration publique',
    title: 'Continuité garantie pour 500 agents',
    problem: 'Une administration dakaroise avec 500 agents subissait des pannes régulières. La gestion de prestataires multiples était complexe et les délais d\'intervention inacceptables.',
    solution: 'Déploiement d\'un parc unifié avec contrat SLA incluant intervention sous 4h, fourniture de consommables et reporting mensuel pour la direction financière.',
    results: ['Intervention en moins de 4 heures', 'Interlocuteur unique', 'Reporting mensuel', 'Aucune rupture en 12 mois'],
    metric: '<4h', metricLabel: 'd\'intervention',
  },
  {
    id: 'pme',
    Icon: Factory,
    sector: 'PME en croissance',
    title: 'Modernisation sans investissement initial',
    problem: 'Une PME en pleine croissance avait besoin de moderniser ses équipements mais ne souhaitait pas immobiliser du capital. Les pannes impactaient la facturation clients.',
    solution: 'Location de 8 multifonctions A3/A4 couleur avec toner inclus et maintenance garantie. Mensualités fixes, aucun apport initial.',
    results: ['Zéro investissement initial', 'Équipements de dernière génération', 'Coût mensuel prévisible', 'Productivité immédiate'],
    metric: '0 FCFA', metricLabel: 'd\'investissement',
  },
  {
    id: 'ngo',
    Icon: Globe,
    sector: 'ONG internationale',
    title: 'Conformité budgétaire pour les bailleurs',
    problem: 'Une ONG internationale devait justifier chaque dépense auprès de ses bailleurs. La gestion de l\'impression était opaque avec des achats non tracés.',
    solution: 'Contrat tout inclus avec coût par copie, reporting détaillé par département et facture unique mensuelle alignée avec les exigences des bailleurs.',
    results: ['Reporting par département', 'Facture unique justifiable', 'Conformité bailleurs', 'Réduction de 28%'],
    metric: '−28%', metricLabel: 'économisé',
  },
];

export default function CasesPage() {
  return (
    <div style={{ backgroundColor: '#FFFFFF' }}>

      {/* Hero — RED */}
      <section className="py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#BF0D0D' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4 bg-white" style={{ opacity: 0.7 }} />
            <span className="text-xs font-semibold uppercase tracking-widest text-white" style={{ opacity: 0.75 }}>Cas d&apos;usage</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Des résultats concrets</h1>
          <p className="text-lg max-w-3xl" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Comment des entreprises et organisations au Sénégal ont transformé leur gestion de l&apos;impression avec AMD Service.
          </p>
        </div>
      </section>

      {/* Cases — GREY */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-b" style={{ backgroundColor: '#F5F5F5', borderColor: '#E5E7EB' }}>
        <div className="max-w-7xl mx-auto space-y-px" style={{ backgroundColor: '#E5E7EB' }}>
          {CASES.map((c) => (
            <div key={c.id} className="grid grid-cols-1 lg:grid-cols-4" style={{ backgroundColor: '#FFFFFF' }}>

              {/* Metric */}
              <div className="flex flex-col items-center justify-center p-10 border-b lg:border-b-0 lg:border-r text-center" style={{ borderColor: '#E5E7EB' }}>
                <c.Icon className="w-6 h-6 mb-4" style={{ color: '#BF0D0D' }} />
                <div className="text-4xl font-bold mb-1" style={{ color: '#111827', fontFamily: 'Poppins, sans-serif' }}>{c.metric}</div>
                <div className="text-xs uppercase tracking-widest mb-3" style={{ color: '#9CA3AF' }}>{c.metricLabel}</div>
                <div className="text-xs font-semibold px-2 py-1 text-white" style={{ backgroundColor: '#BF0D0D' }}>{c.sector}</div>
              </div>

              {/* Content */}
              <div className="lg:col-span-3 p-10">
                <h2 className="text-xl font-bold mb-6" style={{ color: '#111827' }}>{c.title}</h2>
                <div className="grid md:grid-cols-2 gap-8 mb-8">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#9CA3AF' }}>Le problème</div>
                    <p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>{c.problem}</p>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#9CA3AF' }}>La solution</div>
                    <p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>{c.solution}</p>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#9CA3AF' }}>Résultats</div>
                  <div className="grid grid-cols-2 gap-2">
                    {c.results.map((r) => (
                      <div key={r} className="flex items-start gap-2 text-sm" style={{ color: '#374151' }}>
                        <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#BF0D0D' }} />
                        {r}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          ))}
        </div>
      </section>

      {/* CTA — RED */}
      <section className="py-20 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#BF0D0D' }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-1 h-4 bg-white" style={{ opacity: 0.7 }} />
            <span className="text-xs font-semibold uppercase tracking-widest text-white" style={{ opacity: 0.75 }}>Votre diagnostic</span>
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">Quelle économie pour votre entreprise ?</h2>
          <p className="text-lg mb-8" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Chaque situation est unique. Contactez-nous pour un diagnostic personnalisé et gratuit.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-8 py-4 font-semibold transition-opacity duration-150 hover:opacity-90 cursor-pointer"
              style={{ backgroundColor: '#FFFFFF', color: '#BF0D0D' }}
            >
              {CTA_MESSAGES.audit_fr} <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/services"
              className="btn-ghost inline-flex items-center gap-2 px-8 py-4 font-semibold border cursor-pointer text-white"
              style={{ borderColor: 'rgba(255,255,255,0.4)' }}
            >
              Voir nos services
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
