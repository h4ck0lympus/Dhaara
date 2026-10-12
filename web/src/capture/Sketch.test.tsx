// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { captureDraftStore } from '../local/drafts';
import { S } from '../strings';
import { polyfillDialog } from '../ui/testing';
import { SketchDialog } from './Sketch';

beforeAll(() => {
  polyfillDialog();
  const context = {
    getImageData: () => ({}), putImageData: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
    scale: () => {}, save: () => {}, restore: () => {}, setTransform: () => {}, clearRect: () => {}, fillText: () => {},
    canvas: { width: 10, height: 10 },
  };
  HTMLCanvasElement.prototype.getContext = (() => context) as never;
  HTMLCanvasElement.prototype.setPointerCapture = () => {};
  HTMLCanvasElement.prototype.toBlob = function toBlob(callback: BlobCallback) { callback(new Blob(['x'], { type: 'image/png' })); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const add = () => screen.getByRole('button', { name: 'Add to capture' });
const stroke = () => {
  const canvas = screen.getByLabelText('Drawing canvas');
  fireEvent.pointerDown(canvas, { clientX: 1, clientY: 1, pointerId: 1 });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
};

describe('SketchDialog', () => {
  it('disables Add to capture once Undo or Clear leaves the canvas empty', () => {
    render(<SketchDialog onClose={() => {}} />);
    expect((add() as HTMLButtonElement).disabled).toBe(false);
    stroke();
    expect((add() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect((add() as HTMLButtonElement).disabled).toBe(true);
    stroke();
    expect((add() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect((add() as HTMLButtonElement).disabled).toBe(true);
  });

  it('stays open and says so while a local save is in flight', () => {
    const addFiles = vi.spyOn(captureDraftStore, 'addFiles');
    vi.spyOn(captureDraftStore, 'getSnapshot').mockReturnValue({ ...captureDraftStore.getSnapshot(), saving: true });
    const onClose = vi.fn();
    render(<SketchDialog onClose={onClose} />);
    stroke();
    fireEvent.click(add());
    expect(screen.getByRole("status").textContent).toBe(S.finishingLocalSave);
    expect(addFiles).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
