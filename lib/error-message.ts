/**
 * Shared helper: extracts a displayable message from any error-like value.
 */

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

export { errorMessage };
