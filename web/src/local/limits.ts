import { S } from '../strings';
import type { StoredFile } from './db';

export const FOLDER_MAX = 240;
export const MAX_FILES = 12;
export const MAX_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 60 * 1024 * 1024;
export const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/mpeg'] as const;
export const ACCEPT_ATTR = ALLOWED_MIME.join(',');
export type RejectionCode = 'too-many' | 'too-large' | 'total-too-large' | 'unsupported-type';
export type FileRejection = { code: RejectionCode; name: string; message: string };

const ALLOWED: ReadonlySet<string> = new Set(ALLOWED_MIME);

export function validateFiles(existing: StoredFile[], incoming: File[]): { accepted: StoredFile[]; rejections: FileRejection[] } {
  const accepted: StoredFile[] = [];
  const rejections: FileRejection[] = [];
  let total = existing.reduce((sum, file) => sum + file.blob.size, 0);
  for (const file of incoming) {
    const name = file.name || 'visual.png';
    if (existing.length + accepted.length >= MAX_FILES) {
      rejections.push({ code: 'too-many', name, message: S.tooManyFiles });
      break;
    }
    if (file.size > MAX_FILE_BYTES) {
      rejections.push({ code: 'too-large', name, message: S.fileTooLarge(name) });
      continue;
    }
    if (!ALLOWED.has(file.type.split(';')[0])) {
      rejections.push({ code: 'unsupported-type', name, message: S.unsupportedType });
      continue;
    }
    if (total + file.size >= MAX_TOTAL_BYTES) {
      rejections.push({ code: 'total-too-large', name, message: S.totalTooLarge });
      continue;
    }
    total += file.size;
    accepted.push({ name, blob: file });
  }
  return { accepted, rejections };
}
