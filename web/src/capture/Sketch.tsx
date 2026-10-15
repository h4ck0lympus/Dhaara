import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { captureDraftStore } from '../local/drafts';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { S } from '../strings';
import { messageOf, toast } from '../ui/Toast';
import { toastRejections } from './Attachments';

export const SKETCH_UNDO_LIMIT = 12;
export const SKETCH_INK = '#d6e1be';
export type SketchTool = 'pen' | 'eraser' | 'text';

const TOOLS: { id: SketchTool; label: string; icon: 'pen' | 'eraser' | 'text' }[] = [
  { id: 'pen', label: 'Pen', icon: 'pen' },
  { id: 'eraser', label: 'Eraser', icon: 'eraser' },
  { id: 'text', label: 'Text', icon: 'text' },
];

export function pushUndo<T>(stack: T[], item: T, limit = SKETCH_UNDO_LIMIT): T[] {
  const next = [...stack, item];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

export function SketchDialog({ onClose }: { onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const undo = useRef<{ image: ImageData; inked: boolean }[]>([]);
  const drawing = useRef(false);
  const [tool, setTool] = useState<SketchTool>('pen');
  const [text, setText] = useState('');
  const [inked, setInked] = useState<boolean | null>(null);
  const [notice, setNotice] = useState('');
  const [undoCount, setUndoCount] = useState(0);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const element = canvas.current;
      const context = element?.getContext('2d');
      if (!element || !context) return;
      const rect = element.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.round(rect.width * scale);
      element.height = Math.round(rect.height * scale);
      context.scale(scale, scale);
      context.lineCap = 'round';
      context.lineJoin = 'round';
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function context2d(): CanvasRenderingContext2D | null {
    return canvas.current?.getContext('2d') ?? null;
  }

  function remember(context: CanvasRenderingContext2D) {
    const element = context.canvas;
    undo.current = pushUndo(undo.current, { image: context.getImageData(0, 0, element.width, element.height), inked: inked === true });
    setUndoCount(undo.current.length);
  }

  function point(event: PointerEvent<HTMLCanvasElement>): [number, number] {
    const rect = event.currentTarget.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const context = context2d();
    if (!context) return;
    const [x, y] = point(event);
    if (tool === 'text') {
      const value = text.trim();
      if (!value) {
        toast('Type the text first, then click where it goes.');
        return;
      }
      remember(context);
      context.globalCompositeOperation = 'source-over';
      context.fillStyle = SKETCH_INK;
      context.font = '16px Inter, sans-serif';
      context.fillText(value, x, y);
      setInked(true);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    remember(context);
    drawing.current = true;
    setInked(true);
    context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    context.strokeStyle = SKETCH_INK;
    context.lineWidth = tool === 'eraser' ? 18 : 2;
    context.beginPath();
    context.moveTo(x, y);
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = context2d();
    if (!context) return;
    const [x, y] = point(event);
    context.lineTo(x, y);
    context.stroke();
  }

  function endStroke() {
    drawing.current = false;
  }

  function onUndo() {
    const context = context2d();
    const previous = undo.current.pop();
    if (context && previous) {
      context.putImageData(previous.image, 0, 0);
      setInked(previous.inked);
    }
    setUndoCount(undo.current.length);
  }

  function onClear() {
    const context = context2d();
    if (!context) return;
    remember(context);
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    context.restore();
    setInked(false);
  }

  function onAdd() {
    const element = canvas.current;
    if (!element) return;
    if (!inked) {
      toast('Draw something first.');
      return;
    }
    if (captureDraftStore.getSnapshot().saving) {
      setNotice(S.finishingLocalSave);
      return;
    }
    setNotice('');
    setAdding(true);
    element.toBlob(async blob => {
      if (!blob) {
        setAdding(false);
        toast('The sketch could not be exported. Try again.', { tone: 'error' });
        return;
      }
      if (captureDraftStore.getSnapshot().saving) {
        setAdding(false);
        setNotice(S.finishingLocalSave);
        return;
      }
      try {
        const rejections = await captureDraftStore.addFiles([new File([blob], 'sketch.png', { type: 'image/png' })]);
        toastRejections(rejections);
        if (!rejections.length) onClose();
      } catch (error) {
        toast(messageOf(error), { tone: 'error' });
      } finally {
        setAdding(false);
      }
    }, 'image/png');
  }

  return (
    <Dialog title="A quick sketch" onRequestClose={onClose} className="sketch-dialog">
      <p className="subtle-line">Draw while you talk. Your recording continues.</p>
      <div className="sketch-tools" role="group" aria-label="Sketch tools">
        {TOOLS.map(item => (
          <button key={item.id} type="button" className="quiet-button" aria-pressed={tool === item.id} onClick={() => setTool(item.id)}>
            <Icon name={item.icon} />{item.label}
          </button>
        ))}
        {tool === 'text' && (
          <label className="sketch-text">Sketch text<input value={text} maxLength={80} onChange={event => setText(event.target.value)} /></label>
        )}
        <button type="button" className="quiet-button" onClick={onUndo} disabled={undoCount === 0}><Icon name="undo" />Undo</button>
        <button type="button" className="quiet-button" onClick={onClear}>Clear</button>
      </div>
      <canvas
        ref={canvas}
        className="sketch-canvas"
        aria-label="Drawing canvas"
        data-tool={tool}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      />
      <div className="form-actions">
        {notice && <p role="status" className="subtle-line">{notice}</p>}
        <button type="button" className="primary" onClick={onAdd} disabled={adding || inked === false}>Add to capture</button>
      </div>
    </Dialog>
  );
}
