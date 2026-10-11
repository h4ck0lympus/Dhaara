import type { JSX } from 'react';
import { COPY } from '../copy';
import { OfflineNotice } from '../shell/OfflineNotice';
import { PageHeading } from '../ui/PageHeading';

export function CaptureScreen(): JSX.Element {
  return <section className="capture-page"><PageHeading title={COPY.capture.title} subtitle={COPY.capture.subtitle} /><OfflineNotice /></section>;
}
