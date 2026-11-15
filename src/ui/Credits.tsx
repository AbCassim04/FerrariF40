import { useLayoutEffect, useRef, useState } from 'react';
import { useLayout } from '../state/ui';

/**
 * Attribution for the licensed body model and the 9C donor model (CC BY 4.0 requires credit, a
 * licence link and a note that it was modified), and the trademark disclaimer. Details from the model's asset
 * metadata.
 */
const MODEL = {
  title: 'Ferrari f40',
  source: 'https://sketchfab.com/3d-models/ferrari-f40-52a66c41cfcd4f999fb1b1c49bf24d70',
  author: 'Black Snow',
  authorUrl: 'https://sketchfab.com/BlackSnow02',
  licence: 'CC BY 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
};

/** 9C: wheels, brakes, badges and gauge faces from a second CC BY 4.0 model. */
const DONOR = {
  title: 'Ferrari F40 | www.vecarz.com',
  source: 'https://sketchfab.com/3d-models/ferrari-f40-wwwvecarzcom-ee082e412b0a4b2090e8492117841e95',
  author: 'Nic Cheung',
  authorUrl: 'https://sketchfab.com/heynic',
};

/**
 * Desktop: two short lines bottom-left. Phones: one small line (author, licence, "modified",
 * not affiliated) that expands to the full credit with its links on a tap. The credit's
 * height goes to `--credits-h` on the app, so the controls sit just above it.
 */
export function Credits() {
  const ref = useRef<HTMLElement>(null);
  const layout = useLayout();
  const [expanded, setExpanded] = useState(false);
  const short = layout !== 'desktop' && !expanded;
  useLayoutEffect(() => {
    const el = ref.current!;
    const app = el.parentElement!;
    const observer = new ResizeObserver(() => app.style.setProperty('--credits-h', `${el.offsetHeight}px`));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <footer ref={ref} className="credits" data-short={short || undefined} data-expanded={(layout !== 'desktop' && expanded) || undefined}>
      {short ? (
        <button type="button" className="credits__toggle" aria-expanded="false" onClick={() => setExpanded(true)}>
          Models: {MODEL.author}, {DONOR.author}, {MODEL.licence}, modified · Fan project, not affiliated with Ferrari
          <span className="credits__more" aria-hidden="true">
            ⓘ
          </span>
        </button>
      ) : (
        <>
          <p>
            Car model:{' '}
            <a href={MODEL.source} target="_blank" rel="noreferrer">
              {MODEL.title}
            </a>{' '}
            by{' '}
            <a href={MODEL.authorUrl} target="_blank" rel="noreferrer">
              {MODEL.author}
            </a>{' '}
            (Sketchfab); wheels, brakes, badges and gauges:{' '}
            <a href={DONOR.source} target="_blank" rel="noreferrer">
              {DONOR.title}
            </a>{' '}
            by{' '}
            <a href={DONOR.authorUrl} target="_blank" rel="noreferrer">
              {DONOR.author}
            </a>{' '}
            (Sketchfab); both{' '}
            <a href={MODEL.licenceUrl} target="_blank" rel="noreferrer">
              {MODEL.licence}
            </a>{' '}
            · modified
          </p>
          <p className="credits__disclaimer">
            Independent fan project. Not affiliated with or endorsed by Ferrari S.p.A. Ferrari and F40 are
            trademarks of Ferrari S.p.A.
          </p>
          {layout !== 'desktop' && (
            <button type="button" className="credits__close" aria-label="Fold the credits" onClick={() => setExpanded(false)}>
              ×
            </button>
          )}
        </>
      )}
    </footer>
  );
}
