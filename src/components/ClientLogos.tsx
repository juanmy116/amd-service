import fs from 'fs';
import path from 'path';
import ClientLogosDisplay from './ClientLogosDisplay';

export default function ClientLogos() {
  const dir = path.join(process.cwd(), 'public', 'images', 'logos-clientes');
  let logos: string[] = [];
  try {
    logos = fs.readdirSync(dir)
      .filter((f) => /\.(png|jpg|jpeg|webp|svg)$/i.test(f))
      .sort()
      .map((f) => `/images/logos-clientes/${f}`);
  } catch {
    logos = [];
  }

  return <ClientLogosDisplay logos={logos} />;
}
