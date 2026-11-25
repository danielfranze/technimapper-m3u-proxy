'use strict';

/**
 * Typed DOM access helpers.
 *
 * The markup is static, so a missing required element is a bug and fails fast
 * with a clear message instead of an obscure property access on `null`.
 */

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
export function byId(id) {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing element #${id}`);
    return element;
}

/**
 * @param {string} id
 * @returns {HTMLInputElement}
 */
export function inputById(id) {
    return /** @type {HTMLInputElement} */ (byId(id));
}

/**
 * @param {string} id
 * @returns {HTMLSelectElement}
 */
export function selectById(id) {
    return /** @type {HTMLSelectElement} */ (byId(id));
}

/**
 * @param {string} id
 * @returns {HTMLDialogElement}
 */
export function dialogById(id) {
    return /** @type {HTMLDialogElement} */ (byId(id));
}

/**
 * Optional input lookup for elements that may be absent (e.g. responsive duplicates).
 * @param {string} id
 * @returns {HTMLInputElement | null}
 */
export function maybeInputById(id) {
    return /** @type {HTMLInputElement | null} */ (document.getElementById(id));
}

/**
 * @param {string} selector
 * @returns {HTMLElement | null}
 */
export function query(selector) {
    return /** @type {HTMLElement | null} */ (document.querySelector(selector));
}

/**
 * @param {string} selector
 * @returns {HTMLElement[]}
 */
export function queryAll(selector) {
    return Array.from(document.querySelectorAll(selector), element => /** @type {HTMLElement} */ (element));
}

/**
 * Returns the event target as an Element (or null for text/document targets).
 * @param {Event} event
 * @returns {Element | null}
 */
export function eventTarget(event) {
    return /** @type {Element | null} */ (event.target);
}
