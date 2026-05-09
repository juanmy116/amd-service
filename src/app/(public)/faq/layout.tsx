import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FAQ — AMD Service',
  description: 'Toutes les réponses sur AMD Service : location d\'équipements, maintenance, coût par copie, contrats et délais d\'intervention à Dakar, Sénégal.',
};

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
