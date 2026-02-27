import type { DemoImageAsset } from './types';

export type LocalImageAsset = DemoImageAsset;

const nowIso = () => new Date().toISOString();

const makeLocalImageId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `demo_img_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  return `demo_img_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export function createLocalImageAssets(files: File[]): LocalImageAsset[] {
  return files.map((file) => ({
    id: makeLocalImageId(),
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    objectUrl: URL.createObjectURL(file),
    createdAt: nowIso(),
  }));
}

export function createLocalImageAsset(file: File): LocalImageAsset {
  return createLocalImageAssets([file])[0];
}

export function revokeLocalImageAsset(asset: Pick<LocalImageAsset, 'objectUrl'> | null | undefined): void {
  if (asset?.objectUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(asset.objectUrl);
  }
}
