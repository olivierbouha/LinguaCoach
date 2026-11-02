/**
 * image.js — Préparation des photos avant envoi à l'IA : décodage, réduction (côté max), JPEG.
 * Rien n'est conservé : l'aperçu est une URL d'objet révoquée à la fermeture de l'écran.
 */
export const MAX_PHOTOS = 6;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

const toBase64 = async (blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

/** Dimensions après réduction (le plus grand côté ≤ maxSide, jamais d'agrandissement). */
export function fitSize(w, h, maxSide = 1600) {
  const s = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

/** @returns {Promise<{mimeType:'image/jpeg', base64:string, width:number, height:number, previewUrl:string, name:string}>} */
export async function fileToJpeg(file, { maxSide = 1600, quality = 0.85 } = {}) {
  if (!file.type.startsWith('image/')) throw new Error('Ce fichier n\'est pas une image.');
  if (file.size > MAX_FILE_BYTES) throw new Error('Image trop volumineuse (15 Mo maximum).');
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error('Image illisible par ce navigateur (essayez JPEG ou PNG).'); }
  const { width, height } = fitSize(bmp.width, bmp.height, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, width, height); // fond blanc (PNG transparents)
  g.drawImage(bmp, 0, 0, width, height);
  bmp.close?.();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  if (!blob) throw new Error('Conversion de l\'image impossible.');
  return { mimeType: 'image/jpeg', base64: await toBase64(blob), width, height, previewUrl: URL.createObjectURL(blob), name: file.name || 'photo' };
}
