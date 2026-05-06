import ContactForm from '@/components/ContactForm';
import { FOOTER } from '@/lib/constants';
import { MapPin, Phone, Mail, Clock, CheckCircle } from 'lucide-react';

export default function ContactPage() {
  return (
    <div style={{ backgroundColor: '#0B1120' }}>

      {/* Hero */}
      <section className="border-b py-16 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: '#111827', borderColor: '#1E2D45' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4" style={{ backgroundColor: '#BF0D0D' }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#BF0D0D' }}>Contact</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Parlons de votre projet</h1>
          <p className="text-lg max-w-2xl" style={{ color: '#94A3B8' }}>
            Réponse garantie en moins de 24h. Diagnostic gratuit, sans engagement.
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">

            {/* Form */}
            <div className="lg:col-span-2">
              <div className="border p-8" style={{ backgroundColor: '#111827', borderColor: '#1E2D45' }}>
                <h2 className="text-xl font-bold text-white mb-1">Demandez votre diagnostic gratuit</h2>
                <p className="text-sm mb-8" style={{ color: '#64748B' }}>Sans engagement. Un conseiller vous rappelle dans les 24h.</p>
                <ContactForm />
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-px" style={{ backgroundColor: '#1E2D45' }}>

              {/* Contact info */}
              <div className="p-6" style={{ backgroundColor: '#111827' }}>
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
                        <div className="text-xs uppercase tracking-widest mb-0.5" style={{ color: '#64748B' }}>{label}</div>
                        {href
                          ? <a href={href} className="text-sm text-white hover:opacity-70 transition-opacity cursor-pointer">{value}</a>
                          : <p className="text-sm text-white">{value}</p>
                        }
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Process */}
              <div className="p-6" style={{ backgroundColor: '#111827' }}>
                <div className="text-xs font-semibold uppercase tracking-widest mb-5" style={{ color: '#BF0D0D' }}>Ce qui se passe ensuite</div>
                <ul className="space-y-4">
                  {[
                    'Un conseiller vous rappelle sous 24h',
                    'Nous analysons vos besoins actuels',
                    'Vous recevez un devis personnalisé',
                    'Mise en place sans interruption',
                  ].map((step, i) => (
                    <li key={step} className="flex items-start gap-3 text-sm" style={{ color: '#94A3B8' }}>
                      <span className="font-bold flex-shrink-0" style={{ color: '#BF0D0D' }}>0{i + 1}</span>
                      {step}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Guarantees */}
              <div className="p-6" style={{ backgroundColor: '#111827' }}>
                <div className="text-xs font-semibold uppercase tracking-widest mb-5" style={{ color: '#BF0D0D' }}>Nos garanties</div>
                <ul className="space-y-3">
                  {['Audit gratuit sans engagement', 'Devis sous 24h', 'Aucun frais caché', 'Intervention locale Dakar'].map((g) => (
                    <li key={g} className="flex items-center gap-2.5 text-sm" style={{ color: '#94A3B8' }}>
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
