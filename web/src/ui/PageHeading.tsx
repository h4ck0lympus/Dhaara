import type { JSX, ReactNode } from 'react';

export function PageHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }): JSX.Element {
  return (
    <div className={action ? 'page-heading heading-with-action' : 'page-heading'} data-quiet="">
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      {action}
    </div>
  );
}
