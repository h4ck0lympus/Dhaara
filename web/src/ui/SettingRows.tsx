import { useId, type JSX, type ReactNode } from 'react';

export function Row({ label, hint, id, htmlFor, children }: { label: string; hint?: ReactNode; id: string; htmlFor?: string; children: ReactNode }): JSX.Element {
  const Label = htmlFor ? 'label' : 'span';
  return (
    <div className="setting-row">
      <div className="setting-label"><Label id={`${id}-label`} htmlFor={htmlFor}>{label}</Label>{hint && <span id={`${id}-hint`}>{hint}</span>}</div>
      {children}
    </div>
  );
}

export function Switch({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (next: boolean) => void }): JSX.Element {
  const id = useId();
  return (
    <Row label={label} hint={hint} id={id}>
      <button type="button" className="switch" role="switch" aria-labelledby={`${id}-label`} aria-describedby={hint ? `${id}-hint` : undefined} aria-checked={checked} onClick={() => onChange(!checked)}><span /></button>
    </Row>
  );
}

export function Segmented<T extends string>({ label, hint, value, options, onChange }: { label: string; hint?: string; value: T; options: [T, string][]; onChange: (next: T) => void }): JSX.Element {
  const id = useId();
  return (
    <Row label={label} hint={hint} id={id}>
      <div className="segmented" role="group" aria-labelledby={`${id}-label`} aria-describedby={hint ? `${id}-hint` : undefined}>
        {options.map(([option, text]) => <button type="button" key={option} aria-pressed={value === option} onClick={() => { if (value !== option) onChange(option); }}>{text}</button>)}
      </div>
    </Row>
  );
}
