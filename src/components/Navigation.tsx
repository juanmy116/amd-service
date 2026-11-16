'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { NAVIGATION } from '@/lib/constants';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';

const MOBILE_MENU_ID = 'menu-principal';

export default function Navigation() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  return (
    <nav
      aria-label="Navigation principale"
      className="focus-on-dark sticky top-0 z-50 border-b"
      style={{ backgroundColor: '#0B1120', borderColor: '#1E2D45' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="flex shrink-0 items-center cursor-pointer" onClick={() => setIsOpen(false)}>
            <Image
              src="/images/logos/logo-amd.png"
              alt="AMD Service"
              width={140}
              height={40}
              style={{ objectFit: 'contain' }}
              priority
            />
          </Link>

          {/* Desktop Nav — a partir de xl: por debajo, los 7 enlaces y los dos botones no caben
              en una línea (el logo se encogía a 0 y «Nous contacter» se salía de la pantalla). */}
          <div className="hidden xl:flex items-center gap-1">
            {NAVIGATION.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 transition-colors duration-150 cursor-pointer ${
                    active
                      ? 'font-semibold text-white border-[#BF0D0D]'
                      : 'font-medium text-white/70 border-transparent hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* CTA group */}
          <div className="hidden xl:flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium whitespace-nowrap text-white border border-[#1E2D45] hover:border-[#BF0D0D] transition-colors duration-150 cursor-pointer"
            >
              Connexion
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-5 py-2 text-white text-sm font-semibold whitespace-nowrap transition-opacity duration-150 hover:opacity-80 cursor-pointer"
              style={{ backgroundColor: '#BF0D0D' }}
            >
              Nous contacter
            </Link>
          </div>

          {/* Mobile Toggle */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="xl:hidden flex h-11 w-11 items-center justify-center text-white/70 hover:text-white transition-colors duration-150 cursor-pointer"
            aria-label={isOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={isOpen}
            aria-controls={MOBILE_MENU_ID}
          >
            {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <div id={MOBILE_MENU_ID} className="xl:hidden border-t pb-4 pt-2" style={{ borderColor: '#1E2D45' }}>
            <div className="flex flex-col">
              {NAVIGATION.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={`px-4 py-3 text-sm transition-colors duration-150 cursor-pointer ${
                      active ? 'font-semibold text-white bg-[#172033]' : 'font-medium text-white/70 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <div className="px-4 pt-3 flex flex-col gap-2">
                <Link
                  href="/login"
                  onClick={() => setIsOpen(false)}
                  className="block w-full text-center px-5 py-2.5 text-white text-sm font-medium border cursor-pointer"
                  style={{ borderColor: '#1E2D45' }}
                >
                  Connexion
                </Link>
                <Link
                  href="/contact"
                  onClick={() => setIsOpen(false)}
                  className="block w-full text-center px-5 py-2.5 text-white text-sm font-semibold cursor-pointer"
                  style={{ backgroundColor: '#BF0D0D' }}
                >
                  Nous contacter
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
