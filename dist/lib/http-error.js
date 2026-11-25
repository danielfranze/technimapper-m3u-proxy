/**
 * HTTP error carrying a status code, thrown by validation and routes.
 *
 * Static factories cover the common statuses so callers don't repeat the
 * (status, message) pair at every throw site.
 */
class HttpError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
    static badRequest(message) {
        return new HttpError(400, message);
    }
    static badGateway(message) {
        return new HttpError(502, message);
    }
    static conflict(message) {
        return new HttpError(409, message);
    }
    static internal(message) {
        return new HttpError(500, message);
    }
    static notFound(message) {
        return new HttpError(404, message);
    }
    static payloadTooLarge() {
        return new HttpError(413, 'Payload too large');
    }
}
export { HttpError };
//# sourceMappingURL=http-error.js.map