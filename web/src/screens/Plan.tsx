import type { JSX } from 'react';
import { COPY } from '../copy';
import { OfflineNotice } from '../shell/OfflineNotice';
import { PageHeading } from '../ui/PageHeading';

export function PlanScreen(): JSX.Element {
  return <section className="plan-page"><PageHeading title={COPY.plan.title} subtitle={COPY.plan.subtitle} /><OfflineNotice /></section>;
}
