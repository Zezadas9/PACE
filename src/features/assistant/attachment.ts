/**
 * Preparar fotografias, vídeos e ficheiros para a IA.
 *
 * A câmara de um telemóvel dá ficheiros de vários megabytes, e nenhum deles
 * precisa de atravessar a rede: uma fotografia de comida ou de um plano de
 * treino lê-se perfeitamente a 1024 px. Reduzir aqui é o que torna o envio
 * possível — e é também o que impede o pedido de rebentar o limite do backend.
 *
 * O modelo não vê vídeo. De um vídeo tiram-se alguns fotogramas espalhados pela
 * duração, e seguem como imagens marcadas como tal — o que chega para ler um
 * horário filmado, um quadro de treino ou uma prateleira de supermercado.
 *
 * PDFs vão como estão: recomprimir um PDF é estragar-lhe o texto.
 *
 * O nome de uma foto ou de um vídeo não sai daqui. "IMG_4821.PNG" não diz nada
 * a ninguém — no ecrã aparece "Foto" ou "Vídeo", e o servidor nem o recebe.
 * O nome de um documento fica: "horario.pdf" diz o que o ficheiro é.
 */

import { createId } from '../../core/utils/id';
import type { AssistantAttachment } from '../../platform/types';

/** O lado maior depois de reduzir. Chega para ler um rótulo ou uma tabela. */
const MAX_SIDE = 1024;
const FRAME_SIDE = 768;
const JPEG_QUALITY = 0.82;
const FRAME_QUALITY = 0.75;

/** Quantos fotogramas se tiram de cada vídeo. */
export const VIDEO_FRAMES = 4;

/** Quantas coisas se juntam a uma mensagem, e quantas partes podem somar. */
export const MAX_ITEMS = 6;
export const MAX_PARTS = 12;

/**
 * O total que atravessa a rede, em base64.
 *
 * O servidor aceita 8 MB por pedido; fica folga para o contexto e o histórico.
 */
export const MAX_TOTAL_CHARS = 6 * 1024 * 1024;

export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
export const MAX_PDF_BYTES = 2 * 1024 * 1024;
export const MAX_TEXT_BYTES = 200 * 1024;

/** O que o seletor deixa escolher: a galeria inteira, PDFs e texto. */
export const ACCEPT = 'image/*,video/*,application/pdf,text/plain,text/csv,.csv,.txt';

/** As imagens que o modelo lê sem conversão. As outras (HEIC, por exemplo) passam a JPEG. */
const MODEL_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export class AttachmentError extends Error {}

export type PendingKind = 'photo' | 'video' | 'file';

/** Uma coisa escolhida pelo utilizador, pronta a seguir com a mensagem. */
export interface PendingAttachment {
  id: string;
  kind: PendingKind;
  /** O que o ecrã mostra: "Foto", "Vídeo", ou o nome do ficheiro. */
  label: string;
  /** Uma miniatura, quando há imagem. */
  preview: string | null;
  /** O que segue no pedido. Um vídeo são vários fotogramas. */
  parts: AssistantAttachment[];
}

/* --- Etiquetas e limites (puros) ------------------------------------------------ */

export function labelFor(kind: PendingKind, fileName: string): string {
  if (kind === 'photo') return 'Foto';
  if (kind === 'video') return 'Vídeo';
  return fileName.trim() || 'Ficheiro';
}

