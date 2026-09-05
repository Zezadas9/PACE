/**
 * Preparar uma fotografia ou um ficheiro para a IA.
 *
 * A câmara de um telemóvel dá ficheiros de vários megabytes, e nenhum deles
 * precisa de atravessar a rede: uma fotografia de comida ou de um plano de
 * treino lê-se perfeitamente a 1024 px. Reduzir aqui é o que torna o envio
 * possível — e é também o que impede o pedido de rebentar o limite do backend.
 *
 * PDFs vão como estão: recomprimir um PDF é estragar-lhe o texto.
 */

import type { AssistantAttachment } from '../../platform/types';

/** O lado maior depois de reduzir. Chega para ler um rótulo ou uma tabela. */
const MAX_SIDE = 1024;
const JPEG_QUALITY = 0.82;

/** O que o modelo consegue ler. */
export const ACCEPTED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
];

export const MAX_INPUT_BYTES = 12 * 1024 * 1024;
export const MAX_PDF_BYTES = 2 * 1024 * 1024;

export class AttachmentError extends Error {}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new AttachmentError('não consegui ler o ficheiro'));
    reader.readAsDataURL(file);
  });
}

const base64Of = (dataUrl: string): string => dataUrl.slice(dataUrl.indexOf(',') + 1);

/** Reduz uma imagem, mantendo as proporções. Devolve JPEG. */
async function shrink(file: File): Promise<{ data: string; mediaType: string }> {
  const dataUrl = await readAsDataUrl(file);

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new AttachmentError('não consegui abrir a imagem'));
    element.src = dataUrl;
  });

  const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
  // Uma imagem já pequena não ganha nada em ser recomprimida: perde.
  if (scale === 1 && file.size <= 700 * 1024) {
    return { data: base64Of(dataUrl), mediaType: file.type };
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new AttachmentError('este dispositivo não consegue reduzir a imagem');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return {
    data: base64Of(canvas.toDataURL('image/jpeg', JPEG_QUALITY)),
    mediaType: 'image/jpeg',
  };
}

/** De um ficheiro escolhido pelo utilizador para o que segue no pedido. */
export async function prepare(file: File): Promise<AssistantAttachment> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new AttachmentError('Só consigo ler imagens e PDFs.');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new AttachmentError('Esse ficheiro é grande de mais.');
  }

  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF_BYTES) {
      throw new AttachmentError('Esse PDF é grande de mais. Tenta uma parte dele.');
    }
    const dataUrl = await readAsDataUrl(file);
    return {
      kind: 'document',
      mediaType: 'application/pdf',
      data: base64Of(dataUrl),
      name: file.name,
    };
  }

  const { data, mediaType } = await shrink(file);
  return { kind: 'image', mediaType, data, name: file.name };
}
