const WIKI_PROD = 'https://stoneorbits.github.io/VortexEngine';

function isLocal() {
  return location.hostname === '127.0.0.1' || location.hostname === 'localhost';
}

function wikiBase() {
  return isLocal() ? 'http://127.0.0.1:4000/VortexEngine' : WIKI_PROD;
}

export function wikiUrl(path = '') {
  return `${wikiBase()}${path}`;
}
