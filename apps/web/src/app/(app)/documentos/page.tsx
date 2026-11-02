'use client';

import { useMe } from '@vetta/sdk/react';
import { LockedFeature, Skeleton } from '@vetta/ui';
import { useFeature } from '@vetta/sdk/react';
import { DocumentsPanel } from '@/components/pro/student-tabs';
import { useActiveTenant } from '@/lib/session';

/** Aluno: a própria pasta de documentos (exames, plano alimentar, contratos). */
export default function MyDocuments() {
  const { tenantId } = useActiveTenant();
  const me = useMe();
  const feature = useFeature(tenantId, 'docs.student_folder');
  const linkId = me.data?.memberships.find((m) => m.tenantId === tenantId)?.studentLinkId;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl">Documentos</h1>
      <LockedFeature
        locked={feature.locked}
        loading={feature.loading}
        title="Pasta de documentos"
        description="Seu personal ainda não usa a pasta de documentos."
      >
        {linkId ? (
          <DocumentsPanel studentLinkId={linkId} staff={false} />
        ) : (
          <Skeleton className="h-32" />
        )}
      </LockedFeature>
    </div>
  );
}
