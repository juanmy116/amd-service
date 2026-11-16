'use client';

import { FormEvent, useState } from 'react';
import { FOOTER } from '@/lib/constants';

// 16 px en móvil: por debajo, iOS amplía la página al tocar un campo.
const fieldClass = 'field text-base sm:text-sm';
const labelClass = 'mb-1.5 block text-sm font-medium';
const labelStyle = { color: '#374151' };

export default function ContactForm() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(false);

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name'),
      email: formData.get('email'),
      company: formData.get('company'),
      phone: formData.get('phone'),
      needs: formData.get('needs'),
      message: formData.get('message'),
    };

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error('contact_failed');
      setSubmitted(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div role="status" className="border p-6" style={{ borderColor: '#BF0D0D', backgroundColor: 'rgba(191,13,13,0.05)' }}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1 h-5" style={{ backgroundColor: '#BF0D0D' }} />
          <h3 className="font-semibold" style={{ color: '#111827' }}>Message reçu</h3>
        </div>
        <p className="text-sm" style={{ color: '#6B7280' }}>
          Nous vous recontacterons dans les 24 heures.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div role="alert" className="border p-4 text-sm" style={{ borderColor: '#BF0D0D', color: '#BF0D0D', backgroundColor: 'rgba(191,13,13,0.05)' }}>
          Votre message n&apos;a pas pu être envoyé. Réessayez dans un instant, ou contactez-nous
          directement au{' '}
          <a href={`tel:${FOOTER.phone}`} className="font-semibold underline whitespace-nowrap">{FOOTER.phone}</a>
          {' '}ou à{' '}
          <a href={`mailto:${FOOTER.email}`} className="font-semibold underline">{FOOTER.email}</a>.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label htmlFor="name" className={labelClass} style={labelStyle}>Nom</label>
          <input id="name" type="text" name="name" autoComplete="name" required className={fieldClass} />
        </div>
        <div>
          <label htmlFor="email" className={labelClass} style={labelStyle}>Email</label>
          <input id="email" type="email" name="email" autoComplete="email" required className={fieldClass} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label htmlFor="company" className={labelClass} style={labelStyle}>Entreprise</label>
          <input id="company" type="text" name="company" autoComplete="organization" required className={fieldClass} />
        </div>
        <div>
          <label htmlFor="phone" className={labelClass} style={labelStyle}>Téléphone</label>
          <input id="phone" type="tel" name="phone" autoComplete="tel" required className={fieldClass} />
        </div>
      </div>

      <div>
        <label htmlFor="needs" className={labelClass} style={labelStyle}>Votre besoin</label>
        <select id="needs" name="needs" required defaultValue="" className={fieldClass}>
          <option value="" disabled>Sélectionnez votre besoin</option>
          <option value="rental">Location d&apos;équipements</option>
          <option value="sales">Achat d&apos;équipements</option>
          <option value="management">Gestion de parc</option>
          <option value="maintenance">Maintenance</option>
          <option value="other">Autre</option>
        </select>
      </div>

      <div>
        <label htmlFor="message" className={labelClass} style={labelStyle}>
          Message <span className="font-normal" style={{ color: '#6B7280' }}>(optionnel)</span>
        </label>
        <textarea id="message" name="message" rows={4} className={fieldClass} />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full px-6 py-3 text-white font-semibold transition-opacity duration-150 hover:opacity-80 disabled:opacity-40 cursor-pointer"
        style={{ backgroundColor: '#BF0D0D' }}
      >
        {loading ? 'Envoi en cours...' : 'Envoyer mon message'}
      </button>

      <p className="text-xs text-center" style={{ color: '#6B7280' }}>
        Réponse garantie en moins de 24h. Sans engagement.
      </p>
    </form>
  );
}
