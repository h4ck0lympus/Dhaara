// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ui/Toast', () => ({ toast: vi.fn() }));

import { toast } from '../ui/Toast';
import { Attachments, toastRejections } from './Attachments';

let created: string[] = [];
let revoked: string[] = [];

beforeEach(() => {
  created = [];
  revoked = [];
  Object.assign(URL, {
    createObjectURL: vi.fn(() => {
      const url = `blob:test/${created.length + 1}`;
      created.push(url);
      return url;
    }),
    revokeObjectURL: vi.fn((url: string) => {
      revoked.push(url);
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const image = { name: 'diagram.png', blob: new Blob(['png'], { type: 'image/png' }) };
const audio = { name: 'voice.webm', blob: new Blob(['webm'], { type: 'audio/webm' }) };

describe('Attachments', () => {
  it('renders images and audio with their names and a labelled remove button', () => {
    const onRemove = vi.fn();
    const { container } = render(<Attachments files={[image, audio]} onRemove={onRemove} />);
    expect(screen.getByRole('img', { name: 'diagram.png' }).getAttribute('src')).toBe('blob:test/1');
    expect(container.querySelector('audio')?.getAttribute('src')).toBe('blob:test/2');
    expect(screen.getByText('voice.webm')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove voice.webm' }));
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it('revokes every object URL it created when it unmounts', () => {
    const { unmount } = render(<Attachments files={[image, audio]} onRemove={() => {}} />);
    expect(created).toHaveLength(2);
    unmount();
    expect([...revoked].sort()).toEqual([...created].sort());
  });

  it('revokes the previous URLs when the file list changes', () => {
    const { rerender } = render(<Attachments files={[image]} onRemove={() => {}} />);
    rerender(<Attachments files={[image, audio]} onRemove={() => {}} />);
    expect(revoked).toEqual(['blob:test/1']);
    expect(screen.getByRole('img', { name: 'diagram.png' }).getAttribute('src')).toBe('blob:test/2');
  });

  it('renders nothing for an empty list', () => {
    const { container } = render(<Attachments files={[]} onRemove={() => {}} />);
    expect(container.firstChild).toBeNull();
    expect(created).toEqual([]);
  });
});

describe('toastRejections', () => {
  it('gives each rejection its own error toast, in order', () => {
    toastRejections([
      { code: 'too-large', name: 'a.png', message: 'a.png exceeds 32 MB.' },
      { code: 'unsupported-type', name: 'b.txt', message: 'Use a PNG, JPEG or WebP image, or a WAV, Ogg, WebM, MP4 or MP3 recording.' },
    ]);
    expect(vi.mocked(toast).mock.calls).toEqual([
      ['a.png exceeds 32 MB.', { tone: 'error' }],
      ['Use a PNG, JPEG or WebP image, or a WAV, Ogg, WebM, MP4 or MP3 recording.', { tone: 'error' }],
    ]);
  });

  it('shows nothing for an empty list', () => {
    toastRejections([]);
    expect(toast).not.toHaveBeenCalled();
  });
});
