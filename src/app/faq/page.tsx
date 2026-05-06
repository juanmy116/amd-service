'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CTA_MESSAGES } from '@/lib/constants';
import { ChevronDown, ArrowRight } from 'lucide-react';

const FAQ_ITEMS = [
  {
    category: 'Général',
    items: [
      { q: "Qu'est-ce qu'AMD Service ?", a: "AMD Service est une entreprise spécialisée dans la location, la vente et la gestion d'équipements d'impression professionnels pour les entreprises, administrations et institutions au Sénégal. Avec plus de 10 ans d'expérience, nous gérons plus de 1.200 équipements en location et 2.600+ machines sur le territoire." },
      { q: 'Où est situé AMD Service ?', a: "AMD Service est basé à Dakar, Sénégal. Nous intervenons dans toute la région de Dakar et accompagnons des clients professionnels sur l'ensemble du territoire sénégalais." },
      { q: 'Quels types de clients accompagnez-vous ?', a: "Entreprises privées, PME, grandes entreprises, administrations publiques, institutions, ONG, organisations internationales, cliniques, hôpitaux, établissements scolaires et universitaires, cabinets professionnels." },
    ],
  },
  {
    category: 'Services & équipements',
    items: [
      { q: 'Quels services proposez-vous ?', a: "Location d'équipements multifonctions (A4, A3, couleur, monochrome), vente d'équipements professionnels, gestion de parc d'impression, maintenance technique préventive et corrective, fourniture de consommables, et solutions d'impression gérée avec coût par copie." },
      { q: 'Proposez-vous des imprimantes couleur et A3 ?', a: "Oui. Notre catalogue inclut des équipements A4 et A3, en monochrome et en couleur, ainsi que des multifonctions. Nous adaptons la solution au volume et aux besoins spécifiques de votre entreprise." },
      { q: 'Le toner est-il inclus ?', a: "Le toner peut être inclus selon le contrat et le modèle de facturation choisi. Dans le cadre des solutions de gestion complète et de coût par copie, les consommables sont généralement inclus." },
    ],
  },
  {
    category: 'Modèle & contrats',
    items: [
      { q: "C'est quoi le modèle de coût par copie ?", a: "Vous payez uniquement pour ce que vous imprimez. Le tarif est fixé au départ et inclut l'utilisation de l'équipement, la maintenance et souvent les consommables. Visibilité totale sur vos dépenses, sans mauvaises surprises." },
      { q: "Est-ce du leasing ?", a: "Non. AMD Service n'est pas du leasing traditionnel. Notre solution est une location flexible avec services inclus. Vous accédez à une solution clé en main — matériel récent, maintenance, consommables et support — pour un coût mensuel maîtrisé." },
      { q: "Y a-t-il un investissement initial ?", a: "Dans le cadre de la location, il n'y a pas d'investissement lourd initial. Vous accédez à des équipements professionnels de qualité sans immobiliser votre capital." },
    ],
  },
  {
    category: 'Maintenance & support',
    items: [
      { q: 'La maintenance est-elle incluse ?', a: "Dans les offres de location et de gestion complète, la maintenance préventive et corrective est incluse. Nos techniciens interviennent pour éviter les pannes avant qu'elles surviennent." },
      { q: "Quel est le délai d'intervention ?", a: "Pour les contrats avec SLA, nous garantissons une intervention dans un délai défini — généralement entre 4h et 24h selon la criticité. Contactez-nous pour les conditions selon votre situation." },
      { q: 'Avez-vous des techniciens locaux à Dakar ?', a: "Oui. Notre équipe technique est basée à Dakar. Nous ne dépendons pas de prestataires extérieurs pour les interventions courantes." },
    ],
  },
  {
    category: 'Démarrage',
    items: [
      { q: 'Comment demander un devis ?', a: "Remplissez notre formulaire de contact en indiquant vos besoins : nombre d'équipements, type d'impression, volume mensuel approximatif et coordonnées. Un conseiller vous recontacte rapidement." },
      { q: "Proposez-vous un audit gratuit ?", a: "Oui. Nous proposons un diagnostic gratuit de votre parc d'impression pour évaluer vos besoins réels, identifier les coûts cachés et vous proposer la solution la plus adaptée. Sans engagement." },
    ],
  },
];

function AccordionItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b" style={{ borderColor: '#1E2D45' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-0 py-5 text-left transition-colors duration-150 cursor-pointer"
        aria-expanded={open}
      >
        <span className="font-medium text-white pr-8">{q}</span>
        <ChevronDown
          className="w-4 h-4 flex-shrink-0 transition-transform duration-200"
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            color: open ? '#BF0D0D' : '#64748B',
          }}
        />
      </button>
      <div
        style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows 200ms ease-out',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <p className="pb-5 text-sm leading-relaxed" style={{ color: '#94A3B8' }}>{a}</p>
        </div>
      </div>
    </div>
  );
}

export default function FAQPage() {
  return (
    <div style={{ backgroundColor: '#0B1120' }}>

      {/* Hero */}
      <section className="border-b py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#111827', borderColor: '#1E2D45' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>FAQ</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Questions fréquentes</h1>
          <p className="text-lg max-w-2xl" style={{ color: '#94A3B8' }}>
            Toutes les réponses sur AMD Service, nos solutions et nos contrats.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          {FAQ_ITEMS.map((group, gi) => (
            <div key={group.category} className={gi > 0 ? 'mt-14' : ''}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1 h-5" style={{ backgroundColor: '#BF0D0D' }} />
                <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>
                  {group.category}
                </h2>
              </div>
              <div>
                {group.items.map((item) => (
                  <AccordionItem key={item.q} q={item.q} a={item.a} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t" style={{ backgroundColor: '#111827', borderColor: '#1E2D45' }}>
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>Nous contacter</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Vous ne trouvez pas votre réponse ?</h2>
          <p className="mb-6" style={{ color: '#94A3B8' }}>Notre équipe répond à toutes vos questions spécifiques.</p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 px-6 py-3 text-white font-semibold transition-opacity duration-150 hover:opacity-80 cursor-pointer"
            style={{ backgroundColor: '#BF0D0D' }}
          >
            {CTA_MESSAGES.contact_fr} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
