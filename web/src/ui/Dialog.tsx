import { useId, useLayoutEffect, useRef, type JSX, type MouseEvent, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Dialog({ title, onRequestClose, children, closeLabel = 'Close dialog', className = '' }: {
  title: string; onRequestClose: () => void; children: ReactNode; closeLabel?: string; className?: string;
}): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const request = useRef(onRequestClose);
  request.current = onRequestClose;

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let mounted = true;
    if (!dialog.hasAttribute('open')) dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const onCancel = (event: Event) => { event.preventDefault(); request.current(); };
    const onClose = () => { if (mounted && !dialog.open) { dialog.showModal(); request.current(); } };
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClose);
    return () => {
      mounted = false;
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
      if (dialog.hasAttribute('open')) dialog.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  function onClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    if (outside) request.current();
  }

  return (
    <dialog ref={ref} className={`dialog ${className}`.trim()} aria-labelledby={titleId} onClick={onClick}>
      <div className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" aria-label={closeLabel} onClick={() => request.current()}>
          <Icon name="close" size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
