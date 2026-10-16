import type { JSX } from 'react';
import type { MergeSuggestion } from '../api/schemas';
import { useMergeAction } from '../state/queries';
import { toast, toastError } from '../ui/Toast';

/** AI merge suggestions for the notes on screen. Nothing merges without a click, and every merge can be undone. */
export function MergeSuggestions({ suggestions, visibleIds }: { suggestions: MergeSuggestion[]; visibleIds: Set<string> }): JSX.Element | null {
  const act = useMergeAction();
  const shown = suggestions.filter(s => s.state === 'open' && (visibleIds.has(s.note_id) || visibleIds.has(s.target_id)));
  if (!shown.length) return null;

  async function merge(s: MergeSuggestion) {
    try {
      await act.mutateAsync({ id: s.id, action: 'accept' });
      toast(`Merged into “${s.target_title}”.`, {
        action: { label: 'Undo', onClick: () => void act.mutateAsync({ id: s.id, action: 'undo' }).then(() => toast('Merge undone.'), toastError) },
      });
    } catch (error) {
      toastError(error);
    }
  }

  return (
    <div className="merge-suggestions">
      {shown.map(s => (
        <section key={s.id} className="merge-suggestion" aria-label={`Merge suggestion for ${s.note_title}`}>
          <p>“{s.note_title}” looks like part of “{s.target_title}”.</p>
          <p className="merge-reason">{s.reason}</p>
          <div className="merge-actions">
            <button type="button" className="primary small-button" disabled={act.isPending} onClick={() => void merge(s)}>Merge</button>
            <button type="button" className="quiet-button" disabled={act.isPending} onClick={() => void act.mutateAsync({ id: s.id, action: 'dismiss' }).catch(toastError)}>Keep separate</button>
          </div>
        </section>
      ))}
    </div>
  );
}
