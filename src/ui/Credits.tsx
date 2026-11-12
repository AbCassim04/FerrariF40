import { useLayoutEffect, useRef } from 'react';

/**
 * Attribution for the licensed body model (CC BY 4.0 requires credit, a licence link and a
 * note that it was modified), and the trademark disclaimer. Details from the model's asset
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

/**
 * The credit's height goes to `--credits-h` on the app, so the controls sit just above it
 * however many lines it wraps to.
 */
export function Credits() {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    const app = el.parentElement!;
    const observer = new ResizeObserver(() => app.style.setProperty('--credits-h', `${el.offsetHeight}px`));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <footer ref={ref} className="credits">
      <p>
        Car model:{' '}
        <a href={MODEL.source} target="_blank" rel="noreferrer">
          {MODEL.title}
        </a>{' '}
        by{' '}
        <a href={MODEL.authorUrl} target="_blank" rel="noreferrer">
          {MODEL.author}
        </a>{' '}
        (Sketchfab),{' '}
        <a href={MODEL.licenceUrl} target="_blank" rel="noreferrer">
          {MODEL.licence}
        </a>{' '}
        · modified
      </p>
      <p className="credits__disclaimer">
        Independent fan project. Not affiliated with or endorsed by Ferrari S.p.A. Ferrari and F40 are
        trademarks of Ferrari S.p.A.
      </p>
    </footer>
  );
}
