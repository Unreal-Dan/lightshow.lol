/* js/Main.js */

const BUILD_KEY = '__build_id__';
const RELOAD_FLAG = '__reloaded_for_build__';

function isMobile() {
  const ua = navigator.userAgent || navigator.vendor || window.opera || '';
  if (/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua)) return true;
  return window.innerWidth < 1200;
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
  if (isMobile()) {
    await import(`./mobile/VortexEditorMobile.js?v=__CACHE_BUSTER__`);
  } else {
    await import(`./VortexEditor.js?v=__CACHE_BUSTER__`);
  }
}
