/**
 * Flag templates for Colour the Flag — plan §7.
 *
 * A template is an SVG whose regions are discrete paths carrying a
 * `data-region` name. Filling one is a click handler setting a fill; there is
 * no flood-fill algorithm anywhere in this mode.
 *
 * All templates share a 640x480 canvas, matching the shipped flag assets, so a
 * colouring can be compared against the real flag at the same proportions.
 */

export interface TemplateRegion {
  /** Region name, referenced by a `ColouringSpec`. */
  id: string;
  /** Spoken and displayed name — announced in Colour mode (§11). */
  label: string;
  /** SVG path data. */
  d: string;
}

export interface FlagTemplate {
  id: string;
  name: string;
  viewBox: string;
  regions: TemplateRegion[];
}

const W = 640;
const H = 480;

/** A rectangle as path data. */
function rect(x: number, y: number, w: number, h: number): string {
  return `M${x} ${y}h${w}v${h}h${-w}z`;
}

const THIRD = W / 3;
const H_THIRD = H / 3;

export const FLAG_TEMPLATES: FlagTemplate[] = [
  {
    id: 'vertical-2',
    name: 'Two vertical bands',
    viewBox: `0 0 ${W} ${H}`,
    regions: [
      { id: 'left', label: 'Left band', d: rect(0, 0, W / 2, H) },
      { id: 'right', label: 'Right band', d: rect(W / 2, 0, W / 2, H) },
    ],
  },
  {
    id: 'vertical-3',
    name: 'Three vertical bands',
    viewBox: `0 0 ${W} ${H}`,
    regions: [
      { id: 'left', label: 'Left band', d: rect(0, 0, THIRD, H) },
      { id: 'middle', label: 'Middle band', d: rect(THIRD, 0, THIRD, H) },
      { id: 'right', label: 'Right band', d: rect(THIRD * 2, 0, THIRD, H) },
    ],
  },
  {
    id: 'horizontal-2',
    name: 'Two horizontal bands',
    viewBox: `0 0 ${W} ${H}`,
    regions: [
      { id: 'top', label: 'Top band', d: rect(0, 0, W, H / 2) },
      { id: 'bottom', label: 'Bottom band', d: rect(0, H / 2, W, H / 2) },
    ],
  },
  {
    id: 'horizontal-3',
    name: 'Three horizontal bands',
    viewBox: `0 0 ${W} ${H}`,
    regions: [
      { id: 'top', label: 'Top band', d: rect(0, 0, W, H_THIRD) },
      { id: 'middle', label: 'Middle band', d: rect(0, H_THIRD, W, H_THIRD) },
      { id: 'bottom', label: 'Bottom band', d: rect(0, H_THIRD * 2, W, H_THIRD) },
    ],
  },
  {
    /**
     * Nordic cross: the vertical bar sits towards the hoist, which is what
     * makes it a Nordic cross rather than a centred one. The field is drawn
     * whole and the cross painted over it, so both are single paths.
     */
    id: 'nordic-cross',
    name: 'Nordic cross',
    viewBox: `0 0 ${W} ${H}`,
    regions: [
      { id: 'field', label: 'Background', d: rect(0, 0, W, H) },
      {
        id: 'cross',
        label: 'Cross',
        d: `${rect(0, 200, W, 80)} ${rect(180, 0, 80, H)}`,
      },
    ],
  },
  {
    id: 'disc-centre',
    name: 'Centred disc',
    viewBox: `0 0 ${W} ${H}`,
    regions: [
      { id: 'field', label: 'Background', d: rect(0, 0, W, H) },
      {
        id: 'disc',
        label: 'Disc',
        // A circle expressed as two arcs, so every region is path data.
        d: 'M320 120a120 120 0 1 0 0.1 0z',
      },
    ],
  },
  {
    /** Colombia and its relatives: the top band is half the height. */
    id: 'horizontal-3-uneven',
    name: 'Three uneven horizontal bands',
    viewBox: `0 0 ${W} ${H}`,
    regions: [
      { id: 'top', label: 'Top band', d: rect(0, 0, W, 240) },
      { id: 'middle', label: 'Middle band', d: rect(0, 240, W, 120) },
      { id: 'bottom', label: 'Bottom band', d: rect(0, 360, W, 120) },
    ],
  },
  {
    /** Thailand and Costa Rica: five bands with a double-height centre. */
    id: 'horizontal-5',
    name: 'Five horizontal bands',
    viewBox: `0 0 ${W} ${H}`,
    regions: [
      { id: 'top', label: 'Top band', d: rect(0, 0, W, 80) },
      { id: 'upper', label: 'Upper band', d: rect(0, 80, W, 80) },
      { id: 'middle', label: 'Middle band', d: rect(0, 160, W, 160) },
      { id: 'lower', label: 'Lower band', d: rect(0, 320, W, 80) },
      { id: 'bottom', label: 'Bottom band', d: rect(0, 400, W, 80) },
    ],
  },
  {
    id: 'canton-plain',
    name: 'Plain canton',
    viewBox: `0 0 ${W} ${H}`,
    regions: [
      { id: 'field', label: 'Background', d: rect(0, 0, W, H) },
      { id: 'canton', label: 'Canton', d: rect(0, 0, 256, 240) },
    ],
  },
  {
    /** Bangladesh and Palau: the disc sits towards the hoist. */
    id: 'disc-offset',
    name: 'Offset disc',
    viewBox: `0 0 ${W} ${H}`,
    regions: [
      { id: 'field', label: 'Background', d: rect(0, 0, W, H) },
      { id: 'disc', label: 'Disc', d: 'M280 130a110 110 0 1 0 0.1 0z' },
    ],
  },
  {
    id: 'crescent-star',
    name: 'Crescent and star',
    viewBox: `0 0 ${W} ${H}`,
    regions: [
      { id: 'field', label: 'Background', d: rect(0, 0, W, H) },
      {
        id: 'crescent',
        label: 'Crescent',
        // An outer disc with an offset inner disc cut out, drawn as one path
        // with opposite winding so the hole shows the field through it.
        d: 'M300 130a110 110 0 1 0 0.1 0zM330 160a86 86 0 1 1-0.1 0z',
      },
      { id: 'star', label: 'Star', d: 'M430 200l16 49h51l-42 30 16 49-41-30-41 30 16-49-42-30h51z' },
    ],
  },
  {
    /** Two horizontal bands with a triangle at the hoist. */
    id: 'triangle-hoist',
    name: 'Triangle at the hoist',
    viewBox: `0 0 ${W} ${H}`,
    regions: [
      { id: 'top', label: 'Top band', d: rect(0, 0, W, H / 2) },
      { id: 'bottom', label: 'Bottom band', d: rect(0, H / 2, W, H / 2) },
      { id: 'triangle', label: 'Hoist triangle', d: 'M0 0l320 240L0 480z' },
    ],
  },
  {
    id: 'diagonal-split',
    name: 'Diagonal split',
    viewBox: `0 0 ${W} ${H}`,
    regions: [
      { id: 'upper', label: 'Upper triangle', d: `M0 0h${W}L0 ${H}z` },
      { id: 'lower', label: 'Lower triangle', d: `M${W} 0v${H}H0z` },
    ],
  },
  {
    id: 'saltire',
    name: 'Saltire',
    viewBox: `0 0 ${W} ${H}`,
    regions: [
      { id: 'field', label: 'Background', d: rect(0, 0, W, H) },
      {
        id: 'saltire',
        label: 'Diagonal cross',
        d: 'M0 0h90l230 172L550 0h90v66L438 240l202 174v66h-90L320 308 90 480H0v-66l202-174L0 66z',
      },
    ],
  },
];

export const TEMPLATES_BY_ID: ReadonlyMap<string, FlagTemplate> = new Map(
  FLAG_TEMPLATES.map((template) => [template.id, template]),
);

export function templateById(id: string): FlagTemplate | undefined {
  return TEMPLATES_BY_ID.get(id);
}
