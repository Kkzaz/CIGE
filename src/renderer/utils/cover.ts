export type CoverSize = 'small' | 'large';

export interface CoverStyle {
  background: string;
  color: string;
  spineColor: string;
  textShadow: string;
  titleSize: string;
  authorSize: string;
}

const WARM_PALETTE = [
  ['#8B7355', '#A68B6A', '#C4A77D'],
  ['#7D6B58', '#9A8568', '#B8A082'],
  ['#6B5B4F', '#857262', '#A38F78'],
  ['#5E5346', '#786B5A', '#958573'],
  ['#7D6B5A', '#9A8672', '#B8A48C'],
  ['#6E5A4B', '#8B7462', '#A8907A'],
  ['#5A5045', '#746960', '#908778'],
  ['#6B5D4F', '#857667', '#A39180'],
];

const COOL_PALETTE = [
  ['#5A5A5A', '#757575', '#909090'],
  ['#4F5B5B', '#667474', '#7E8E8E'],
  ['#59564F', '#726F66', '#8B887E'],
  ['#4A4A48', '#626260', '#7B7B78'],
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function pickPalette(title: string): string[][] {
  const hash = hashString(title);
  const all = [...WARM_PALETTE, ...COOL_PALETTE];
  return all[hash % all.length];
}

function lighten(color: string, amount: number): string {
  const num = parseInt(color.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function darken(color: string, amount: number): string {
  return lighten(color, -amount);
}

function isLight(color: string): boolean {
  const num = parseInt(color.replace('#', ''), 16);
  const r = num >> 16;
  const g = (num >> 8) & 0x00FF;
  const b = num & 0x0000FF;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 150;
}

export function generateBookCover(
  title: string,
  author?: string,
  size: CoverSize = 'small'
): CoverStyle {
  const palette = pickPalette(title);
  const hash = hashString(title);
  const angle = 135 + (hash % 45);

  const base = palette[1];
  const light = palette[2];
  const dark = palette[0];
  const spine = darken(dark, 25);

  const textColor = isLight(light) ? 'rgba(44, 36, 22, 0.92)' : 'rgba(255, 249, 240, 0.95)';
  const shadowColor = isLight(light) ? 'rgba(44, 36, 22, 0.18)' : 'rgba(0, 0, 0, 0.35)';

  const paperTexture = `
    linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 50%, rgba(0,0,0,0.04) 100%),
    linear-gradient(to right, ${spine} 0%, ${spine} 8%, transparent 8%, transparent 100%),
    linear-gradient(${angle}deg, ${dark} 0%, ${base} 45%, ${light} 100%)
  `;

  return {
    background: paperTexture.replace(/\s+/g, ' '),
    color: textColor,
    spineColor: spine,
    textShadow: `0 1px 3px ${shadowColor}`,
    titleSize: size === 'large' ? '22px' : '14px',
    authorSize: size === 'large' ? '12px' : '10px',
  };
}

export function getCoverClass(size: CoverSize = 'small'): string {
  return size === 'large' ? 'book-cover-large' : 'book-cover-small';
}
