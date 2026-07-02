function isLocal() {
  return location.hostname === '127.0.0.1' || location.hostname === 'localhost';
}

export function communityUrl(path = '') {
  const base = isLocal() ? 'http://localhost:3000' : 'https://lightshow.lol';
  return `${base}${path}`;
}
