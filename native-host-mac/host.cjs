#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const DEFAULT_DIR = path.join(os.homedir(), 'Desktop', 'Capture');
const CONFIG_DIR = process.env.CHROME_CAPTURE_CONFIG_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'ChromeCapture');
const CONFIG_PATH = path.join(CONFIG_DIR, 'settings.json');
const MAX_MESSAGE_BYTES = 64 * 1024 * 1024;

function readExactly(fd, size) {
  const buffer = Buffer.alloc(size);
  let offset = 0;

  while (offset < size) {
    const bytesRead = fs.readSync(fd, buffer, offset, size - offset, null);
    if (bytesRead === 0) {
      throw new Error(`Native message ended early. Expected ${size} bytes, got ${offset}.`);
    }
    offset += bytesRead;
  }

  return buffer;
}

function readNativeMessage() {
  const header = readExactly(0, 4);
  const length = header.readUInt32LE(0);

  if (length <= 0) {
    throw new Error('Native message body is empty.');
  }
  if (length > MAX_MESSAGE_BYTES) {
    throw new Error(`Native message is too large: ${length} bytes.`);
  }

  const body = readExactly(0, length).toString('utf8');
  return JSON.parse(body);
}

function writeNativeMessage(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  fs.writeSync(1, Buffer.concat([header, body]));
}

function getSaveDirectory() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (typeof config.saveDirectory === 'string' && path.isAbsolute(config.saveDirectory)) {
      return path.normalize(config.saveDirectory);
    }
  } catch (_) {}
  return DEFAULT_DIR;
}

function setSaveDirectory(saveDirectory) {
  const normalized = path.normalize(saveDirectory);
  fs.mkdirSync(normalized, { recursive: true });
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ saveDirectory: normalized }, null, 2));
  return normalized;
}

function chooseSaveDirectory() {
  const current = getSaveDirectory();
  fs.mkdirSync(current, { recursive: true });
  const script = [
    `set selectedFolder to choose folder with prompt "캡처 이미지를 저장할 폴더를 선택하세요." default location POSIX file ${JSON.stringify(`${current}/`)}`,
    'POSIX path of selectedFolder'
  ];

  try {
    const selected = execFileSync('/usr/bin/osascript', script.flatMap((line) => ['-e', line]), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
    return setSaveDirectory(selected);
  } catch (error) {
    const detail = String(error.stderr || error.message || error);
    if (detail.includes('User canceled') || detail.includes('-128')) return null;
    throw new Error(`폴더 선택 창을 열지 못했습니다: ${detail.trim()}`);
  }
}

function openSaveDirectory() {
  const saveDirectory = getSaveDirectory();
  fs.mkdirSync(saveDirectory, { recursive: true });
  const child = spawn('/usr/bin/open', [saveDirectory], { detached: true, stdio: 'ignore' });
  child.unref();
  return saveDirectory;
}

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/png|audio\/wav|audio\/mp4|audio\/mpeg|video\/mp4);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl || '');
  if (!match) throw new Error('PNG, WAV, M4A, MP3 또는 MP4 파일 데이터가 필요합니다.');

  const ext = {'image/png':'png','audio/wav':'wav','audio/mp4':'m4a','audio/mpeg':'mp3','video/mp4':'mp4'}[match[1].toLowerCase()];
  return { ext, buffer: Buffer.from(match[2], 'base64') };
}

