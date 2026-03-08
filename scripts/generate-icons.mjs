/**
 * Generate minimal valid PNG placeholder icons for PWA.
 *
 * This script creates simple solid-color PNG files with a "T" letter
 * rendered as basic shapes. These are placeholders meant to be replaced
 * with proper branding icons later.
 *
 * PNG format reference: http://www.libpng.org/pub/png/spec/1.2/PNG-Structure.html
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'public', 'icons');

// Ensure the icons directory exists
mkdirSync(iconsDir, { recursive: true });

function createPNG(width, height) {
  // Create raw pixel data (RGBA) with a simple design
  // Background: #18181b (zinc-900), Letter "T" area: white
  const bgR = 0x18,
    bgG = 0x18,
    bgB = 0x1b;
  const fgR = 0xff,
    fgG = 0xff,
    fgB = 0xff;

  const rawData = Buffer.alloc(height * (1 + width * 4)); // filter byte + RGBA per pixel per row

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    rawData[rowOffset] = 0; // filter: None

    for (let x = 0; x < width; x++) {
      const px = rowOffset + 1 + x * 4;

      // Normalize coordinates to 0-1
      const nx = x / width;
      const ny = y / height;

      // Draw a "T" shape:
      // Top bar: y from 0.25 to 0.35, x from 0.2 to 0.8
      // Vertical bar: y from 0.35 to 0.75, x from 0.42 to 0.58
      const isTopBar = ny >= 0.25 && ny <= 0.35 && nx >= 0.2 && nx <= 0.8;
      const isVertBar = ny > 0.35 && ny <= 0.75 && nx >= 0.42 && nx <= 0.58;

      if (isTopBar || isVertBar) {
        rawData[px] = fgR;
        rawData[px + 1] = fgG;
        rawData[px + 2] = fgB;
        rawData[px + 3] = 0xff;
      } else {
        rawData[px] = bgR;
        rawData[px + 1] = bgG;
        rawData[px + 2] = bgB;
        rawData[px + 3] = 0xff;
      }
    }
  }

  // Compress the raw data
  const compressed = zlib.deflateSync(rawData);

  // Build PNG file
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT chunk
  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuffer, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buf) {
  // Standard CRC-32 used in PNG
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Generate icons
const sizes = [
  { name: 'icon-192x192.png', width: 192, height: 192 },
  { name: 'icon-512x512.png', width: 512, height: 512 },
  { name: 'apple-touch-icon.png', width: 180, height: 180 },
];

for (const { name, width, height } of sizes) {
  const png = createPNG(width, height);
  const filePath = join(iconsDir, name);
  writeFileSync(filePath, png);
  console.log(`Created ${filePath} (${width}x${height}, ${png.length} bytes)`);
}

console.log('Done! All placeholder icons generated.');
