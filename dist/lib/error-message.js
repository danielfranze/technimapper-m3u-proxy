/**
 * Shared helper: extracts a displayable message from any error-like value.
 */
function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
export { errorMessage };
//# sourceMappingURL=error-message.js.map