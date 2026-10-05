import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const manifest=JSON.parse(await readFile(new URL('../chrome-extension/manifest.json',import.meta.url),'utf8'));
const hex=createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest('hex').slice(0,32);
const id=[...hex].map(c=>String.fromCharCode(97+parseInt(c,16))).join('');
const host=JSON.parse(await readFile(process.argv[2],'utf8'));
assert.equal(host.name,'com.ssubong.chrome_capture');assert.deepEqual(host.allowed_origins,[`chrome-extension://${id}/`]);
assert.equal((await stat(host.path)).isFile(),true);console.log('Native installer and stable extension ID verified:',id);
