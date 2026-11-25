/**
 * HTTP error carrying a status code, thrown by validation and routes.
 *
 * Static factories cover the common statuses so callers don't repeat the
 * (status, message) pair at every throw site.
 */

class HttpError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }

    static badRequest(message: string): HttpError {
        return new HttpError(400, message);
    }

    static badGateway(message: string): HttpError {
        return new HttpError(502, message);
    }

    static conflict(message: string): HttpError {
        return new HttpError(409, message);
    }

    static internal(message: string): HttpError {
        return new HttpError(500, message);
    }

    static notFound(message: string): HttpError {
        return new HttpError(404, message);
    }

    static payloadTooLarge(): HttpError {
        return new HttpError(413, 'Payload too large');
    }
}

export { HttpError };
