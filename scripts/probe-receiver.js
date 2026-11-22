'use strict';
const { createSoapReceiver } = require('../lib/receiver.js');

const ip = process.argv[2];
const port = process.argv[3] || '9100';
if (!ip) { console.error('Usage: node probe-receiver.js <ip> [port]'); process.exit(2); }

async function showObject(receiver, objectId, pathEndpoint, label, depth) {
  depth = depth || 0;
  const indent = '  '.repeat(depth);
  console.log(`${indent}=== Browse ObjectID: ${objectId} via ${pathEndpoint} ${label || ''} ===`);
  let didl;
  try { didl = await receiver.browseUpnp(ip, port, objectId, pathEndpoint); }
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
    // STC path
    console.log('\n##### STC path (/dev0/srv1/control) #####');
    const stcRoot = await showObject(receiver, '0$3$41', '/dev0/srv1/control', '(STC parent)');
    if (stcRoot && stcRoot.containers) {
      for (const c of stcRoot.containers) {
        await showObject(receiver, c.$?.id, '/dev0/srv1/control', `(${c['dc:title'] && (c['dc:title']._ || c['dc:title'])})`, 1);
      }
    }
    // S-series path
    console.log('\n##### S-series path (/ContentDirectory/Control) #####');
    const sRoot = await showObject(receiver, '3', '/ContentDirectory/Control', '(S-series parent)');
    if (sRoot && sRoot.containers) {
      for (const c of sRoot.containers) {
        await showObject(receiver, c.$?.id, '/ContentDirectory/Control', `(${c['dc:title'] && (c['dc:title']._ || c['dc:title'])})`, 1);
      }
    }
  } finally {
    receiver.close();
  }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
