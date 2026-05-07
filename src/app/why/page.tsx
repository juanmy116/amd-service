import Link from 'next/link';
import { CTA_MESSAGES } from '@/lib/constants';
import {
  TrendingDown, AlertCircle, Clock, Layers, BarChart3, CheckCircle, ArrowRight,
  Banknote, ShieldCheck, Printer, LayoutDashboard, Headphones, Users
} from 'lucide-react';

const PROBLEMS = [
  { icon: Banknote, title: 'Coûts imprévisibles', description: 'Achats d\'urgence de toner, réparations non planifiées et dépenses dispersées rendent le budget d\'impression incontrôlable.' },
  { icon: AlertCircle, title: 'Pannes fréquentes', description: 'Les équipements vieillissants tombent en panne au mauvais moment, paralysant les équipes et générant des pertes de productivité.' },
  { icon: Clock, title: 'Équipements obsolètes', description: 'Des machines dépassées ralentissent les workflows, consomment plus d\'encre et nécessitent davantage de maintenance.' },
  { icon: Layers, title: 'Gestion manuelle pesante', description: 'Suivi des consommables, appels aux techniciens, gestion des contrats — une charge administrative qui détourne les équipes de leur cœur de métier.' },
  { icon: BarChart3, title: 'Pas de visibilité', description: 'Sans données claires, impossible d\'identifier les postes de dépense, optimiser les usages ou négocier avec les fournisseurs.' },
];

const SOLUTIONS = [
  { icon: TrendingDown, title: 'Coût par copie transparent', description: 'Un seul prix, tout inclus. Vous savez exactement ce que vous dépensez chaque mois, sans mauvaise surprise.' },
  { icon: ShieldCheck, title: 'Maintenance préventive & corrective', description: 'Nos techniciens interviennent avant que les pannes surviennent — et rapidement en cas d\'incident.' },
  { icon: Printer, title: 'Équipements professionnels récents', description: 'Accédez à des imprimantes et multifonctions de dernière génération sans immobiliser votre capital.' },
  { icon: LayoutDashboard, title: 'Tableau de bord de consommation', description: 'Suivez votre volume d\'impression, identifiez les postes coûteux et prenez des décisions éclairées.' },
  { icon: Headphones, title: 'Un interlocuteur unique', description: 'Une équipe dédiée gère tout pour vous : équipements, maintenance, toner, support.' },
  { icon: Users, title: 'Expertise locale Dakar', description: 'Techniciens basés à Dakar, intervention rapide, connaissance du contexte sénégalais.' },
];

const COMPARISON = [
  { criteria: 'Investissement initial', achat: 'Élevé', amd: 'Zéro' },
  { criteria: 'Maintenance', achat: 'À votre charge', amd: 'Incluse' },
  { criteria: 'Toner et pièces', achat: 'À prévoir', amd: 'Inclus (selon contrat)' },
  { criteria: 'Visibilité des coûts', achat: 'Difficile', amd: 'Totale' },
  { criteria: 'Équipements récents', achat: 'Renouvellement coûteux', amd: 'Garantis' },
  { criteria: 'Flexibilité', achat: 'Faible', amd: 'Élevée' },
  { criteria: 'Support technique', achat: 'Contrat séparé', amd: 'Inclus' },
];

