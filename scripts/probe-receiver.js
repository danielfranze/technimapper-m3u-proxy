'use strict';
const { createSoapReceiver } = require('../lib/receiver');

const ip = process.argv[2];
const port = process.argv[3] || '9100';
if (!ip) { console.error('Usage: node probe-receiver.js <ip> [port]'); process.exit(2); }

async function showObject(receiver, objectId, label, depth) {
  depth = depth || 0;
  const indent = '  '.repeat(depth);
  console.log(`${indent}=== Browse ObjectID: ${objectId} ${label || ''} ===`);
  let didl;
  try { didl = await receiver.browseUpnp(ip, port, objectId, '/ContentDirectory/Control'); }
  catch (e) { console.log(`${indent}  ERROR: ${e.message}`); return null; }
  const containers = Array.isArray(didl.container) ? didl.container : (didl.container ? [didl.container] : []);
  const items = Array.isArray(didl.item) ? didl.item : (didl.item ? [didl.item] : []);
  console.log(`${indent}  containers: ${containers.length} items: ${items.length}`);
  for (const c of containers) {
    const title = (c['dc:title'] && (c['dc:title']._ || c['dc:title'])) || '';
    console.log(`${indent}    C: ${title} (id=${c.$?.id}, childCount=${c.$?.childCount})`);
  }
  for (const it of items.slice(0, 10)) {
    const title = (it['dc:title'] && (it['dc:title']._ || it['dc:title'])) || '';
    const res = it.res && (it.res._ || it.res);
    console.log(`${indent}    I: ${title} -> ${res}`);
  }
  return { containers, items };
}

(async () => {
  const receiver = createSoapReceiver({ requestTimeoutMs: 8000, maxResponseBytes: 8 * 1024 * 1024, logger: console });
  try {
    const v = await showObject(receiver, '3', '(Videos parent)');
    if (v && v.containers) {
      for (const c of v.containers) {
        const r = await showObject(receiver, c.$?.id, `(${c['dc:title'] && (c['dc:title']._ || c['dc:title'])})`, 1);
        // If a container has sub-containers, go one more level.
        if (r && r.containers && r.containers.length > 0) {
          for (const cc of r.containers.slice(0, 5)) {
            await showObject(receiver, cc.$?.id, `(${cc['dc:title'] && (cc['dc:title']._ || cc['dc:title'])})`, 2);
          }
        }
      }
    }
  } finally {
    receiver.close();
  }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