function sanitizeFilename(filename, ext) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fallback = `${pad(now.getFullYear()%100)}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.${ext}`;
  const input = filename || fallback;
  const safe = path.basename(input)
    .replace(/[\\/:*?"<>|\u0000-\u001F]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 180);

  if (!safe.toLowerCase().endsWith(`.${ext}`)) {
    return `${safe.replace(/\.[a-z0-9]+$/i, '')}.${ext}`;
  }
  return safe;
}

function uniquify(filePath) {
  if (!fs.existsSync(filePath)) return filePath;

  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);

  for (let i = 1; i < 1000; i += 1) {
    const candidate = path.join(dir, `${base}_${i}${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Could not create a unique filename.');
}

function saveCapture(message) {
  const { ext, buffer } = parseDataUrl(message.dataUrl);
  const filename = sanitizeFilename(message.filename, ext);
  const saveDirectory = getSaveDirectory();
  fs.mkdirSync(saveDirectory, { recursive: true });

  const outputPath = uniquify(path.join(saveDirectory, filename));
  fs.writeFileSync(outputPath, buffer);
  return { ok: true, path: outputPath, saveDirectory, bytes: buffer.length };
}

function saveVideoCapture(message) {
  const video = parseDataUrl(message.dataUrl);
  const audio = parseDataUrl(message.audioDataUrl);
  if (video.ext !== 'mp4' || audio.ext !== 'wav') throw new Error('MP4 영상과 PCM WAV 오디오가 필요합니다.');
  const ffmpeg = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'].find(file => fs.existsSync(file));
  if (!ffmpeg) throw new Error('PCM MP4 저장에는 FFmpeg가 필요합니다. FFmpeg를 설치해 주세요.');
  const saveDirectory = getSaveDirectory();
  fs.mkdirSync(saveDirectory, {recursive:true});
  const outputPath = uniquify(path.join(saveDirectory, sanitizeFilename(message.filename, 'mp4')));
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-capture-video-'));
  try {
    const input = path.join(temp, 'video.mp4'), wav = path.join(temp, 'audio.wav'), output = path.join(temp, 'output.mp4');
    fs.writeFileSync(input, video.buffer);fs.writeFileSync(wav, audio.buffer);
    execFileSync(ffmpeg, ['-hide_banner','-loglevel','error','-nostdin','-n','-i',input,'-i',wav,
      '-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','pcm_f32le','-ar','48000','-ac','2',
      '-af','apad','-shortest','-movflags','+faststart',output], {timeout:120000,maxBuffer:1024*1024});
    fs.copyFileSync(output, outputPath, fs.constants.COPYFILE_EXCL);
    return {ok:true,path:outputPath,saveDirectory,bytes:fs.statSync(outputPath).size};
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
}

function encodeAudio(message) {
  const match = /^data:audio\/wav;base64,([A-Za-z0-9+/=]+)$/.exec(message.dataUrl || '');
  if (!match) throw new Error('PCM WAV 녹음 데이터가 필요합니다.');
  const input = Buffer.from(match[1], 'base64');
  // Only accept the fixed PCM16/stereo/48 kHz WAV produced by the recorder.
  if (input.length < 44 || input.toString('ascii', 0, 4) !== 'RIFF' ||
      input.toString('ascii', 8, 16) !== 'WAVEfmt ' || input.readUInt32LE(16) !== 16 ||
      input.readUInt16LE(20) !== 1 || input.readUInt16LE(22) !== 2 ||
      input.readUInt32LE(24) !== 48000 || input.readUInt16LE(34) !== 16 ||
      input.toString('ascii', 36, 40) !== 'data' || input.readUInt32LE(40) !== input.length - 44 ||
      ![3, 5].includes((input.length - 44) / (48000 * 4))) {
    throw new Error('48 kHz 스테레오 3초 또는 5초 녹음만 지원합니다.');
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-capture-aac-'));
  try {
    const source = path.join(tempDir, 'input.wav');
    const output = path.join(tempDir, 'output.m4a');
    fs.writeFileSync(source, input, {mode:0o600});
    execFileSync('/usr/bin/afconvert', ['-f','m4af','-d','aac@48000','-b','128000','-s','0','-c','2',source,output], {
      timeout:30000, stdio:['ignore','pipe','pipe']
    });
    const buffer = fs.readFileSync(output);
    if (!buffer.length) throw new Error('AAC 인코딩 결과가 비어 있습니다.');
    return {ok:true, dataUrl:`data:audio/mp4;base64,${buffer.toString('base64')}`};
  } finally {
    fs.rmSync(tempDir, {recursive:true, force:true});
  }
}

function main() {
  try {
    const message = readNativeMessage();
    let response;

    switch (message.action) {
      case 'encodeAudio':
        response = encodeAudio(message);
        break;
      case 'saveVideoCapture':
        response = saveVideoCapture(message);
        break;
      case 'saveCapture':
        response = saveCapture(message);
        break;
      case 'getSaveDirectory': {
        const saveDirectory = getSaveDirectory();
        response = { ok: true, path: saveDirectory, isDefault: saveDirectory === DEFAULT_DIR };
        break;
      }
      case 'chooseSaveDirectory': {
        const selected = chooseSaveDirectory();
        response = selected
          ? { ok: true, path: selected, isDefault: selected === DEFAULT_DIR }
          : { ok: false, cancelled: true, error: '폴더 선택을 취소했습니다.' };
        break;
      }
      case 'resetSaveDirectory':
        response = { ok: true, path: setSaveDirectory(DEFAULT_DIR), isDefault: true };
        break;
      case 'openSaveDirectory':
        response = { ok: true, path: openSaveDirectory() };
        break;
      default:
        throw new Error(`Unknown action: ${message.action}`);
    }

    writeNativeMessage(response);
  } catch (error) {
    writeNativeMessage({ ok: false, error: error.message || String(error) });
  }
}

main();
