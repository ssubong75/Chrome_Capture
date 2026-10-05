const DEFAULT_SETTINGS = {
  delaySeconds: 0,
  format: 'png',
  quality: 92,
  cropToVideo: true,
  hideVideoOverlays: true,
  filenamePrefix: ''
};
const DEFAULTS_MIGRATION_KEY = 'videoCapture10DefaultsApplied';

const els = {
  delaySeconds: document.querySelector('#capture-delaySeconds'),
  cropToVideo: document.querySelector('#capture-cropToVideo'),
  hideVideoOverlays: document.querySelector('#capture-hideVideoOverlays'),
  captureBtn: document.querySelector('#capture-captureBtn'),
  optionsBtn: document.querySelector('#capture-optionsBtn'),
  shortcutHint: document.querySelector('#capture-shortcutHint'),
  status: document.querySelector('#capture-status')
};

init();

async function init() {
  const migration = await chrome.storage.local.get(DEFAULTS_MIGRATION_KEY);
  if (!migration[DEFAULTS_MIGRATION_KEY]) {
    await chrome.storage.sync.set({ delaySeconds: 0 });
    await chrome.storage.local.set({ [DEFAULTS_MIGRATION_KEY]: true });
  }

  const settings = { ...DEFAULT_SETTINGS, ...(await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS))) };
  for (const [key, value] of Object.entries(settings)) {
    const el = els[key];
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = value;
  }
  syncShortcutHint();
  addEvents();
}

function addEvents() {
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const el = els[key];
    if (!el) continue;
    el.addEventListener('change', saveSettings);
    el.addEventListener('input', () => {
      saveSettings();
    });
  }

  els.captureBtn.addEventListener('click', async () => {
    await saveSettings();
    setBusy(true);
    const delay = Number(els.delaySeconds.value) || 0;
    setStatus(`${delay}초 뒤 캡쳐합니다. 마우스와 키보드를 건드리지 마세요.`);

    try {
      const result = await chrome.runtime.sendMessage({target:'capture',type:'CAPTURE_NOW'});
      if (result?.ok) {
        setStatus(`저장 완료: ${result.path || result.filename}`);
      } else {
        setStatus(`실패: ${result?.error || '알 수 없는 오류'}`);
      }
    } catch (error) {
      setStatus(`실패: ${error.message || error}`);
    } finally {
      setBusy(false);
    }
  });

  els.optionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
}

async function saveSettings() {
  const settings = {
    delaySeconds: Number(els.delaySeconds.value),
    format: 'png',
    quality: 92,
    cropToVideo: els.cropToVideo.checked,
    hideVideoOverlays: els.hideVideoOverlays.checked,
    filenamePrefix: ''
  };
  await chrome.storage.sync.set(settings);
}

async function syncShortcutHint() {
  const commands=await chrome.commands.getAll();
  const key=commands.find(c=>c.name==='capture-delayed')?.shortcut;
  els.shortcutHint.textContent=key ? `화면 캡처 단축키: ${key}` : '단축키 미등록 · Chrome 설정에서 지정하세요.';
}

function setBusy(isBusy) {
  els.captureBtn.disabled = isBusy;
  els.captureBtn.textContent = isBusy ? '캡쳐 준비 중…' : 'PNG 캡처 시작';
}

function setStatus(text) {
  els.status.textContent = text;
}

