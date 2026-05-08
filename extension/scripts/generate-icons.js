'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) crc = (crc >>> 1) ^ 0xedb88320;
      else crc >>>= 1;
    }
  }
  return (crc ^ 0xffffffff) | 0;
}

function writeUInt32BE(buf, value, offset) {
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

function createPNG(width, height, r, g, b) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk data (13 bytes)
  const ihdrData = Buffer.alloc(13);
  writeUInt32BE(ihdrData, width, 0);
  writeUInt32BE(ihdrData, height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type: RGB
  ihdrData[10] = 0; // compression method
  ihdrData[11] = 0; // filter method
  ihdrData[12] = 0; // interlace method

  const ihdrType = Buffer.from('IHDR');
  const ihdrCrcBuf = Buffer.concat([ihdrType, ihdrData]);
  const ihdrCrc = crc32(ihdrCrcBuf);

  const ihdrLen = Buffer.alloc(4);
  writeUInt32BE(ihdrLen, 13, 0);
  const ihdrCrcBuf2 = Buffer.alloc(4);
  writeUInt32BE(ihdrCrcBuf2, ihdrCrc >>> 0, 0);
  const ihdrChunk = Buffer.concat([ihdrLen, ihdrType, ihdrData, ihdrCrcBuf2]);

  // Raw image data: for each row: filter byte (0) + RGB pixels
  const rowSize = 1 + width * 3;
  const rawData = Buffer.alloc(height * rowSize);
  for (let y = 0; y < height; y++) {
    rawData[y * rowSize] = 0; // filter type: None
    for (let x = 0; x < width; x++) {
      const off = y * rowSize + 1 + x * 3;
      rawData[off] = r;
      rawData[off + 1] = g;
      rawData[off + 2] = b;
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });

  const idatType = Buffer.from('IDAT');
  const idatCrcSrc = Buffer.concat([idatType, compressed]);
  const idatCrc = crc32(idatCrcSrc);

  const idatLen = Buffer.alloc(4);
  writeUInt32BE(idatLen, compressed.length, 0);
  const idatCrcBuf = Buffer.alloc(4);
  writeUInt32BE(idatCrcBuf, idatCrc >>> 0, 0);
  const idatChunk = Buffer.concat([idatLen, idatType, compressed, idatCrcBuf]);

  // IEND chunk
  const iendType = Buffer.from('IEND');
  const iendCrc = crc32(iendType);
  const iendLen = Buffer.alloc(4); // length = 0
  const iendCrcBuf = Buffer.alloc(4);
  writeUInt32BE(iendCrcBuf, iendCrc >>> 0, 0);
  const iendChunk = Buffer.concat([iendLen, iendType, iendCrcBuf]);

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

// Indigo color: #6366f1 = rgb(99, 102, 241)
const R = 99, G = 102, B = 241;

const outDir = path.resolve(__dirname, '../public/icons');
fs.mkdirSync(outDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const png = createPNG(size, size, R, G, B);
  const outPath = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`Created ${outPath} (${png.length} bytes)`);
}
