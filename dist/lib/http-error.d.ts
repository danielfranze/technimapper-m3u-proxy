/**
 * HTTP error carrying a status code, thrown by validation and routes.
 *
 * Static factories cover the common statuses so callers don't repeat the
 * (status, message) pair at every throw site.
 */
declare class HttpError extends Error {
    readonly status: number;
    constructor(status: number, message: string);
    static badRequest(message: string): HttpError;
    static badGateway(message: string): HttpError;
    static conflict(message: string): HttpError;
    static internal(message: string): HttpError;
    static notFound(message: string): HttpError;
    static payloadTooLarge(): HttpError;
}
export { HttpError };
