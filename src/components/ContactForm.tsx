'use client';

import { FormEvent, useState } from 'react';

const inputClass = "w-full px-4 py-3 text-sm text-white border focus:outline-none focus:border-red-700 transition-colors duration-150";
const inputStyle = { backgroundColor: '#0B1120', borderColor: '#1E2D45', color: 'white' };

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
          <h3 className="font-semibold text-white">Message reçu</h3>
        </div>
        <p className="text-sm" style={{ color: '#94A3B8' }}>
          Nous vous recontacterons dans les 24 heures.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="border p-4 text-sm" style={{ borderColor: '#BF0D0D', color: '#FDA4A4' }}>
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
        <option value="" style={{ backgroundColor: '#0B1120' }}>Sélectionnez votre besoin</option>
        <option value="rental" style={{ backgroundColor: '#0B1120' }}>Location d&apos;équipements</option>
        <option value="sales" style={{ backgroundColor: '#0B1120' }}>Achat d&apos;équipements</option>
        <option value="management" style={{ backgroundColor: '#0B1120' }}>Gestion de parc</option>
        <option value="maintenance" style={{ backgroundColor: '#0B1120' }}>Maintenance</option>
        <option value="other" style={{ backgroundColor: '#0B1120' }}>Autre</option>
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

      <p className="text-xs text-center" style={{ color: '#475569' }}>
        Réponse garantie en moins de 24h. Sans engagement.
      </p>
    </form>
  );
}
