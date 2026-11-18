/**
 * The SedHub mark (same shape as SedHubMark in components/SignInShell.tsx) for exported files:
 * an "S" made of two hexagon ribbons, blue above and green below.
 */
const RIBBON = 'M24 4 42 14.4V21L24 10.6 12.6 17.2 24 23.8 18.3 27.1 6 20V14.4Z';

export const SEDHUB_LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="520" viewBox="0 0 48 52">' +
  '<defs>' +
  '<linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#38a0ff"/><stop offset="1" stop-color="#1546d6"/></linearGradient>' +
  '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#13a24c"/><stop offset="1" stop-color="#3ee07b"/></linearGradient>' +
  '</defs>' +
  `<path d="${RIBBON}" fill="url(#b)"/>` +
  `<path d="${RIBBON}" fill="url(#g)" transform="rotate(180 24 26)"/>` +
  '</svg>';

/** Width / height of the mark. */
export const SEDHUB_LOGO_ASPECT = 48 / 52;

/**
 * The mark as a PNG data URL (PowerPoint shows PNG everywhere; SVG only in newer versions).
 * Drawn on a canvas in the browser; null where there is no canvas (tests, old browsers).
 */
export async function sedhubLogoPng(height = 520): Promise<string | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  try {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SEDHUB_LOGO_SVG)}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.height = height;
    canvas.width = Math.round(height * SEDHUB_LOGO_ASPECT);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
