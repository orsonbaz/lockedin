/**
 * generate-icons.mjs
 * Generates public/icon-192.png and public/icon-512.png
 * using sharp + inline SVG.
 *
 * Run: node scripts/generate-icons.mjs
 */

import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

function makeSvg(size) {
  const center   = size / 2;
  const fontSize = Math.round(size * 0.32);
  const radius   = Math.round(size * 0.22);       // corner radius for the icon
  const barW     = Math.round(size * 0.60);
  const barH     = Math.round(size * 0.09);
  const barY     = Math.round(size * 0.58);
  const plateW   = Math.round(size * 0.085);
  const plateH   = Math.round(size * 0.28);
  const plateY   = barY - (plateH - barH) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${radius}" fill="#1A1A2E"/>

  <!-- Barbell bar -->
  <rect
    x="${center - barW / 2}" y="${barY}"
    width="${barW}" height="${barH}"
    rx="${Math.round(barH / 2)}"
    fill="#9AA0B4"
  />

  <!-- Left plate -->
  <rect
    x="${center - barW / 2 - plateW * 0.7}" y="${plateY}"
    width="${plateW}" height="${plateH}"
    rx="${Math.round(plateW * 0.25)}"
    fill="#E94560"
  />

  <!-- Right plate -->
  <rect
    x="${center + barW / 2 - plateW * 0.3}" y="${plateY}"
    width="${plateW}" height="${plateH}"
    rx="${Math.round(plateW * 0.25)}"
    fill="#E94560"
  />

  <!-- LI logotype -->
  <text
    x="${center}"
    y="${Math.round(size * 0.47)}"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="system-ui, -apple-system, sans-serif"
    font-weight="900"
    font-size="${fontSize}"
    fill="#E8E8F0"
    letter-spacing="-2"
  >LI</text>
</svg>`;
}

async function generateIcon(size, filename) {
  const svg    = makeSvg(size);
  const buf    = Buffer.from(svg);
  const output = join(publicDir, filename);

  await sharp(buf)
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(output);

  console.log(`✓ Generated ${filename} (${size}×${size})`);
}

await generateIcon(192, 'icon-192.png');
await generateIcon(512, 'icon-512.png');

// Also generate apple-touch-icon (180×180) if desired
await generateIcon(180, 'apple-touch-icon.png');

console.log('Icons generated successfully.');
