/**
 * Open `url` in a new browser tab via a synthetic anchor click rather than
 * `window.open`. Popup blocker, tracking protection, and storage
 * partitioning each treat `window.open('...', '_blank', ...)` as a popup —
 * which can drop cookies for the new tab and slow it to a crawl. A real
 * link click from inside a user gesture is treated as a normal top-level
 * navigation and avoids all of that.
 *
 * Must be called from inside a user-initiated event handler (click, key
 * press) so the browser preserves the transient activation.
 */
export function openInNewTab(url: string): void {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
}
