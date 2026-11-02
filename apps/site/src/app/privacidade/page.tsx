import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';

export const revalidate = 3600;
export const metadata: Metadata = {
  title: 'Política de privacidade',
  alternates: { canonical: '/privacidade' },
};

export default function Privacidade() {
  return <LegalPage kind="privacy" />;
}
