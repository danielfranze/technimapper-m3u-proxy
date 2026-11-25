/**
 * Domain: settings validation (receiver IP, port, cron, channel list name).
 *
 * Pure, no Express, no I/O – unit-testable in isolation.
 */
export interface ValidatedSettings {
    ip: string;
    port: string;
    cronExpression: string;
    selectedListName: string;
}
export interface SettingsDeps {
    cronValidate(expr: string): boolean;
    allowNonPrivateIp?: boolean;
    allowLoopback?: boolean;
}
/**
 * Validates a full settings object and returns a normalised copy. Throws HttpError(400).
 */
declare function validateSettings(raw: unknown, { cronValidate, allowNonPrivateIp, allowLoopback }: SettingsDeps): ValidatedSettings;
export { validateSettings };
