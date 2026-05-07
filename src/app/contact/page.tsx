import type { Metadata } from 'next';
import ContactForm from '@/components/ContactForm';
import { FOOTER } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Contact — AMD Service',
  description: 'Contactez AMD Service pour un diagnostic gratuit de votre parc d\'impression. Réponse garantie sous 24h. Basés à Dakar, Sénégal.',
};
import { MapPin, Phone, Mail, Clock, CheckCircle } from 'lucide-react';

export default function ContactPage() {
  return (
    <div style={{ backgroundColor: '#FFFFFF' }}>

      {/* Hero — RED */}
      <section className="py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#BF0D0D' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4 bg-white" style={{ opacity: 0.7 }} />
            <span className="text-xs font-semibold uppercase tracking-widest text-white" style={{ opacity: 0.75 }}>Contact</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Parlons de votre projet</h1>
          <p className="text-lg max-w-2xl" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Réponse garantie en moins de 24h. Diagnostic gratuit, sans engagement.
          </p>
        </div>
      </section>

      {/* Content — GREY */}
      <section className="py-20 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#F5F5F5' }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* Form */}
            <div className="lg:col-span-2">
              <div className="border p-8" style={{ backgroundColor: '#FFFFFF', borderColor: '#E5E7EB' }}>
                <h2 className="text-xl font-bold mb-1" style={{ color: '#111827' }}>Demandez votre diagnostic gratuit</h2>
                <p className="text-sm mb-8" style={{ color: '#6B7280' }}>Sans engagement. Un conseiller vous rappelle dans les 24h.</p>
                <ContactForm />
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-px" style={{ backgroundColor: '#E5E7EB' }}>

              {/* Contact info */}
              <div className="p-6" style={{ backgroundColor: '#FFFFFF' }}>
                <div className="text-xs font-semibold uppercase tracking-widest mb-5" style={{ color: '#BF0D0D' }}>Informations</div>
                <div className="space-y-5">
                  {[
                    { icon: MapPin, label: 'Localisation', value: `${FOOTER.address_fr}, Sénégal` },
                    { icon: Phone, label: 'Téléphone', value: FOOTER.phone, href: `tel:${FOOTER.phone}` },
                    { icon: Mail, label: 'Email', value: FOOTER.email, href: `mailto:${FOOTER.email}` },
                    { icon: Clock, label: 'Délai de réponse', value: 'Moins de 24 heures' },
                  ].map(({ icon: Icon, label, value, href }) => (
                    <div key={label} className="flex items-start gap-3">
                      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#BF0D0D' }} />
                      <div>
                        <div className="text-xs uppercase tracking-widest mb-0.5" style={{ color: '#9CA3AF' }}>{label}</div>
                        {href
                          ? <a href={href} className="text-sm font-medium transition-opacity hover:opacity-70 cursor-pointer" style={{ color: '#111827' }}>{value}</a>
                          : <p className="text-sm font-medium" style={{ color: '#111827' }}>{value}</p>
                        }
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Process */}
              <div className="p-6" style={{ backgroundColor: '#FFFFFF' }}>
                <div className="text-xs font-semibold uppercase tracking-widest mb-5" style={{ color: '#BF0D0D' }}>Ce qui se passe ensuite</div>
                <ul className="space-y-4">
                  {[
                    'Un conseiller vous rappelle sous 24h',
                    'Nous analysons vos besoins actuels',
                    'Vous recevez un devis personnalisé',
                    'Mise en place sans interruption',
                  ].map((step, i) => (
                    <li key={step} className="flex items-start gap-3 text-sm" style={{ color: '#374151' }}>
                      <span className="font-bold flex-shrink-0" style={{ color: '#BF0D0D' }}>0{i + 1}</span>
                      {step}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Guarantees */}
              <div className="p-6" style={{ backgroundColor: '#FFFFFF' }}>
                <div className="text-xs font-semibold uppercase tracking-widest mb-5" style={{ color: '#BF0D0D' }}>Nos garanties</div>
                <ul className="space-y-3">
                  {['Audit gratuit sans engagement', 'Devis sous 24h', 'Aucun frais caché', 'Intervention locale Dakar'].map((g) => (
                    <li key={g} className="flex items-center gap-2.5 text-sm" style={{ color: '#374151' }}>
                      <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#BF0D0D' }} />
                      {g}
                    </li>
                  ))}
                </ul>
              </div>

            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
