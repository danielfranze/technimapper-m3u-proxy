/**
 * Domain: identifier utilities for mapping entries.
 */
declare const ID_REGEX: RegExp;
interface ReceiverIpOptions {
    allowNonPrivateIp?: boolean;
    allowLoopback?: boolean;
}
/**
 * Receiver must be a valid IPv4; loopback/link-local/multicast are always rejected.
 */
declare function isAllowedReceiverIp(ip: unknown, options?: ReceiverIpOptions): boolean;
export { ID_REGEX, isAllowedReceiverIp, ReceiverIpOptions };
