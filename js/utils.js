/* ==========================================================================
   ACADEX UTILITY FUNCTIONS (js/utils.js)
   Shared HTML entity escaping helper for XSS prevention.
   ========================================================================== */

/**
 * Escapes special HTML characters to prevent Stored XSS attacks.
 * @param {any} str - Input value to sanitize
 * @returns {string} - HTML-escaped string
 */
export function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
