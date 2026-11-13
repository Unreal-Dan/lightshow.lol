const WIKI_PROD = 'https://lightshow.lol/wiki';

function isLocal() {
  return location.hostname === '127.0.0.1' || location.hostname === 'localhost';
}

function wikiBase() {
  return isLocal() ? 'http://127.0.0.1:4000/wiki' : WIKI_PROD;
}

export function wikiUrl(path = '') {
  return `${wikiBase()}${path}`;
}
