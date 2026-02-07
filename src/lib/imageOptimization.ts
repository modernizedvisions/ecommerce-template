type ImageOptimizationOptions = {
  maxDimension: number;
  targetBytes?: number;
  quality?: number;
};

type ImageOptimizationResult = {
  file: File;
  originalBytes: number;
  optimizedBytes: number;
  didOptimize: boolean;
  usedType: string;
  hadAlpha: boolean;
};

const DEFAULT_QUALITY = 0.82;
const MIN_QUALITY = 0.6;

const isImageFile = (file: File) => file.type.startsWith('image/');

const replaceExtension = (name: string, nextExt: string) => {
  const idx = name.lastIndexOf('.');
  if (idx <= 0) return `${name}${nextExt}`;
  return `${name.slice(0, idx)}${nextExt}`;
};

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => {
    if (!canvas.toBlob) {
      resolve(null);
      return;
    }
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });

const detectAlpha = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  try {
    const data = ctx.getImageData(0, 0, width, height).data;
    const totalPixels = width * height;
    const step = Math.max(1, Math.floor(totalPixels / 10000));
    for (let i = 3; i < data.length; i += 4 * step) {
      if (data[i] < 255) return true;
    }
  } catch {
    return false;
  }
  return false;
};

const loadImageElement = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image'));
    };
    img.src = url;
  });

const loadImageBitmap = async (file: File): Promise<ImageBitmap | null> => {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    try {
      return await createImageBitmap(file);
    } catch {
      return null;
    }
  }
};

export async function optimizeImageForUpload(
  file: File,
  options: ImageOptimizationOptions
): Promise<ImageOptimizationResult> {
  if (!isImageFile(file)) {
    return {
      file,
      originalBytes: file.size,
      optimizedBytes: file.size,
      didOptimize: false,
      usedType: file.type,
      hadAlpha: false,
    };
  }

  const originalBytes = file.size;
  const bitmap = await loadImageBitmap(file);
  const image = bitmap ? null : await loadImageElement(file);
  const width = bitmap ? bitmap.width : image ? image.naturalWidth : 0;
  const height = bitmap ? bitmap.height : image ? image.naturalHeight : 0;

  if (!width || !height) {
    throw new Error('Image decode failed');
  }

  const maxDimension = Math.max(1, options.maxDimension);
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('Canvas unsupported');

  if (bitmap) {
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();
  } else if (image) {
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
  }

  const hadAlpha = detectAlpha(ctx, targetWidth, targetHeight);
  const usePng = hadAlpha;
  const outputType = usePng ? 'image/png' : 'image/jpeg';

  let quality = outputType === 'image/jpeg' ? options.quality ?? DEFAULT_QUALITY : undefined;
  let blob = await canvasToBlob(canvas, outputType, quality);
  if (!blob) throw new Error('Failed to encode image');

  if (outputType === 'image/jpeg' && options.targetBytes) {
    while (blob.size > options.targetBytes && (quality ?? DEFAULT_QUALITY) > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, (quality ?? DEFAULT_QUALITY) - 0.08);
      const next = await canvasToBlob(canvas, outputType, quality);
      if (!next) break;
      blob = next;
      if (quality === MIN_QUALITY) break;
    }
  }

  const optimizedBytes = blob.size;
  const didResize = targetWidth !== width || targetHeight !== height;
  const didConvert = outputType !== file.type;
  const didShrink = optimizedBytes < originalBytes;
  const shouldUseOptimized = didResize || didConvert || didShrink;

  if (!shouldUseOptimized) {
    return {
      file,
      originalBytes,
      optimizedBytes: originalBytes,
      didOptimize: false,
      usedType: file.type,
      hadAlpha,
    };
  }

  const nextName =
    outputType === 'image/jpeg'
      ? replaceExtension(file.name || 'upload', '.jpg')
      : replaceExtension(file.name || 'upload', '.png');
  const optimizedFile = new File([blob], nextName, { type: outputType });

  return {
    file: optimizedFile,
    originalBytes,
    optimizedBytes,
    didOptimize: true,
    usedType: outputType,
    hadAlpha,
  };
}
