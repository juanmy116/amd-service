'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { NAVIGATION } from '@/lib/constants';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';

export default function Navigation() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b" style={{ backgroundColor: '#0B1120', borderColor: '#1E2D45' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="flex items-center cursor-pointer" onClick={() => setIsOpen(false)}>
            <Image
              src="/images/logos/logo-amd.png"
              alt="AMD Service"
              width={140}
              height={40}
              style={{ objectFit: 'contain' }}
              priority
            />
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {NAVIGATION.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-4 py-2 text-sm font-medium transition-colors duration-150 cursor-pointer"
                  style={{
                    color: active ? '#BF0D0D' : '#FFFFFF',
                    borderBottom: active ? '2px solid #BF0D0D' : '2px solid transparent',
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* CTA group */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-5 py-2 text-white text-sm font-semibold transition-opacity duration-150 hover:opacity-80 cursor-pointer"
              style={{ backgroundColor: '#BF0D0D' }}
            >
              Nous contacter
            </Link>
          </div>

          {/* Mobile Toggle */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 transition-colors cursor-pointer"
            style={{ color: '#94A3B8' }}
            aria-label={isOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
          >
            {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <div className="md:hidden border-t pb-4 pt-2" style={{ borderColor: '#1E2D45' }}>
            <div className="flex flex-col">
              {NAVIGATION.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-3 text-sm font-medium transition-colors cursor-pointer"
                    style={{
                      color: active ? '#BF0D0D' : '#FFFFFF',
                      backgroundColor: active ? '#172033' : 'transparent',
                    }}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <div className="px-4 pt-3">
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
