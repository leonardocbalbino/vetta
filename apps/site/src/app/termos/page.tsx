import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';

export const revalidate = 3600;
export const metadata: Metadata = { title: 'Termos de uso', alternates: { canonical: '/termos' } };

export default function Termos() {
  return <LegalPage kind="terms" />;
}
