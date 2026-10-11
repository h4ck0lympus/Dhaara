import type { JSX } from 'react';
import { COPY } from '../copy';
import { OfflineNotice } from '../shell/OfflineNotice';
import { PageHeading } from '../ui/PageHeading';

export function NotesScreen(): JSX.Element {
  return <section className="notes-page"><PageHeading title={COPY.notes.title} subtitle={COPY.notes.subtitle} /><OfflineNotice /></section>;
}
