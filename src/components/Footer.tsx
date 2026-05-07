import Link from 'next/link';
import Image from 'next/image';
import { NAVIGATION, FOOTER } from '@/lib/constants';
import { MapPin, Phone, Mail } from 'lucide-react';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer style={{ backgroundColor: '#0B1120', borderTop: '1px solid #1E2D45' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8">

        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">

          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="inline-flex mb-5 cursor-pointer">
              <Image
                src="/images/logos/logo-amd.png"
                alt="AMD Service"
                width={120}
                height={34}
                style={{ objectFit: 'contain' }}
              />
            </Link>
            <p className="text-sm leading-relaxed text-slate-400">
              Location, vente et gestion d&apos;équipements d&apos;impression professionnels à Dakar, Sénégal.
            </p>
          </div>

          {/* Nav */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest mb-5 text-slate-100">Navigation</div>
            <ul className="space-y-3">
              {NAVIGATION.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm font-medium text-slate-500 hover:text-slate-100 transition-colors duration-150 cursor-pointer"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Services */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest mb-5 text-slate-100">Services</div>
            <ul className="space-y-3">
              {['Location d\'équipements', 'Vente', 'Maintenance', 'Gestion de parc', 'Impression gérée'].map((item) => (
                <li key={item}>
                  <Link
                    href="/services"
                    className="text-sm font-medium text-slate-500 hover:text-slate-100 transition-colors duration-150 cursor-pointer"
                  >
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest mb-5 text-slate-100">Contact</div>
            <ul className="space-y-4">
              <li className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#BF0D0D' }} />
                <span className="text-sm font-medium text-slate-400">{FOOTER.address_fr}, Sénégal</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 flex-shrink-0" style={{ color: '#BF0D0D' }} />
                <a
                  href={`tel:${FOOTER.phone}`}
                  className="text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors duration-150 cursor-pointer"
                >
                  {FOOTER.phone}
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 flex-shrink-0" style={{ color: '#BF0D0D' }} />
                <a
                  href={`mailto:${FOOTER.email}`}
                  className="text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors duration-150 cursor-pointer"
                >
                  {FOOTER.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="pt-8 flex flex-col md:flex-row justify-between items-center gap-4" style={{ borderTop: '1px solid #1E2D45' }}>
          <p className="text-xs text-slate-600">
            © {currentYear} AMD Service. Tous droits réservés.
          </p>
          <div className="flex gap-6">
            {['Confidentialité', 'Mentions légales'].map((item) => (
              <a
                key={item}
                href="#"
                className="text-xs text-slate-600 hover:text-slate-400 transition-colors duration-150 cursor-pointer"
              >
                {item}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
