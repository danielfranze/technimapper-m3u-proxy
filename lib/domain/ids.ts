/**
 * Domain: identifier utilities for mapping entries.
 */

import net from 'net';

// "." and ".." are valid in a character class but would be normalised by URL
// parsing and could escape the /hdhr/stream/:id route.
const ID_REGEX = /^(?!\.{1,2}$)[A-Za-z0-9_.\-]{1,32}$/;

interface ReceiverIpOptions {
    allowNonPrivateIp?: boolean;
    allowLoopback?: boolean;
}

/**
 * Receiver must be a valid IPv4; loopback/link-local/multicast are always rejected.
 */
function isAllowedReceiverIp(ip: unknown, options: ReceiverIpOptions = {}): boolean {
    const { allowNonPrivateIp = false, allowLoopback = false } = options;
    if (typeof ip !== 'string' || !net.isIPv4(ip)) return false;
    const [a = -1, b = -1] = ip.split('.').map(Number);
    if (a === 0 || a >= 224) return false;                  // unspecified, multicast/reserved
    if (a === 169 && b === 254) return false;                // link-local (incl. cloud metadata)
    if (a === 127) return allowLoopback;
    if (allowNonPrivateIp) return true;
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export { ID_REGEX, isAllowedReceiverIp, ReceiverIpOptions };
