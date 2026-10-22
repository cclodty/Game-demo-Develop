// Render quality: 'high' (the default) or 'low' (no bloom, no shadows, pixel
// ratio 1) for weak GPUs and laptops. Chosen with ?quality=low or from the
// stats panel, remembered in localStorage, applied when the page loads; a
// phone starts low.

const KEY = 'bullet-ballet.quality';

export const QUALITIES = ['high', 'low'];

export function readQuality() {
  try {
    const q = new URLSearchParams(location.search).get('quality');
    if (QUALITIES.includes(q)) return q;
    const s = localStorage.getItem(KEY);
    if (QUALITIES.includes(s)) return s;
    // a phone (a coarse pointer: 手機版 ①) starts low until the stats panel says otherwise
    if (globalThis.matchMedia && globalThis.matchMedia('(pointer: coarse)').matches) return 'low';
  } catch {
    /* storage unavailable */
  }
  return 'high';
}

export function saveQuality(q) {
  try {
    localStorage.setItem(KEY, q);
  } catch {
    /* storage unavailable */
  }
}
