/**
 * Domain: identifier utilities for mapping entries.
 */

import net from 'node:net';

// "." and ".." are valid in a character class but would be normalised by URL
// parsing and could escape the /hdhr/stream/:id route.
const ID_REGEX = /^(?!\.{1,2}$)[A-Za-z0-9_.-]{1,32}$/;

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
    const [firstOctet = -1, secondOctet = -1] = ip.split('.').map(Number);
    if (firstOctet === 0 || firstOctet >= 224) return false; // unspecified, multicast/reserved
    if (firstOctet === 169 && secondOctet === 254) return false; // link-local (incl. cloud metadata)
    if (firstOctet === 127) return allowLoopback;
    if (allowNonPrivateIp) return true;
    return (
        firstOctet === 10 ||
        (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) ||
        (firstOctet === 192 && secondOctet === 168)
    );
}

export { ID_REGEX, isAllowedReceiverIp, type ReceiverIpOptions };
