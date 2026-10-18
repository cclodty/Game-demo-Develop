#!/usr/bin/env node
// The itch.io upload (itch.io 發佈包): the single-file build as index.html in
// a zip, the way itch.io wants an HTML game ("This file will be played in the
// browser"). `npm run itch` → dist/bullet-ballet-itch.zip. The page, the cover,
// the screenshots and the fields to fill in are in docs/itch/; putting it on
// itch.io is the developer's (docs/itch/README.md).
//
//   node scripts/itch.mjs [out.zip]

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A zip of `files` ({ name: Buffer }), deflated, with no dependency: local headers, the central directory, the end record. */
export function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  // 2026-10-18 00:00 in DOS time: the same bytes for the same files
  const time = 0;
  const date = ((2026 - 1980) << 9) | (10 << 5) | 18;
  for (const [name, data] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8');
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // utf-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, nameBuf, packed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4); // made by
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt16LE(time, 12);
    c.writeUInt16LE(date, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(packed.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(nameBuf.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += local.length + nameBuf.length + packed.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

/** The files in a zip made by zip() (or any plain deflate/store zip): { name: Buffer }. */
export function unzip(buf) {
  const out = {};
  const endAt = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(endAt + 10);
  let p = buf.readUInt32LE(endAt + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const at = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const dataAt = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
    const data = buf.subarray(dataAt, dataAt + size);
    out[name] = method === 8 ? zlib.inflateRawSync(data) : Buffer.from(data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(process.argv[2] || path.join(ROOT, 'dist/bullet-ballet-itch.zip'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-itch-'));
  const page = path.join(tmp, 'index.html');
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build-single.mjs'), page], { stdio: 'inherit' });
  const data = zip({ 'index.html': fs.readFileSync(page) });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, data);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`wrote ${path.relative(ROOT, out) || out} (${(data.length / 1048576).toFixed(2)} MB): upload it to itch.io as an HTML game (docs/itch/README.md)`);
}
