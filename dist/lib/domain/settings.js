/**
 * Domain: settings validation (receiver IP, port, cron, channel list name).
 *
 * Pure, no Express, no I/O – unit-testable in isolation.
 */
import { isAllowedReceiverIp } from './ids.js';
import { HttpError } from '../http-error.js';
/**
 * Validates a full settings object and returns a normalised copy. Throws HttpError(400).
 */
function validateSettings(raw, { cronValidate, allowNonPrivateIp, allowLoopback }) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw HttpError.badRequest('Invalid settings payload');
    }
    const input = raw;
    const ip = String(input.ip ?? '').trim();
    if (!isAllowedReceiverIp(ip, {
        allowNonPrivateIp: allowNonPrivateIp === true,
        allowLoopback: allowLoopback === true
    })) {
        throw HttpError.badRequest('Invalid receiver IP. Use a private IPv4 address (10.x, 172.16-31.x, 192.168.x).');
    }
    const portStr = String(input.port ?? '').trim();
    const portNum = parseInt(portStr, 10);
    if (!/^\d{1,5}$/.test(portStr) || portNum < 1 || portNum > 65535) {
        throw HttpError.badRequest('Invalid port (1-65535).');
    }
    const cronExpression = String(input.cronExpression ?? '').trim();
    if (cronExpression.length > 100 || !cronValidate(cronExpression)) {
        throw HttpError.badRequest(`Invalid cron expression "${cronExpression.slice(0, 40)}" (example: */5 * * * *).`);
    }
    const selectedListName = String(input.selectedListName ?? '').trim();
    if (!selectedListName || selectedListName.length > 200) {
        throw HttpError.badRequest('Invalid channel list name.');
    }
    return { ip, port: String(portNum), cronExpression, selectedListName };
}
export { validateSettings };
//# sourceMappingURL=settings.js.map