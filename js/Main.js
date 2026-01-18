function isMobile() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  if (/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
    return true;
  }
  return window.innerWidth < 1200;
}

if (isMobile()) {
    await import('./mobile/VortexEditorMobile.js?v=__CACHE_BUSTER__');
} else {
    await import('./VortexEditor.js?v=__CACHE_BUSTER__');
}

