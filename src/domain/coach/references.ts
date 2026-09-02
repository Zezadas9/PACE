/**
 * PACE — o que a IA pode citar.
 *
 * A regra desta camada: **não inventar evidência.** Cada recomendação que fala
 * de treino, recuperação, alimentação ou performance aponta para uma entrada
 * daqui, ou diz explicitamente que é uma convenção prática sem evidência forte.
 * Não há meio-termo — uma afirmação sem fonte e sem aviso é uma invenção.
 *
 * As entradas são referências reais, escritas por extenso para poderem ser
 * verificadas. Quando uma futura camada de IA generativa entrar, escreve neste
 * mesmo formato: uma resposta sem `references` nem `caveat` não passa.
 */

export type EvidenceGrade =
  /** Recomendação de uma organização de saúde ou sociedade científica. */
  | 'guideline'
  /** Revisão sistemática ou meta-análise. */
  | 'meta_analysis'
  /** Ensaio controlado aleatorizado. */
  | 'rct'
  /** Estudo observacional ou metodológico. */
  | 'study';

export interface Reference {
  id: string;
  authors: string;
  year: number;
  title: string;
  source: string;
  grade: EvidenceGrade;
  /** O que esta referência sustenta, em uma frase. */
  supports: string;
  url: string;
}

export const REFERENCES: ReadonlyArray<Reference> = [
  {
    id: 'who-2020',
    authors: 'Organização Mundial de Saúde',
    year: 2020,
    title: 'WHO guidelines on physical activity and sedentary behaviour',
    source: 'OMS, Genebra',
    grade: 'guideline',
    supports:
      'Adultos: 150 a 300 min de atividade aeróbia moderada por semana (ou 75 a 150 '
      + 'vigorosa), mais reforço muscular em pelo menos 2 dias.',
    url: 'https://www.who.int/publications/i/item/9789240015128',
  },
  {
    id: 'garber-2011',
    authors: 'Garber CE, Blissmer B, Deschenes MR, et al.',
    year: 2011,
    title:
      'Quantity and Quality of Exercise for Developing and Maintaining Cardiorespiratory, '
      + 'Musculoskeletal, and Neuromotor Fitness in Apparently Healthy Adults',
    source: 'Medicine & Science in Sports & Exercise 43(7):1334-1359 (ACSM Position Stand)',
    grade: 'guideline',
    supports: 'Estrutura de uma semana de treino: frequência, intensidade, tempo e tipo.',
    url: 'https://doi.org/10.1249/MSS.0b013e318213fefb',
  },
  {
    id: 'acsm-2009',
    authors: 'Ratamess NA, Alvar BA, Evetoch TK, et al.',
    year: 2009,
    title: 'Progression Models in Resistance Training for Healthy Adults',
    source: 'Medicine & Science in Sports & Exercise 41(3):687-708 (ACSM Position Stand)',
    grade: 'guideline',
    supports:
      'Sobrecarga progressiva, intervalos de repetições por objetivo e descanso entre '
      + 'séries em exercícios multiarticulares.',
    url: 'https://doi.org/10.1249/MSS.0b013e3181915670',
  },
  {
    id: 'schoenfeld-2017-volume',
    authors: 'Schoenfeld BJ, Ogborn D, Krieger JW',
    year: 2017,
    title:
      'Dose-response relationship between weekly resistance training volume and increases '
      + 'in muscle mass: a systematic review and meta-analysis',
    source: 'Journal of Sports Sciences 35(11):1073-1082',
    grade: 'meta_analysis',
    supports:
      'Mais séries semanais por grupo muscular associam-se a mais hipertrofia, com '
      + 'ganhos claros a partir de cerca de 10 séries por semana.',
    url: 'https://doi.org/10.1080/02640414.2016.1210197',
  },
  {
    id: 'schoenfeld-2016-frequencia',
    authors: 'Schoenfeld BJ, Ogborn D, Krieger JW',
    year: 2016,
    title:
      'Effects of Resistance Training Frequency on Measures of Muscle Hypertrophy: '
      + 'A Systematic Review and Meta-Analysis',
    source: 'Sports Medicine 46(11):1689-1697',
    grade: 'meta_analysis',
    supports:
      'Treinar cada grupo muscular pelo menos duas vezes por semana supera uma vez, '
      + 'com o mesmo volume total.',
    url: 'https://doi.org/10.1007/s40279-016-0543-8',
  },
  {
    id: 'morton-2018',
    authors: 'Morton RW, Murphy KT, McKellar SR, et al.',
    year: 2018,
    title:
      'A systematic review, meta-analysis and meta-regression of the effect of protein '
      + 'supplementation on resistance training-induced gains in muscle mass and strength',
    source: 'British Journal of Sports Medicine 52(6):376-384',
    grade: 'meta_analysis',
    supports:
      'Em treino de força, os benefícios da proteína estabilizam por volta de '
      + '1,6 g por kg de peso por dia.',
    url: 'https://doi.org/10.1136/bjsports-2017-097608',
  },
  {
    id: 'foster-2001',
    authors: 'Foster C, Florhaug JA, Franklin J, et al.',
    year: 2001,
    title: 'A new approach to monitoring exercise training',
    source: 'Journal of Strength and Conditioning Research 15(1):109-115',
    grade: 'study',
    supports:
      'Carga interna de uma sessão estimada por RPE multiplicado pela duração em minutos.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/11708692/',
  },
  {
    id: 'buist-2008',
    authors: 'Buist I, Bredeweg SW, van Mechelen W, et al.',
    year: 2008,
    title:
      'No effect of a graded training program on the number of running-related injuries '
      + 'in novice runners: a randomized controlled trial',
    source: 'The American Journal of Sports Medicine 36(1):33-39',
    grade: 'rct',
    supports:
      'A regra dos 10% por semana não reduziu lesões neste ensaio: progredir devagar é '
      + 'prudência, não uma garantia demonstrada.',
    url: 'https://doi.org/10.1177/0363546507307505',
  },
  {
    id: 'watson-2015',
    authors: 'Watson NF, Badr MS, Belenky G, et al.',
    year: 2015,
    title:
      'Recommended Amount of Sleep for a Healthy Adult: A Joint Consensus Statement of the '
      + 'American Academy of Sleep Medicine and Sleep Research Society',
    source: 'SLEEP 38(6):843-844',
    grade: 'guideline',
    supports: 'Adultos: sete ou mais horas de sono por noite, de forma regular.',
    url: 'https://doi.org/10.5665/sleep.4716',
  },
  {
    id: 'efsa-2010',
    authors: 'EFSA Panel on Dietetic Products, Nutrition and Allergies',
    year: 2010,
    title: 'Scientific Opinion on Dietary Reference Values for water',
    source: 'EFSA Journal 8(3):1459',
    grade: 'guideline',
    supports:
      'Ingestão adequada de água total: cerca de 2,0 L/dia para mulheres e 2,5 L/dia '
      + 'para homens, contando a água dos alimentos.',
    url: 'https://doi.org/10.2903/j.efsa.2010.1459',
  },
];

export function referenceById(id: string): Reference | undefined {
  return REFERENCES.find((reference) => reference.id === id);
}

/** Só devolve as que existem: uma citação partida seria uma invenção silenciosa. */
export function referencesByIds(ids: string[]): Reference[] {
  return ids
    .map((id) => referenceById(id))
    .filter((reference): reference is Reference => reference != null);
}

export function citation(reference: Reference): string {
  return `${reference.authors} (${reference.year}). ${reference.title}. ${reference.source}.`;
}
