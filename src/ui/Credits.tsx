/**
 * Attribution for the licensed body model (CC BY-NC-SA 4.0 requires credit, a licence
 * link and a note that it was modified). Details from the model's asset metadata.
 */
const MODEL = {
  title: '2014 Ferrari LaFerrari',
  source: 'https://sketchfab.com/3d-models/2014-ferrari-laferrari-8b46fa49718647de846387ef4c1e95b3',
  author: 'Ddiaz Design',
  authorUrl: 'https://sketchfab.com/ddiaz-design',
  licence: 'CC BY-NC-SA 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
};

export function Credits() {
  return (
    <p className="credits">
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
  );
}