/** O resumo que fica escrito na conversa: "2 fotos, 1 vídeo e horario.pdf". */
export function describePending(items: Array<Pick<PendingAttachment, 'kind' | 'label'>>): string {
  const fotos = items.filter((item) => item.kind === 'photo').length;
  const videos = items.filter((item) => item.kind === 'video').length;
  const partes = [
    fotos ? (fotos === 1 ? '1 foto' : `${fotos} fotos`) : null,
    videos ? (videos === 1 ? '1 vídeo' : `${videos} vídeos`) : null,
    ...items.filter((item) => item.kind === 'file').map((item) => item.label),
  ].filter((parte): parte is string => parte !== null);

  if (partes.length <= 1) return partes[0] ?? '';
  return `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
}

/** O que está mal num conjunto de anexos, ou null quando cabe tudo. */
export function limitProblem(items: Array<Pick<PendingAttachment, 'parts'>>): string | null {
  if (items.length > MAX_ITEMS) return `Só consigo juntar ${MAX_ITEMS} coisas de cada vez.`;
  const partes = items.reduce((total, item) => total + item.parts.length, 0);
  if (partes > MAX_PARTS) {
    return 'Isso é demasiado para uma só mensagem. Tira um vídeo ou algumas fotos.';
  }
  const tamanho = items.reduce(
    (total, item) => total + item.parts.reduce((soma, parte) => soma + parte.data.length, 0),
    0,
  );
  if (tamanho > MAX_TOTAL_CHARS) return 'Os anexos juntos são grandes de mais. Tira um ou dois.';
  return null;
}

/** De que espécie é um ficheiro, ou null se não é coisa que se leia. */
export function kindOf(type: string, name: string): PendingKind | null {
  const tipo = type.toLowerCase();
  if (tipo.startsWith('image/')) return 'photo';
  if (tipo.startsWith('video/')) return 'video';
  if (tipo === 'application/pdf' || /\.pdf$/i.test(name)) return 'file';
  // Alguns telemóveis entregam um CSV sem tipo, ou como folha de Excel.
  if (tipo.startsWith('text/') || /\.(csv|txt)$/i.test(name)) return 'file';
  return null;
}

/* --- Ler ficheiros (precisa do browser) ----------------------------------------- */

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new AttachmentError('Não consegui ler o ficheiro.'));
    reader.readAsDataURL(file);
  });
}

const base64Of = (dataUrl: string): string => dataUrl.slice(dataUrl.indexOf(',') + 1);

function drawScaled(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxSide: number,
  quality: number,
): string {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new AttachmentError('Este aparelho não consegue preparar a imagem.');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return base64Of(canvas.toDataURL('image/jpeg', quality));
}

/** Reduz uma imagem, mantendo as proporções. */
async function shrink(file: File): Promise<{ data: string; mediaType: string }> {
  const dataUrl = await readAsDataUrl(file);

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new AttachmentError('Não consegui abrir essa foto.'));
    element.src = dataUrl;
  });

  const readable = MODEL_IMAGE_TYPES.includes(file.type.toLowerCase());
  const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
  // Uma imagem já pequena, num formato que o modelo lê, não ganha nada em ser
  // recomprimida: perde.
  if (readable && scale === 1 && file.size <= 700 * 1024) {
    return { data: base64Of(dataUrl), mediaType: file.type.toLowerCase() };
  }
  return {
    data: drawScaled(image, image.width, image.height, MAX_SIDE, JPEG_QUALITY),
    mediaType: 'image/jpeg',
  };
}

/** Espera por um evento de um vídeo, com prazo. */
function waitFor(video: HTMLVideoElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (): void => { cleanup(); resolve(); };
    const fail = (): void => { cleanup(); reject(new AttachmentError('Não consegui ler esse vídeo.')); };
    const timer = window.setTimeout(fail, timeoutMs);
    const cleanup = (): void => {
      window.clearTimeout(timer);
      video.removeEventListener(event, done);
      video.removeEventListener('error', fail);
    };
    video.addEventListener(event, done, { once: true });
    video.addEventListener('error', fail, { once: true });
  });
}

/**
 * Alguns fotogramas de um vídeo, espalhados pela duração.
 *
 * O vídeo não é lido para a memória: o browser abre-o a partir do ficheiro e
 * salta para cada instante. Os fotogramas saem do meio de cada troço, e não das
 * pontas, que num vídeo feito ao telemóvel são quase sempre o dedo a carregar
 * no botão.
 */
async function videoFrames(file: File, count: number): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  try {
    const loaded = waitFor(video, 'loadeddata', 12_000);
    video.src = url;
    video.load();
    await loaded;

    if (!video.videoWidth || !video.videoHeight) {
      throw new AttachmentError('Esse vídeo não tem imagem.');
    }

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const instants = duration > 0
      ? Array.from({ length: count }, (_, index) => (duration * (index + 0.5)) / count)
      : [0];

    const frames: string[] = [];
    for (const instant of instants) {
      if (Math.abs(video.currentTime - instant) > 0.05) {
        const seeked = waitFor(video, 'seeked', 8_000);
        video.currentTime = instant;
        await seeked;
      }
      const frame = drawScaled(video, video.videoWidth, video.videoHeight, FRAME_SIDE, FRAME_QUALITY);
      // Um vídeo sem índice de procura devolve o mesmo fotograma para instantes
      // diferentes. Repetido, não acrescenta nada à leitura — só custa.
      if (frames[frames.length - 1] !== frame) frames.push(frame);
    }
    return frames;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** De um ficheiro escolhido pelo utilizador para o que segue com a mensagem. */
export async function prepare(file: File): Promise<PendingAttachment> {
  const kind = kindOf(file.type, file.name);
  if (!kind) {
    throw new AttachmentError('Só consigo ler fotos, vídeos, PDFs e ficheiros de texto.');
  }
  const id = createId();

  if (kind === 'photo') {
    if (file.size > MAX_PHOTO_BYTES) throw new AttachmentError('Essa foto é grande de mais.');
    const { data, mediaType } = await shrink(file);
    return {
      id,
      kind,
      label: labelFor(kind, file.name),
      preview: `data:${mediaType};base64,${data}`,
      parts: [{ kind: 'image', mediaType, data, name: null, origin: 'photo', frame: null }],
    };
  }

  if (kind === 'video') {
    if (file.size > MAX_VIDEO_BYTES) throw new AttachmentError('Esse vídeo é grande de mais.');
    const frames = await videoFrames(file, VIDEO_FRAMES);
    return {
      id,
      kind,
      label: labelFor(kind, file.name),
      preview: `data:image/jpeg;base64,${frames[0]}`,
      parts: frames.map((data, index) => ({
        kind: 'image' as const,
        mediaType: 'image/jpeg',
        data,
        name: null,
        origin: 'video' as const,
        frame: { index: index + 1, of: frames.length },
      })),
    };
  }

  const isPdf = file.type.toLowerCase() === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) {
    if (file.size > MAX_PDF_BYTES) {
      throw new AttachmentError('Esse PDF é grande de mais. Tenta uma parte dele.');
    }
    return {
      id,
      kind,
      label: labelFor(kind, file.name),
      preview: null,
      parts: [{
        kind: 'document',
        mediaType: 'application/pdf',
        data: base64Of(await readAsDataUrl(file)),
        name: file.name.slice(0, 120),
        origin: 'file',
        frame: null,
      }],
    };
  }

  if (file.size > MAX_TEXT_BYTES) {
    throw new AttachmentError('Esse ficheiro de texto é grande de mais.');
  }
  const csv = file.type.toLowerCase() === 'text/csv' || /\.csv$/i.test(file.name);
  return {
    id,
    kind,
    label: labelFor(kind, file.name),
    preview: null,
    parts: [{
      kind: 'text',
      mediaType: csv ? 'text/csv' : 'text/plain',
      data: base64Of(await readAsDataUrl(file)),
      name: file.name.slice(0, 120),
      origin: 'file',
      frame: null,
    }],
  };
}
