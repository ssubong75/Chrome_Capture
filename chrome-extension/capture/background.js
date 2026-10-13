import { setCaptureBadge } from '../badge.js';
import { nativeMessage } from '../native.js';
const HOST_NAME = 'com.ssubong.chrome_capture';

const DEFAULT_SETTINGS = {
  delaySeconds: 0,
  format: 'png',
  quality: 92,
  cropToVideo: true,
  hideVideoOverlays: true,
  filenamePrefix: ''
};

chrome.runtime.onInstalled.addListener(async (details) => {
  const existing = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  const settings = { ...DEFAULT_SETTINGS, ...existing };
  if (details.previousVersion === '0.1.0' && existing.filenamePrefix === 'video_capture') {
    settings.filenamePrefix = '';
  }
  if (details.previousVersion && details.previousVersion !== '1.0.0') {
    settings.delaySeconds = 0;
  }
  await chrome.storage.sync.set(settings);
  await chrome.storage.sync.remove(['useNativeHost', 'fallbackToDownloads']);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'capture-delayed') return;
  try {
    await captureAndSave();
  } catch (error) {
    console.error(error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || sender.id !== chrome.runtime.id || message.target !== 'capture') return false;

  if (message.type === 'CAPTURE_NOW') {
    captureAndSave(message.overrideSettings || {})
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message.type === 'NATIVE_ACTION') {
    const allowedActions = new Set([
      'getSaveDirectory',
      'chooseSaveDirectory',
      'resetSaveDirectory',
      'openSaveDirectory'
    ]);
    if (!allowedActions.has(message.action)) {
      sendResponse({ ok: false, error: '지원하지 않는 저장 도우미 작업입니다.' });
      return false;
    }

    sendNativeMessage({ action: message.action })
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  return false;
});

let capturing = false;
async function captureAndSave(overrideSettings = {}) {
  if (capturing) return {ok:false,error:'현재 화면 캡처 또는 저장 중입니다.'};
  capturing = true;
  try { return await performCapture(overrideSettings); }
  catch (error) { await setBadge('!'); await clearBadgeSoon(); throw error; }
  finally { capturing = false; }
}
async function performCapture(overrideSettings = {}) {
  const stored = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  const settings = { ...DEFAULT_SETTINGS, ...stored, ...overrideSettings, format:'png', filenamePrefix:'' };

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.windowId == null) {
    throw new Error('활성 탭을 찾지 못했습니다.');
  }

  await setBadge('…');
  await sleep(Math.max(0, Number(settings.delaySeconds) || 0) * 1000);

  const videoRect = settings.cropToVideo ? await getLargestVideoRect(tab.id) : null;
  const mimeType = settings.format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const captureOptions = settings.format === 'jpeg'
    ? { format: 'jpeg', quality: clampQuality(settings.quality) }
    : { format: 'png' };

  let dataUrl;
  let cleanCaptureToken = null;

  try {
    if (settings.hideVideoOverlays) {
      cleanCaptureToken = await prepareVideoForCleanCapture(tab.id);
    }
    const [active] = await chrome.tabs.query({active:true,windowId:tab.windowId});
    if(active?.id !== tab.id) throw new Error('캡처 대기 중 활성 탭이 바뀌었습니다. 다시 실행하세요.');
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, captureOptions);
  } finally {
    if (cleanCaptureToken) {
      await restoreVideoAfterCleanCapture(tab.id, cleanCaptureToken);
    }
  }

  if (settings.cropToVideo && videoRect?.found) {
    try {
      dataUrl = await cropDataUrlToRect(dataUrl, videoRect, mimeType, clampQuality(settings.quality));
    } catch (error) {
      console.warn('Video crop failed. Saving full visible tab instead.', error);
    }
  }

  const filename = buildFilename(settings.filenamePrefix, settings.format);
  let saveResult;

  try {
    saveResult = await sendNativeMessage({
      action: 'saveCapture',
      dataUrl,
      filename,
      format: settings.format
    });
  } catch (error) {
    await setBadge('!');
    await clearBadgeSoon();
    return {
      ok: false,
      error: `저장 도우미에 연결하지 못했습니다: ${normalizeError(error)}`,
      filename
    };
  }

  if (!saveResult?.ok) {
    await setBadge('!');
    await clearBadgeSoon();
    return { ok: false, error: saveResult?.error || '저장에 실패했습니다.', filename };
  }

  await setBadge('✓');
  await clearBadgeSoon();
  return { ok: true, savedBy: 'native-host', filename, ...saveResult };
}

