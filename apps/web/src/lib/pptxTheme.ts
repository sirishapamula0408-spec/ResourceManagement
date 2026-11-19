import type PptxGenJS from 'pptxgenjs';
import { SEDHUB_LOGO_ASPECT } from './sedhubLogo';

/**
 * The look shared by every SedHub PowerPoint export (status report, teams report): white
 * slides, a title slide with the SedHub logo, green-accented slide titles and PowerPoint's
 * standard blue tables.
 */

// Hex without #, as pptxgenjs expects.
export const C = {
  ink: '17233B',
  muted: '5C6878',
  line: 'C9D1D9',
  head: '1546D6', // SedHub blue (the logo's)
  accent: '13A24C', // SedHub green
  white: 'FFFFFF',
};
// PowerPoint's standard blue table style (Medium Style 2 – Accent 1): blue header,
// banded light-blue rows, white grid lines.
export const TABLE = { head: '4472C4', band1: 'CFD5EA', band2: 'E9EBF5', text: '000000' };
export const FONT = 'Segoe UI';
export const MASTER = 'SEDHUB';

type Row = PptxGenJS.TableRow;

export const headCell = (text: string, align: PptxGenJS.HAlign = 'left') => ({
  text,
  options: { bold: true, color: C.white, fill: { color: TABLE.head }, align },
});

/** Banded rows; `first` keeps the bands going when a table continues on another slide. */
export const banded = (rows: Row[], first = 0): Row[] =>
  rows.map((row, i) =>
    row.map((cell) => ({
      ...cell,
      options: {
        fill: { color: (first + i) % 2 ? TABLE.band2 : TABLE.band1 },
        ...cell.options,
      },
    })),
  );

/** Table options for the standard blue style. */
export const tableStyle = {
  fontFace: FONT,
  color: TABLE.text,
  border: { type: 'solid' as const, pt: 1, color: C.white },
  valign: 'middle' as const,
};

/** White slides with a thin footer line, the footer text and the slide number. */
export function defineMaster(pptx: PptxGenJS, footer: string) {
  pptx.defineSlideMaster({
    title: MASTER,
    background: { color: C.white },
    objects: [
      { line: { x: 0.5, y: 7.05, w: 12.33, h: 0, line: { color: C.line, width: 0.75 } } },
      {
        text: {
          text: footer,
          options: { x: 0.5, y: 7.1, w: 8, h: 0.32, fontSize: 9, color: C.muted, fontFace: FONT },
        },
      },
    ],
    slideNumber: { x: 12.3, y: 7.1, w: 0.6, h: 0.32, fontSize: 9, color: C.muted, fontFace: FONT },
  });
}

/** Slide heading with the green accent bar. */
export function slideTitle(slide: PptxGenJS.Slide, title: string, subtitle: string, w = 12.1) {
  slide.addShape('rect', { x: 0.5, y: 0.38, w: 0.08, h: 0.72, fill: { color: C.accent } });
  slide.addText(title, {
    x: 0.7,
    y: 0.3,
    w,
    h: 0.5,
    fontSize: 24,
    bold: true,
    color: C.ink,
    fontFace: FONT,
  });
  slide.addText(subtitle, {
    x: 0.7,
    y: 0.8,
    w,
    h: 0.35,
    fontSize: 13,
    color: C.muted,
    fontFace: FONT,
  });
}

/** White title slide: SedHub logo and name, the report name, a blue subtitle and a meta line. */
export function titleSlide(
  pptx: PptxGenJS,
  {
    heading,
    subtitle,
    meta,
    logo,
  }: { heading: string; subtitle: string; meta: string; logo?: string | null },
) {
  const s = pptx.addSlide();
  s.background = { color: C.white };
  const logoH = 0.9;
  const logoW = logoH * SEDHUB_LOGO_ASPECT;
  if (logo) s.addImage({ data: logo, x: 0.8, y: 1.1, h: logoH, w: logoW });
  s.addText('SedHub', {
    x: logo ? 0.8 + logoW + 0.2 : 0.8,
    y: 1.1,
    w: 6,
    h: logoH,
    fontSize: 32,
    bold: true,
    color: C.ink,
    fontFace: FONT,
    valign: 'middle',
  });
  s.addShape('rect', { x: 0.9, y: 2.45, w: 1.2, h: 0.08, fill: { color: C.accent } });
  s.addText(heading, {
    x: 0.8,
    y: 2.75,
    w: 11.7,
    h: 0.9,
    fontSize: 44,
    bold: true,
    color: C.ink,
    fontFace: FONT,
  });
  s.addText(subtitle, {
    x: 0.8,
    y: 3.65,
    w: 11.7,
    h: 0.5,
    fontSize: 18,
    color: C.head,
    fontFace: FONT,
  });
  s.addText(meta, {
    x: 0.8,
    y: 4.3,
    w: 11.7,
    h: 0.4,
    fontSize: 14,
    color: C.muted,
    fontFace: FONT,
  });
  return s;
}
