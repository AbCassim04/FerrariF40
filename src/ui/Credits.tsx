import { useLayoutEffect, useRef } from 'react';

/**
 * Attribution for the licensed body model (CC BY-NC-SA 4.0 requires credit, a licence
 * link and a note that it was modified), and the trademark disclaimer. Details from the
 * model's asset metadata.
 */
const MODEL = {
  title: '2014 Ferrari LaFerrari',
  source: 'https://sketchfab.com/3d-models/2014-ferrari-laferrari-8b46fa49718647de846387ef4c1e95b3',
  author: 'Ddiaz Design',
  authorUrl: 'https://sketchfab.com/ddiaz-design',
  licence: 'CC BY-NC-SA 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
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
        Independent fan project. Not affiliated with or endorsed by Ferrari S.p.A. Ferrari and LaFerrari are
        trademarks of Ferrari S.p.A.
      </p>
    </footer>
  );
}
