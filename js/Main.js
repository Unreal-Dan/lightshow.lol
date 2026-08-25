/* js/Main.js */

const BUILD_KEY = '__build_id__';
const RELOAD_FLAG = '__reloaded_for_build__';

function isMobile() {
  const ua = navigator.userAgent || navigator.vendor || window.opera || '';
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
}

async function reloadIfNewBuild() {
  try {
    const res = await fetch(`/build.txt?v=__CACHE_BUSTER__`, { cache: 'no-store' });
    if (!res.ok) return false;

    const build = (await res.text()).trim();
    if (!build) return false;

    const prev = localStorage.getItem(BUILD_KEY);
    if (!prev || prev !== build) {
      localStorage.setItem(BUILD_KEY, build);
      sessionStorage.setItem(RELOAD_FLAG, build);
      location.reload();
      return true;
    }

    return false;
  } catch (_) {
    return false;
  }
}

if (!(await reloadIfNewBuild())) {
  // Dev servers (python http.server etc.) send no cache headers and deploys
  // substitute __CACHE_BUSTER__ textually — so bust aggressively when running
  // locally and leave the placeholder for the deploy script otherwise.
  const localDev = ['localhost', '127.0.0.1', ''].includes(location.hostname);
  const bust = localDev ? `dev${Date.now()}` : '__CACHE_BUSTER__';
  if (isMobile()) {
    await import(`./mobile/VortexEditorMobile.js?v=${bust}`);
  } else {
    await import(`./VortexEditor.js?v=${bust}`);
  }
}
