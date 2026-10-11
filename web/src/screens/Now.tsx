import type { JSX } from 'react';
import { COPY, greeting } from '../copy';
import { OfflineNotice } from '../shell/OfflineNotice';
import { useSnapshot } from '../state/queries';
import { PageHeading } from '../ui/PageHeading';

export function NowScreen(): JSX.Element {
  const name = useSnapshot().data?.settings.display_name ?? '';
  return <div className="now-page"><PageHeading title={greeting(new Date(), name)} subtitle={COPY.tagline} /><OfflineNotice /></div>;
}
