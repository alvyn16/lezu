export function enableWheelScrolling(shelf) {
  shelf.addEventListener('wheel', event => {
    // Preserve browser zoom and native horizontal trackpad gestures.
    if (event.ctrlKey || !event.deltaY || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    const maximum = shelf.scrollWidth - shelf.clientWidth;
    if (maximum <= 1) return;
    const atStart = shelf.scrollLeft <= 1;
    const atEnd = shelf.scrollLeft >= maximum - 1;
    // At either end, let the wheel continue scrolling the page normally.
    if ((event.deltaY < 0 && atStart) || (event.deltaY > 0 && atEnd)) return;
    if (!event.cancelable) return;
    const lineHeight = parseFloat(getComputedStyle(shelf).lineHeight) || 16;
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? lineHeight
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? shelf.clientWidth : 1;
    event.preventDefault();
    shelf.scrollBy({ left: event.deltaY * unit, behavior: 'instant' });
  }, { passive: false });
}
