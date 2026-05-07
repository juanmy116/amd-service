'use client';

import { FormEvent, useState } from 'react';

const inputClass = "w-full px-4 py-3 text-sm border focus:outline-none focus:border-red-700 transition-colors duration-150";
const inputStyle = { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB', color: '#111827' };

export default function ContactForm() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');

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

      if (!response.ok) throw new Error("Erreur lors de l'envoi");
      setSubmitted(true);
      e.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="border p-6" style={{ borderColor: '#BF0D0D', backgroundColor: 'rgba(191,13,13,0.05)' }}>
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
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="border p-4 text-sm" style={{ borderColor: '#BF0D0D', color: '#BF0D0D', backgroundColor: 'rgba(191,13,13,0.05)' }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input type="text" name="name" placeholder="Votre nom" required className={inputClass} style={inputStyle} />
        <input type="email" name="email" placeholder="Votre email" required className={inputClass} style={inputStyle} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input type="text" name="company" placeholder="Votre entreprise" required className={inputClass} style={inputStyle} />
        <input type="tel" name="phone" placeholder="Votre téléphone" required className={inputClass} style={inputStyle} />
      </div>

      <select name="needs" required className={inputClass} style={inputStyle}>
        <option value="">Sélectionnez votre besoin</option>
        <option value="rental">Location d&apos;équipements</option>
        <option value="sales">Achat d&apos;équipements</option>
        <option value="management">Gestion de parc</option>
        <option value="maintenance">Maintenance</option>
        <option value="other">Autre</option>
      </select>

      <textarea
        name="message"
        placeholder="Votre message (optionnel)"
        rows={4}
        className={inputClass}
        style={inputStyle}
      />

      <button
        type="submit"
        disabled={loading}
        className="w-full px-6 py-3 text-white font-semibold transition-opacity duration-150 hover:opacity-80 disabled:opacity-40 cursor-pointer"
        style={{ backgroundColor: '#BF0D0D' }}
      >
        {loading ? 'Envoi en cours...' : 'Envoyer mon message'}
      </button>

      <p className="text-xs text-center" style={{ color: '#9CA3AF' }}>
        Réponse garantie en moins de 24h. Sans engagement.
      </p>
    </form>
  );
}
