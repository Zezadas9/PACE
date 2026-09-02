/**
 * PACE — o filtro que corre antes de qualquer resposta.
 *
 * O assistente não diagnostica e não trata. Quando a mensagem tem sinais de um
 * problema clínico, a resposta certa é dizer isso e encaminhar — não é uma
 * versão mais cuidadosa do conselho de treino.
 *
 * Os termos abaixo são propositadamente amplos. Um falso positivo custa uma
 * frase a mais a mandar procurar ajuda; um falso negativo custa muito mais.
 */

export type SafetyLevel = 'none' | 'clinical' | 'emergency';

export interface SafetyVerdict {
  level: SafetyLevel;
  /** O termo que disparou, para a resposta poder ser específica. */
  trigger: string | null;
  message: string;
}

/** Sinais que pedem ajuda imediata, não uma consulta marcada. */
const EMERGENCY = [
  'dor no peito', 'dor de peito', 'aperto no peito', 'falta de ar', 'desmaio', 'desmaiei',
  'perdi os sentidos', 'sangue', 'nao consigo respirar', 'não consigo respirar',
  'batimento irregular', 'palpitacoes', 'palpitações', 'dormencia num lado',
  'dormência num lado', 'fala arrastada',
];

/** Sinais de que a resposta pertence a um profissional de saúde. */
const CLINICAL = [
  'lesao', 'lesão', 'lesionado', 'lesionei', 'rompi', 'rotura', 'fratura', 'fraturei',
  'entorse', 'torci', 'dor', 'doi', 'dói', 'inflama', 'tendinite', 'hernia', 'hérnia',
  'ciatica', 'ciática', 'cirurgia', 'operado', 'fisioterapia', 'medicamento', 'medicacao',
  'medicação', 'comprimidos', 'diabetes', 'hipertensao', 'hipertensão', 'tensao alta',
  'tensão alta', 'gravida', 'grávida', 'gravidez', 'tonturas', 'tontura', 'enjoos',
  'febre', 'anemia', 'tiroide', 'tiroide', 'distúrbio alimentar', 'disturbio alimentar',
  'anorexia', 'bulimia', 'depressao', 'depressão', 'ansiedade severa',
];

function normalize(message: string): string {
  return message.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function screen(message: string): SafetyVerdict {
  const text = normalize(message);

  const urgent = EMERGENCY.find((term) => text.includes(term));
  if (urgent) {
    return {
      level: 'emergency',
      trigger: urgent,
      message:
        'Isto pode ser urgente e eu não tenho como avaliar. Se estás a sentir isso agora, '
        + 'liga 112 ou dirige-te a um serviço de urgência. Não faço recomendações de '
        + 'treino nem de alimentação enquanto isto não estiver visto.',
    };
  }

  const clinical = CLINICAL.find((term) => text.includes(term));
  if (clinical) {
    return {
      level: 'clinical',
      trigger: clinical,
      message:
        'Isto é terreno clínico e eu não sou o sítio certo: não diagnostico nem prescrevo. '
        + 'Fala com o teu médico ou com um fisioterapeuta — com um exame e o teu historial, '
        + 'a resposta deles vale muito mais do que qualquer coisa que eu calcule daqui. '
        + 'Posso ajudar com o resto quando quiseres.',
    };
  }

  return { level: 'none', trigger: null, message: '' };
}

/**
 * Limites que nenhuma sugestão ultrapassa, mesmo que o utilizador peça.
 *
 * Não são números de uma diretriz: são travões de bom senso para o caso em que
 * alguém escreve "quero correr 30 km no sábado" sem nunca ter corrido.
 */
export const LIMITS = {
  /** Aumento máximo de volume semanal proposto de uma semana para a outra. */
  weeklyVolumeIncrease: 0.1,
  /** Sessões de corrida por semana num plano de iniciação. */
  maxRunSessionsPerWeek: 4,
  /** Séries semanais por grupo muscular acima das quais se avisa. */
  weeklySetsCaution: 22,
  /** Dias de treino seguidos sem descanso antes de avisar. */
  maxConsecutiveTrainingDays: 6,
} as const;
