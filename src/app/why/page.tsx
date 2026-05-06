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
    <div style={{ backgroundColor: '#0B1120' }}>

      {/* Hero */}
      <section className="border-b py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#111827', borderColor: '#1E2D45' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>Pourquoi AMD Service</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            De la gestion chaotique au contrôle total
          </h1>
          <p className="text-lg max-w-3xl" style={{ color: '#94A3B8' }}>
            Vos équipements d&apos;impression sont censés soutenir votre activité, pas la freiner.
          </p>
        </div>
      </section>

      {/* Problems */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-b" style={{ borderColor: '#1E2D45' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>Le problème</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Les problèmes que vous connaissez</h2>
          <p className="mb-10" style={{ color: '#64748B' }}>La gestion de l&apos;impression en interne génère des coûts cachés et des frustrations quotidiennes.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px" style={{ backgroundColor: '#1E2D45' }}>
            {PROBLEMS.map(({ icon: Icon, title, description }) => (
              <div key={title} className="p-6" style={{ backgroundColor: '#111827' }}>
                <Icon className="w-5 h-5 mb-4" style={{ color: '#BF0D0D' }} />
                <h3 className="font-semibold text-white mb-2">{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#64748B' }}>{description}</p>
              </div>
            ))}
            {/* Filler to complete grid */}
            <div className="p-6 hidden lg:flex flex-col items-center justify-center gap-3 text-center" style={{ backgroundColor: '#111827' }}>
              <div className="w-1 h-8 mx-auto" style={{ backgroundColor: '#BF0D0D' }} />
              <p className="text-sm font-medium text-white">AMD Service transforme chaque problème en solution.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Solutions */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-b" style={{ borderColor: '#1E2D45' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>Notre réponse</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Ce que nous apportons</h2>
          <p className="mb-10" style={{ color: '#64748B' }}>Une solution globale, pensée pour les entreprises au Sénégal.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px" style={{ backgroundColor: '#1E2D45' }}>
            {SOLUTIONS.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex gap-4 p-6" style={{ backgroundColor: '#111827' }}>
                <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#BF0D0D' }} />
                <div>
                  <h3 className="font-semibold text-white mb-1">{title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: '#64748B' }}>{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-b" style={{ borderColor: '#1E2D45' }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>Comparatif</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Achat direct vs AMD Service</h2>
          <p className="mb-10" style={{ color: '#64748B' }}>Comparez objectivement avant de décider.</p>
          <div className="border overflow-hidden" style={{ borderColor: '#1E2D45' }}>
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
                  <tr key={row.criteria} style={{ backgroundColor: i % 2 === 0 ? '#111827' : '#0B1120', borderTop: '1px solid #1E2D45' }}>
                    <td className="px-6 py-4 font-medium text-white">{row.criteria}</td>
                    <td className="px-6 py-4 text-center" style={{ color: '#64748B' }}>{row.achat}</td>
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

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#111827' }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>Prochaine étape</span>
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">Prêt à reprendre le contrôle ?</h2>
          <p className="text-lg mb-8" style={{ color: '#94A3B8' }}>Demandez un audit gratuit de votre parc d&apos;impression, sans engagement.</p>
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