async function getLargestVideoRect(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const videos = Array.from(document.querySelectorAll('video'));
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (!videos.length) {
          return { found: false, viewportWidth, viewportHeight };
        }

        let best = null;
        for (const video of videos) {
          const rect = video.getBoundingClientRect();
          const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
          const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
          const area = visibleWidth * visibleHeight;
          if (!best || area > best.area) {
            best = {
              left: Math.max(0, rect.left),
              top: Math.max(0, rect.top),
              width: visibleWidth,
              height: visibleHeight,
              viewportWidth,
              viewportHeight,
              area
            };
          }
        }

        if (!best || best.area <= 1) {
          return { found: false, viewportWidth, viewportHeight };
        }

        return { found: true, ...best };
      }
    });

    return result?.result || { found: false };
  } catch (error) {
    console.warn('Could not read video rect', error);
    return { found: false };
  }
}

async function prepareVideoForCleanCapture(tabId) {
  const captureToken = `cvc${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [captureToken],
      func: async (token) => {
        const hiddenTokenAttr = 'data-cvc-clean-hidden';
        const oldStyleAttr = 'data-cvc-clean-old-style';
        const hadStyleAttr = 'data-cvc-clean-had-style';
        const removeLayoutAttr = 'data-cvc-clean-remove-layout';
        const videoTokenAttr = 'data-cvc-clean-video';
        const oldControlsAttr = 'data-cvc-clean-old-controls';
        const trackModesAttr = 'data-cvc-clean-track-modes';
        const styleTokenAttr = 'data-cvc-clean-style';
        const activeTokenAttr = 'data-cvc-clean-active';
        const xSamples = [0.03, 0.12, 0.25, 0.5, 0.75, 0.88, 0.97];
        const ySamples = [0.03, 0.12, 0.28, 0.5, 0.72, 0.88, 0.97];
        const videos = Array.from(document.querySelectorAll('video'));
        let video = null;
        let bestArea = 0;

        for (const candidate of videos) {
          const rect = candidate.getBoundingClientRect();
          const width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
          const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
          const area = width * height;
          const style = getComputedStyle(candidate);
          const isVisible = style.display !== 'none'
            && style.visibility !== 'hidden'
            && Number(style.opacity || 1) > 0;
          const score = area * (isVisible ? 2 : 1);
          if (score > bestArea) {
            video = candidate;
            bestArea = score;
          }
        }

        if (!video || bestArea <= 1) {
          return { applied: false, hiddenCount: 0 };
        }

        const root = document.documentElement;
        root.setAttribute(activeTokenAttr, token);
        let observer = null;
        let scanFrame = 0;
        let maintainFrame = 0;

        const hideOverlay = (overlay, removeFromLayout = false) => {
          if (removeFromLayout) {
            overlay.setAttribute(removeLayoutAttr, '1');
          }
          const applyHiddenStyle = () => {
            overlay.style.setProperty('transition', 'none', 'important');
            overlay.style.setProperty('animation', 'none', 'important');
            overlay.style.setProperty('visibility', 'hidden', 'important');
            overlay.style.setProperty('opacity', '0', 'important');
            if (overlay.getAttribute(removeLayoutAttr) === '1') {
              overlay.style.setProperty('display', 'none', 'important');
            }
          };

          if (overlay.getAttribute(hiddenTokenAttr) === token) {
            applyHiddenStyle();
            return false;
          }
          if (overlay.hasAttribute(hiddenTokenAttr)) return false;

          overlay.setAttribute(hadStyleAttr, overlay.hasAttribute('style') ? '1' : '0');
          overlay.setAttribute(oldStyleAttr, overlay.getAttribute('style') || '');
          overlay.setAttribute(hiddenTokenAttr, token);
          applyHiddenStyle();
          return true;
        };

        const scanAndHideOverlays = () => {
          if (root.getAttribute(activeTokenAttr) !== token || !video.isConnected) return 0;

          const videoRect = video.getBoundingClientRect();
          const left = Math.max(0, videoRect.left);
          const top = Math.max(0, videoRect.top);
          const right = Math.min(innerWidth, videoRect.right);
          const bottom = Math.min(innerHeight, videoRect.bottom);
          const width = Math.max(1, right - left);
          const height = Math.max(1, bottom - top);
          const candidates = new Set();
          const thinBottomElements = new Set();

          const canHide = (element) => {
            if (!(element instanceof HTMLElement)) return false;
            if (element === document.body || element === root) return false;
            if (element === video || element.contains(video) || video.contains(element)) return false;
            if (element.getAttribute(hiddenTokenAttr) === token) {
              hideOverlay(element);
              return false;
            }
            if (element.hasAttribute(hiddenTokenAttr)) return false;
            const style = getComputedStyle(element);
            return style.display !== 'none'
              && style.visibility !== 'hidden'
              && Number(style.opacity || 1) > 0;
          };

          for (const xRatio of xSamples) {
            for (const yRatio of ySamples) {
              const x = Math.min(innerWidth - 1, Math.max(0, left + width * xRatio));
              const y = Math.min(innerHeight - 1, Math.max(0, top + height * yRatio));
              for (const element of document.elementsFromPoint(x, y)) {
                if (element === video || element.contains(video)) break;
                if (canHide(element)) candidates.add(element);
              }
            }
          }

          for (const element of document.querySelectorAll('body *')) {
            if (!canHide(element)) continue;
            const style = getComputedStyle(element);
            if (style.position === 'static' && style.zIndex === 'auto') continue;
            const rect = element.getBoundingClientRect();
            const overlapWidth = Math.max(0, Math.min(rect.right, right) - Math.max(rect.left, left));
            const overlapHeight = Math.max(0, Math.min(rect.bottom, bottom) - Math.max(rect.top, top));
            const isNearBottom = rect.top >= top + height * 0.68 && rect.top <= bottom + 2;
            const isThinHorizontal = rect.width >= width * 0.2
              && rect.height >= 0
              && rect.height <= Math.max(12, height * 0.03);
            if (isNearBottom && isThinHorizontal && overlapWidth >= width * 0.2) {
              candidates.add(element);
              thinBottomElements.add(element);
              continue;
            }
            if (overlapWidth * overlapHeight > 4) candidates.add(element);
          }

          const overlays = Array.from(candidates).filter((candidate) => (
            !Array.from(candidates).some((other) => other !== candidate && other.contains(candidate))
          ));

          let hiddenCount = 0;
          for (const overlay of overlays) {
            if (hideOverlay(overlay)) hiddenCount += 1;
          }
          for (const thinElement of thinBottomElements) {
            if (hideOverlay(thinElement, true)) hiddenCount += 1;
          }
          return hiddenCount;
        };

        video.setAttribute(videoTokenAttr, token);
        video.setAttribute(oldControlsAttr, video.controls ? '1' : '0');
        video.controls = false;

        const trackModes = Array.from(video.textTracks).map((track) => track.mode);
        video.setAttribute(trackModesAttr, JSON.stringify(trackModes));
        for (const track of Array.from(video.textTracks)) {
          try {
            track.mode = 'disabled';
          } catch (_) {}
        }

        const style = document.createElement('style');
        style.setAttribute(styleTokenAttr, token);
        style.textContent = `
          video[${videoTokenAttr}="${token}"]::-webkit-media-controls {
            display: none !important;
            opacity: 0 !important;
          }
          video[${videoTokenAttr}="${token}"]::cue {
            color: transparent !important;
            background: transparent !important;
            text-shadow: none !important;
          }
        `;
        root.appendChild(style);

        const restore = () => {
          if (root.getAttribute(activeTokenAttr) === token) {
            root.removeAttribute(activeTokenAttr);
          }
          observer?.disconnect();
          if (scanFrame) cancelAnimationFrame(scanFrame);
          if (maintainFrame) cancelAnimationFrame(maintainFrame);

          for (const overlay of document.querySelectorAll(`[${hiddenTokenAttr}="${token}"]`)) {
            const oldStyle = overlay.getAttribute(oldStyleAttr) || '';
            if (overlay.getAttribute(hadStyleAttr) === '1') {
              overlay.setAttribute('style', oldStyle);
            } else {
              overlay.removeAttribute('style');
            }
            overlay.removeAttribute(hiddenTokenAttr);
            overlay.removeAttribute(oldStyleAttr);
            overlay.removeAttribute(hadStyleAttr);
            overlay.removeAttribute(removeLayoutAttr);
          }

          const targetVideo = document.querySelector(`video[${videoTokenAttr}="${token}"]`);
          if (targetVideo) {
            targetVideo.controls = targetVideo.getAttribute(oldControlsAttr) === '1';
            try {
              const modes = JSON.parse(targetVideo.getAttribute(trackModesAttr) || '[]');
              Array.from(targetVideo.textTracks).forEach((track, index) => {
                if (modes[index]) track.mode = modes[index];
              });
            } catch (_) {}
            targetVideo.removeAttribute(videoTokenAttr);
            targetVideo.removeAttribute(oldControlsAttr);
            targetVideo.removeAttribute(trackModesAttr);
          }

          document.querySelector(`[${styleTokenAttr}="${token}"]`)?.remove();
        };

        let hiddenCount = scanAndHideOverlays();

        const scheduleScan = () => {
          if (root.getAttribute(activeTokenAttr) !== token) {
            observer?.disconnect();
            return;
          }
          if (scanFrame) return;
          scanFrame = requestAnimationFrame(() => {
            scanFrame = 0;
            scanAndHideOverlays();
          });
        };

        observer = new MutationObserver(scheduleScan);
        observer.observe(root, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['class', 'style', activeTokenAttr]
        });

        const maintainCleanFrame = () => {
          if (root.getAttribute(activeTokenAttr) !== token) return;
          scanAndHideOverlays();
          maintainFrame = requestAnimationFrame(maintainCleanFrame);
        };
        maintainFrame = requestAnimationFrame(maintainCleanFrame);

        setTimeout(restore, 5000);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        hiddenCount += scanAndHideOverlays();
        return { applied: true, hiddenCount };
      }
    });

    return result?.result?.applied ? captureToken : null;
  } catch (error) {
    console.warn('Could not hide video overlays', error);
    return null;
  }
}

async function restoreVideoAfterCleanCapture(tabId, captureToken) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      args: [captureToken],
      func: (token) => {
        const hiddenTokenAttr = 'data-cvc-clean-hidden';
        const oldStyleAttr = 'data-cvc-clean-old-style';
        const hadStyleAttr = 'data-cvc-clean-had-style';
        const removeLayoutAttr = 'data-cvc-clean-remove-layout';
        const videoTokenAttr = 'data-cvc-clean-video';
        const oldControlsAttr = 'data-cvc-clean-old-controls';
        const trackModesAttr = 'data-cvc-clean-track-modes';
        const styleTokenAttr = 'data-cvc-clean-style';
        const activeTokenAttr = 'data-cvc-clean-active';

        if (document.documentElement.getAttribute(activeTokenAttr) === token) {
          document.documentElement.removeAttribute(activeTokenAttr);
        }

        for (const overlay of document.querySelectorAll(`[${hiddenTokenAttr}="${token}"]`)) {
          const oldStyle = overlay.getAttribute(oldStyleAttr) || '';
          if (overlay.getAttribute(hadStyleAttr) === '1') {
            overlay.setAttribute('style', oldStyle);
          } else {
            overlay.removeAttribute('style');
          }
          overlay.removeAttribute(hiddenTokenAttr);
          overlay.removeAttribute(oldStyleAttr);
          overlay.removeAttribute(hadStyleAttr);
          overlay.removeAttribute(removeLayoutAttr);
        }

        const video = document.querySelector(`video[${videoTokenAttr}="${token}"]`);
        if (video) {
          video.controls = video.getAttribute(oldControlsAttr) === '1';
          try {
            const modes = JSON.parse(video.getAttribute(trackModesAttr) || '[]');
            Array.from(video.textTracks).forEach((track, index) => {
              if (modes[index]) track.mode = modes[index];
            });
          } catch (_) {}
          video.removeAttribute(videoTokenAttr);
          video.removeAttribute(oldControlsAttr);
          video.removeAttribute(trackModesAttr);
        }

        document.querySelector(`[${styleTokenAttr}="${token}"]`)?.remove();
      }
    });
  } catch (error) {
    console.warn('Could not restore video overlays', error);
  }
}

async function cropDataUrlToRect(dataUrl, rect, mimeType, quality) {
  const sourceBlob = await fetch(dataUrl).then((res) => res.blob());
  const bitmap = await createImageBitmap(sourceBlob);

  const scaleX = bitmap.width / rect.viewportWidth;
  const scaleY = bitmap.height / rect.viewportHeight;

  const sx = Math.round(rect.left * scaleX);
  const sy = Math.round(rect.top * scaleY);
  const sw = Math.max(1, Math.round(rect.width * scaleX));
  const sh = Math.max(1, Math.round(rect.height * scaleY));

  const canvas = new OffscreenCanvas(sw, sh);
  const ctx = canvas.getContext('2d', { alpha: true });
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);

  const outputBlob = await canvas.convertToBlob({
    type: mimeType,
    quality: mimeType === 'image/jpeg' ? quality / 100 : undefined
  });

  return blobToDataUrl(outputBlob);
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i=0; i<bytes.length; i+=32768) binary += String.fromCharCode(...bytes.subarray(i,i+32768));
  return `data:${blob.type};base64,${btoa(binary)}`;
}

function sendNativeMessage(payload) { return nativeMessage(payload); }

function buildFilename(prefix, format) {

  const now = new Date();
  const yy = String(now.getFullYear() % 100).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ext = 'png';
  const timestamp = `${yy}${mm}${dd}_${hh}${mi}`;
  return `${timestamp}.${ext}`;
}

function clampQuality(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return 92;
  return Math.max(1, Math.min(100, Math.round(num)));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeError(error) {
  if (!error) return '알 수 없는 오류';
  if (typeof error === 'string') return error;
  return error.message || JSON.stringify(error);
}

async function setBadge(text) {
  try {
    await setCaptureBadge(text);
  } catch (_) {}
}

async function clearBadgeSoon() {
  setTimeout(() => setCaptureBadge(''), 1500);
}