export default function WhyPage() {
  return (
    <div style={{ backgroundColor: '#FFFFFF' }}>

      {/* Hero — RED */}
      <section className="py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#BF0D0D' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4 bg-white" style={{ opacity: 0.7 }} />
            <span className="text-xs font-semibold uppercase tracking-widest text-white" style={{ opacity: 0.75 }}>Pourquoi AMD Service</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            De la gestion chaotique au contrôle total
          </h1>
          <p className="text-lg max-w-3xl" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Vos équipements d&apos;impression sont censés soutenir votre activité, pas la freiner.
          </p>
        </div>
      </section>

      {/* Problems — GREY */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-b" style={{ backgroundColor: '#F5F5F5', borderColor: '#E5E7EB' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>Le problème</span>
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: '#111827' }}>Les problèmes que vous connaissez</h2>
          <p className="mb-10" style={{ color: '#6B7280' }}>La gestion de l&apos;impression en interne génère des coûts cachés et des frustrations quotidiennes.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px" style={{ backgroundColor: '#E5E7EB' }}>
            {PROBLEMS.map(({ icon: Icon, title, description }) => (
              <div key={title} className="p-6" style={{ backgroundColor: '#FFFFFF' }}>
                <Icon className="w-5 h-5 mb-4" style={{ color: '#BF0D0D' }} />
                <h3 className="font-semibold mb-2" style={{ color: '#111827' }}>{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>{description}</p>
              </div>
            ))}
            <div className="p-6 hidden lg:flex flex-col items-center justify-center gap-3 text-center" style={{ backgroundColor: '#FFFFFF' }}>
              <div className="w-1 h-8 mx-auto" style={{ backgroundColor: '#BF0D0D' }} />
              <p className="text-sm font-medium" style={{ color: '#111827' }}>AMD Service transforme chaque problème en solution.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Solutions — WHITE */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-b" style={{ borderColor: '#E5E7EB' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>Notre réponse</span>
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: '#111827' }}>Ce que nous apportons</h2>
          <p className="mb-10" style={{ color: '#6B7280' }}>Une solution globale, pensée pour les entreprises au Sénégal.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px" style={{ backgroundColor: '#E5E7EB' }}>
            {SOLUTIONS.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex gap-4 p-6" style={{ backgroundColor: '#FFFFFF' }}>
                <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#BF0D0D' }} />
                <div>
                  <h3 className="font-semibold mb-1" style={{ color: '#111827' }}>{title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison — GREY */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-b" style={{ backgroundColor: '#F5F5F5', borderColor: '#E5E7EB' }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>Comparatif</span>
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: '#111827' }}>Achat direct vs AMD Service</h2>
          <p className="mb-10" style={{ color: '#6B7280' }}>Comparez objectivement avant de décider.</p>
          <div className="border overflow-hidden" style={{ borderColor: '#E5E7EB' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#BF0D0D' }}>
                  <th className="px-6 py-4 text-left font-semibold text-white">Critère</th>
                  <th className="px-6 py-4 text-center font-semibold text-white">Achat direct</th>
                  <th className="px-6 py-4 text-center font-semibold text-white">AMD Service</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row, i) => (
                  <tr key={row.criteria} style={{ backgroundColor: i % 2 === 0 ? '#FFFFFF' : '#F9FAFB', borderTop: '1px solid #E5E7EB' }}>
                    <td className="px-6 py-4 font-medium" style={{ color: '#111827' }}>{row.criteria}</td>
                    <td className="px-6 py-4 text-center" style={{ color: '#6B7280' }}>{row.achat}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: '#BF0D0D' }}>
                        <CheckCircle className="w-3.5 h-3.5" />
                        {row.amd}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA — RED */}
      <section className="py-20 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#BF0D0D' }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-1 h-4 bg-white" style={{ opacity: 0.7 }} />
            <span className="text-xs font-semibold uppercase tracking-widest text-white" style={{ opacity: 0.75 }}>Prochaine étape</span>
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">Prêt à reprendre le contrôle ?</h2>
          <p className="text-lg mb-8" style={{ color: 'rgba(255,255,255,0.85)' }}>Demandez un audit gratuit de votre parc d&apos;impression, sans engagement.</p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 px-8 py-4 font-semibold transition-opacity duration-150 hover:opacity-90 cursor-pointer"
            style={{ backgroundColor: '#FFFFFF', color: '#BF0D0D' }}
          >
            {CTA_MESSAGES.audit_fr} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

    </div>
  );
}
