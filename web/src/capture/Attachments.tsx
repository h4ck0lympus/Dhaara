import { useEffect, useState } from 'react';
import type { StoredFile } from '../local/db';
import type { FileRejection } from '../local/limits';
import { Icon } from '../ui/Icon';
import { toast } from '../ui/Toast';

export function toastRejections(rejections: FileRejection[]): void {
  for (const rejection of rejections) toast(rejection.message, { tone: 'error' });
}

type Preview = { blob: Blob; url: string };

export function Attachments({ files, onRemove }: { files: StoredFile[]; onRemove: (index: number) => void }) {
  const [previews, setPreviews] = useState<Preview[]>([]);

  useEffect(() => {
    const created = files.map(file => ({ blob: file.blob, url: URL.createObjectURL(file.blob) }));
    setPreviews(created);
    return () => created.forEach(preview => URL.revokeObjectURL(preview.url));
  }, [files]);

  if (!files.length) return null;
  return (
    <ul className="attachment-list">
      {files.map((file, index) => {
        const url = previews.find(preview => preview.blob === file.blob)?.url;
        const audio = file.blob.type.startsWith('audio/');
        return (
          <li key={`${index}-${file.name}`} className={audio ? 'attachment audio' : 'attachment'}>
            {url && (audio ? <audio src={url} controls preload="metadata" /> : <img src={url} alt={file.name} />)}
            <span className="attachment-name">{file.name}</span>
            <button type="button" className="icon-button" aria-label={`Remove ${file.name}`} onClick={() => onRemove(index)}>
              <Icon name="close" size={16} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
