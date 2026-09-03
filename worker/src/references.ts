/**
 * As fontes que o assistente pode citar.
 *
 * É uma cópia deliberada da lista em `src/domain/coach/references.ts`: o Worker
 * é um pacote separado e não importa do frontend. Para a cópia não se afastar
 * do original, `test/references.test.ts` lê o ficheiro do frontend e falha se
 * as duas listas divergirem — que é a única forma de uma cópia se manter
 * honesta.
 *
 * O modelo recebe esta lista no prompt e a resposta é filtrada por ela: um
 * identificador que não esteja aqui é removido antes de chegar ao ecrã.
 */

export interface WorkerReference {
  id: string;
  /** Uma linha sobre o que sustenta, para o modelo saber quando citar. */
  supports: string;
}

export const REFERENCES: ReadonlyArray<WorkerReference> = [
  {
    id: 'who-2020',
    supports:
      'OMS: 150 a 300 min de atividade moderada por semana, mais reforço muscular em '
      + 'pelo menos 2 dias.',
  },
  {
    id: 'garber-2011',
    supports: 'ACSM: estrutura de uma semana de treino — frequência, intensidade, tempo e tipo.',
  },
  {
    id: 'acsm-2009',
    supports:
      'ACSM: sobrecarga progressiva, intervalos de repetições por objetivo e descanso '
      + 'entre séries.',
  },
  {
    id: 'schoenfeld-2017-volume',
    supports: 'Meta-análise: mais séries semanais por grupo muscular, mais hipertrofia.',
  },
  {
    id: 'schoenfeld-2016-frequencia',
    supports: 'Meta-análise: treinar cada grupo duas vezes por semana supera uma vez.',
  },
  {
    id: 'morton-2018',
    supports: 'Meta-análise: proteína até cerca de 1,6 g/kg/dia em treino de força.',
  },
  {
    id: 'foster-2001',
    supports: 'Carga interna de uma sessão: RPE multiplicado pelos minutos.',
  },
  {
    id: 'buist-2008',
    supports:
      'Ensaio: a regra dos 10% por semana não reduziu lesões — é prudência, não garantia.',
  },
  { id: 'watson-2015', supports: 'Consenso AASM/SRS: sete ou mais horas de sono por noite.' },
  {
    id: 'efsa-2010',
    supports: 'EFSA: cerca de 2,0 a 2,5 L de água total por dia, incluindo a dos alimentos.',
  },
];

export const REFERENCE_IDS: ReadonlySet<string> = new Set(
  REFERENCES.map((reference) => reference.id),
);
