/* js/mobile/ConnStatus.js */

function _grabRefs(rootEl) {
  return {
    root: rootEl,
    deviceImg: rootEl.querySelector('#m-conn-status-device-img'),
    title: rootEl.querySelector('#m-conn-status-title'),
    subtitle: rootEl.querySelector('#m-conn-status-subtitle'),
  };
}

function _getOrInitState(editor) {
  if (!editor._connStatus) {
    editor._connStatus = {
      status: 'disconnected', // 'connected' | 'connecting' | 'disconnected' | 'error'
      title: '',
      subtitle: '',
      deviceType: null,
      transport: 'ble',
    };
  }
  if (editor._connStatusLastError === undefined) editor._connStatusLastError = null;
  if (editor._connStatusEl === undefined) editor._connStatusEl = null;
  if (editor._connStatusRefs === undefined) editor._connStatusRefs = null;
  return editor._connStatus;
}

function _maybeUpdateDeviceIcon(editor, dt) {
  const st = _getOrInitState(editor);
  const deviceType = dt || st.deviceType || (typeof editor.selectedDeviceType === 'function' ? editor.selectedDeviceType('Duo') : 'Duo');

  const refs = editor._connStatusRefs;
  if (!refs?.deviceImg) return;

  let src = null;
  if (typeof editor._getDeviceImgFor === 'function') src = editor._getDeviceImgFor(deviceType);
  if (!src) src = `public/images/${String(deviceType || '').toLowerCase()}-logo-square-512.png`;

  if (refs.deviceImg.getAttribute('src') !== src) refs.deviceImg.setAttribute('src', src);
  refs.deviceImg.setAttribute('alt', String(deviceType || ''));
}

function _applyStateToUI(editor) {
  const st = _getOrInitState(editor);

  const el = editor._connStatusEl || document.getElementById('m-conn-status');
  if (!el) return;

  if (!editor._connStatusRefs) editor._connStatusRefs = _grabRefs(el);
  const refs = editor._connStatusRefs;

  const status = String(st.status || 'disconnected');

  el.classList.remove('is-hidden', 'is-connected', 'is-connecting', 'is-error', 'is-disconnected');

  if (status === 'connected') el.classList.add('is-connected');
  else if (status === 'connecting') el.classList.add('is-connecting');
  else if (status === 'error') el.classList.add('is-error');
  else el.classList.add('is-disconnected');

  const title = st.title || st.deviceType || '';
  const subtitle = st.subtitle || '';

  if (refs?.title) refs.title.textContent = String(title);
  if (refs?.subtitle) refs.subtitle.textContent = String(subtitle);

  _maybeUpdateDeviceIcon(editor, st.deviceType);
}

export async function ensureConnStatusOverlay(editor, dt) {
  if (!editor) return null;

  const st = _getOrInitState(editor);
  const deviceType =
    dt || st.deviceType || (typeof editor.selectedDeviceType === 'function' ? editor.selectedDeviceType('Duo') : 'Duo');
  st.deviceType = deviceType;

  // If already present under editor root, reuse it.
  const existing = document.getElementById('m-conn-status');
  if (existing && editor.root && editor.root.contains(existing)) {
    editor._connStatusEl = existing;
    editor._connStatusRefs = editor._connStatusRefs || _grabRefs(existing);
    _maybeUpdateDeviceIcon(editor, deviceType);
    _applyStateToUI(editor);
    return existing;
  }

  editor._connStatusEl = null;
  editor._connStatusRefs = null;

  let deviceImg = null;
  if (typeof editor._getDeviceImgFor === 'function') deviceImg = editor._getDeviceImgFor(deviceType);
  if (!deviceImg) deviceImg = `public/images/${String(deviceType || '').toLowerCase()}-logo-square-512.png`;

  const deviceAlt = String(deviceType || '');

  const title = st.title || deviceAlt || '';
  const subtitle = st.subtitle || '';

  if (!editor.views || typeof editor.views.render !== 'function') {
    throw new Error('ConnStatus.ensureConnStatusOverlay: editor.views.render is required');
  }

  const frag = await editor.views.render('conn-status.html', {
    deviceImg,
    deviceAlt,
    title,
    subtitle,
  });

  if (editor.root) editor.root.appendChild(frag);

  const el = document.getElementById('m-conn-status');
  if (!el) return null;

  editor._connStatusEl = el;
  editor._connStatusRefs = _grabRefs(el);

  _maybeUpdateDeviceIcon(editor, deviceType);
  _applyStateToUI(editor);

  return el;
}

export function setConnStatus(editor, { status, title = null, subtitle = null, deviceType = null, error = null } = {}) {
  if (!editor) return;
  const st = _getOrInitState(editor);

  if (deviceType != null) st.deviceType = String(deviceType || '');
  if (status != null) st.status = String(status || 'disconnected');
  if (title != null) st.title = String(title || '');
  if (subtitle != null) st.subtitle = String(subtitle || '');

  if (error != null) editor._connStatusLastError = error ? String(error) : null;

  _applyStateToUI(editor);
}

export function setConnError(editor, msg, { deviceType = null } = {}) {
  if (!editor) return;
  const st = _getOrInitState(editor);

  const dt =
    deviceType || st.deviceType || (typeof editor.selectedDeviceType === 'function' ? editor.selectedDeviceType('Duo') : 'Duo');

  const err = String(msg || 'Connection error');
  editor._connStatusLastError = err;

  st.status = 'error';
  st.deviceType = String(dt || '');
  st.title = String(dt || '');
  st.subtitle = err;

  _applyStateToUI(editor);
}

export function syncConnStatusFromPort(editor, dt) {
  if (!editor) return;
  const st = _getOrInitState(editor);

  const deviceType =
    dt || st.deviceType || (typeof editor.selectedDeviceType === 'function' ? editor.selectedDeviceType('Duo') : 'Duo');

  let active = false;
  try {
    active = !!editor.vortexPort?.isActive?.();
  } catch {
    active = false;
  }

  if (active) {
    editor._connStatusLastError = null;
    st.status = 'connected';
    st.deviceType = String(deviceType || '');
    st.title = String(deviceType || '');
    st.subtitle = 'Connected';
  } else if (editor._connStatusLastError) {
    st.status = 'error';
    st.deviceType = String(deviceType || '');
    st.title = String(deviceType || '');
    st.subtitle = String(editor._connStatusLastError || '');
  } else {
    st.status = 'disconnected';
    st.deviceType = String(deviceType || '');
    st.title = String(deviceType || '');
    st.subtitle = 'Not connected';
  }

  _applyStateToUI(editor);
}

