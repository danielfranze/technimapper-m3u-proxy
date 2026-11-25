/**
 * Typed DOM access helpers.
 *
 * The markup is static, so a missing required element is a bug and fails fast
 * with a clear message instead of an obscure property access on `null`.
 */

export function byId(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing element #${id}`);
    return element;
}

export function inputById(id: string): HTMLInputElement {
    return byId(id) as HTMLInputElement;
}

export function buttonById(id: string): HTMLButtonElement {
    return byId(id) as HTMLButtonElement;
}

export function selectById(id: string): HTMLSelectElement {
    return byId(id) as HTMLSelectElement;
}

export function dialogById(id: string): HTMLDialogElement {
    return byId(id) as HTMLDialogElement;
}

export function maybeInputById(id: string): HTMLInputElement | null {
    return document.getElementById(id) as HTMLInputElement | null;
}

export function query(selector: string): HTMLElement | null {
    return document.querySelector(selector) as HTMLElement | null;
}

export function queryAll(selector: string): HTMLElement[] {
    return Array.from(document.querySelectorAll(selector), element => element as HTMLElement);
}

export function eventTarget(event: Event): Element | null {
    return event.target as Element | null;
}
