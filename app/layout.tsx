import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Financia',
  description: 'Controle financeiro pessoal com ingestao automatica via e-mail',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
