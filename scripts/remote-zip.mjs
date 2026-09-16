import { writeFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

const [url, command = "list", argument, output] = process.argv.slice(2);
if (!url) {
  console.error("Usage: node scripts/remote-zip.mjs <url> [list [pattern] | extract <exact-name> <output>]");
  process.exit(2);
}

const signature = (buffer, offset) => buffer.readUInt32LE(offset);
const u64 = (buffer, offset) => Number(buffer.readBigUInt64LE(offset));

async function range(start, end) {
  const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (response.status !== 206) throw new Error(`Server did not honor Range ${start}-${end} (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

const head = await fetch(url, { method: "HEAD" });
const length = Number(head.headers.get("content-length"));
if (!Number.isSafeInteger(length) || length <= 0) throw new Error("Remote ZIP has no usable Content-Length");

const tailStart = Math.max(0, length - 131_072);
const tail = await range(tailStart, length - 1);
let eocd = -1;
for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
  if (signature(tail, offset) === 0x06054b50) {
    eocd = offset;
    break;
  }
}
if (eocd < 0) throw new Error("ZIP end-of-central-directory record was not found");

let entryCount = tail.readUInt16LE(eocd + 10);
let centralSize = tail.readUInt32LE(eocd + 12);
let centralOffset = tail.readUInt32LE(eocd + 16);
if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
  const locator = eocd - 20;
  if (locator < 0 || signature(tail, locator) !== 0x07064b50) throw new Error("ZIP64 locator was not found");
  const zip64Offset = u64(tail, locator + 8);
  const zip64 = await range(zip64Offset, zip64Offset + 55);
  if (signature(zip64, 0) !== 0x06064b50) throw new Error("ZIP64 EOCD record is malformed");
  entryCount = u64(zip64, 32);
  centralSize = u64(zip64, 40);
  centralOffset = u64(zip64, 48);
}

const central = await range(centralOffset, centralOffset + centralSize - 1);
const entries = [];
let cursor = 0;
while (cursor + 46 <= central.length && signature(central, cursor) === 0x02014b50) {
  const method = central.readUInt16LE(cursor + 10);
  let compressedSize = central.readUInt32LE(cursor + 20);
  let uncompressedSize = central.readUInt32LE(cursor + 24);
  const nameLength = central.readUInt16LE(cursor + 28);
  const extraLength = central.readUInt16LE(cursor + 30);
  const commentLength = central.readUInt16LE(cursor + 32);
  let localOffset = central.readUInt32LE(cursor + 42);
  const name = central.toString("utf8", cursor + 46, cursor + 46 + nameLength);
  const extra = central.subarray(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength);

  if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
    let extraCursor = 0;
    while (extraCursor + 4 <= extra.length) {
      const type = extra.readUInt16LE(extraCursor);
      const size = extra.readUInt16LE(extraCursor + 2);
      if (type === 0x0001) {
        let zipCursor = extraCursor + 4;
        if (uncompressedSize === 0xffffffff) { uncompressedSize = u64(extra, zipCursor); zipCursor += 8; }
        if (compressedSize === 0xffffffff) { compressedSize = u64(extra, zipCursor); zipCursor += 8; }
        if (localOffset === 0xffffffff) localOffset = u64(extra, zipCursor);
        break;
      }
      extraCursor += 4 + size;
    }
  }
  entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
  cursor += 46 + nameLength + extraLength + commentLength;
}
if (entries.length !== entryCount) throw new Error(`Parsed ${entries.length} entries; ZIP reports ${entryCount}`);

if (command === "list") {
  const pattern = argument ? new RegExp(argument, "i") : null;
  const selected = pattern ? entries.filter(entry => pattern.test(entry.name)) : entries;
  console.log(JSON.stringify({ url, length, entryCount, entries: selected }, null, 2));
} else if (command === "extract") {
  if (!argument || !output) throw new Error("extract requires an exact member name and output path");
  const entry = entries.find(candidate => candidate.name === argument);
  if (!entry) throw new Error(`ZIP member not found: ${argument}`);
  const header = await range(entry.localOffset, entry.localOffset + 65_535);
  if (signature(header, 0) !== 0x04034b50) throw new Error("Local ZIP header is malformed");
  const dataOffset = entry.localOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  const compressed = await range(dataOffset, dataOffset + entry.compressedSize - 1);
  const payload = entry.method === 0 ? compressed : entry.method === 8 ? inflateRawSync(compressed) : null;
  if (!payload) throw new Error(`Unsupported ZIP compression method ${entry.method}`);
  if (payload.length !== entry.uncompressedSize) throw new Error(`Extracted size mismatch (${payload.length} != ${entry.uncompressedSize})`);
  await writeFile(output, payload);
  console.log(JSON.stringify({ output, ...entry }, null, 2));
} else {
  throw new Error(`Unknown command: ${command}`);
}
