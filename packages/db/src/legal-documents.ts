const DRAFT =
  '> Versão preliminar para o MVP. Revisar com assessoria jurídica antes do lançamento.\n\n';

/** Documentos legais versionados (o site exibe a versão publicada mais recente). */
export const LEGAL_DOCUMENTS: {
  kind: 'TERMS' | 'PRIVACY';
  version: string;
  title: string;
  content: string;
}[] = [
  {
    kind: 'TERMS',
    version: '2026-11',
    title: 'Termos de uso',
    content: [
      DRAFT,
      '## 1. Sobre a Vetta',
      'A Vetta é uma plataforma para personal trainers gerenciarem alunos, treinos, avaliações e cobranças.',
      '',
      '## 2. Contas',
      'Você é responsável pelas informações da sua conta e por manter sua senha em segredo.',
      '',
      '## 3. Planos',
      'Os planos e limites vigentes estão na página de preços. O teste grátis dura 14 dias, sem cartão.',
      '',
      '## 4. Uso adequado',
      'É proibido usar a Vetta para fins ilegais ou para enviar conteúdo de terceiros sem autorização.',
    ].join('\n'),
  },
  {
    kind: 'PRIVACY',
    version: '2026-11',
    title: 'Política de privacidade',
    content: [
      DRAFT,
      '## 1. Dados que tratamos',
      'Cadastro, dados de treino e, com seu consentimento específico, dados de saúde (anamnese e avaliações).',
      '',
      '## 2. Finalidade',
      'Prestar o serviço de acompanhamento de treino contratado entre você e seu personal.',
      '',
      '## 3. Seus direitos (LGPD)',
      'Você pode exportar ou excluir seus dados a qualquer momento nas configurações da conta.',
      '',
      '## 4. Fotos',
      'Removemos metadados de localização (EXIF/GPS) de todas as fotos enviadas.',
    ].join('\n'),
  },
];
