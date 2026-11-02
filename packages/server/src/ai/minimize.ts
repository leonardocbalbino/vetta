/**
 * Minimização de dados de saúde antes de enviar à IA (LGPD, CLAUDE.md §8):
 * nada de nome, e-mail, telefone, documentos ou endereço; idade só em faixa;
 * textos livres passam por remoção de padrões de contato e do nome do aluno.
 */

const PATTERNS: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[e-mail]'],
  [/https?:\/\/\S+|www\.\S+/gi, '[link]'],
  // CPF, CNPJ, RG, CEP antes do telefone (formatos numéricos mais específicos).
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[documento]'],
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[documento]'],
  [/\b\d{5}-\d{3}\b/g, '[cep]'],
  [/(\+?55\s?)?(\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}\b/g, '[telefone]'],
];

export function scrubText(text: string, names: string[] = []): string {
  let out = text;
  for (const [re, label] of PATTERNS) out = out.replace(re, label);
  for (const full of names) {
    for (const part of full.split(/\s+/).filter((p) => p.length >= 3)) {
      const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), 'o aluno');
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function ageRange(birthDate: Date | null | undefined, now = new Date()): string | null {
  if (!birthDate) return null;
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = now.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birthDate.getUTCDate())) age--;
  if (age < 18) return 'menor de 18';
  if (age >= 70) return '70+';
  const lo = Math.floor(age / 10) * 10;
  return `${lo}-${lo + 9}`;
}

export interface StudentHealthInput {
  name: string;
  birthDate?: Date | null;
  sex?: string | null;
  /** Pares pergunta/resposta da anamnese mais recente. */
  anamnesis?: { question: string; answer: string }[];
  injuries?: string | null;
  loads?: {
    exerciseId: string;
    exerciseName: string;
    lastLoadKg: number | null;
    bestLoadKg: number | null;
    lastReps: string | null;
    sessions: number;
  }[];
}

export interface MinimizedStudent {
  ageRange: string | null;
  sex: string | null;
  anamnesis: { question: string; answer: string }[];
  injuries: string | null;
  loads: NonNullable<StudentHealthInput['loads']>;
}

/** Perguntas de identificação são descartadas inteiras. */
const IDENTIFYING_QUESTION =
  /nome|e-?mail|telefone|celular|whats|cpf|rg\b|documento|endere[cç]o|cep|profiss[aã]o|empresa|instagram/i;

export function minimizeStudent(input: StudentHealthInput, now = new Date()): MinimizedStudent {
  const names = [input.name];
  return {
    ageRange: ageRange(input.birthDate, now),
    sex: input.sex && input.sex !== 'UNDISCLOSED' ? input.sex : null,
    anamnesis: (input.anamnesis ?? [])
      .filter((qa) => !IDENTIFYING_QUESTION.test(qa.question) && qa.answer.trim())
      .slice(0, 60)
      .map((qa) => ({
        question: scrubText(qa.question).slice(0, 200),
        answer: scrubText(qa.answer, names).slice(0, 400),
      })),
    injuries: input.injuries ? scrubText(input.injuries, names).slice(0, 1000) : null,
    loads: (input.loads ?? []).slice(0, 40),
  };
}
