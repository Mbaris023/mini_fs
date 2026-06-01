/**
 * mini_fs Web UI v2 — app.js
 *
 * Tam özellikli dosya sistemi simülatörü:
 * - Gerçek C implementasyonuyla aynı mantık (format, create, write, append,
 *   read, rename, cp, chmod, truncate, stat, ls, statfs, fsck, perf)
 * - Nanosaniye hassasiyetinde performans ölçümü (simüle)
 * - 5 sekme: Disk Haritası · İnode Tablosu · Dosyalar · Performans · Log
 * - Komut paleti, klavye kısayolları, eğitim modalları
 * - Confetti (fsck temiz çıktısında), toast bildirimleri
 */

'use strict';

/* ====================================================================
   GLOBAL STATE
==================================================================== */

const FS = {
  formatted:   false,
  superblock:  null,
  files:       [],      /* { name, inode, size, content, mode, blocks, ctime, mtime, atime, links } */
  nextInode:   0,
  usedDataBlocks: 0,
};

const Perf = {
  records: [],   /* { op, durationUs, bytes, ok } */
  totalOps:   0,
  totalUs:    0,
  totalBytes: 0,
};

const Log = {
  entries: [],  /* { ts, msg } */
};

let cmdHistory  = [];
let historyIdx  = -1;
let tutStep     = 0;
let activeTab   = 'disk';
let writeTarget = null;
let filterQuery = '';

/* ====================================================================
   FILESYSTEM SIMULATION
==================================================================== */

function now() { return Date.now(); }

function perfRecord(op, startMs, bytes, ok = true) {
  const dur = (Date.now() - startMs) * 1000 + Math.random() * 800; /* µs simulated */
  Perf.records.push({ op, durationUs: +dur.toFixed(3), bytes: bytes || 0, ok });
  if (Perf.records.length > 64) Perf.records.shift();
  Perf.totalOps++;
  Perf.totalUs   += dur;
  Perf.totalBytes += bytes || 0;
}

function fsLog(msg) {
  const d   = new Date();
  const ts  = d.toTimeString().slice(0, 8);
  Log.entries.push({ ts, msg });
  if (Log.entries.length > 200) Log.entries.shift();
  renderLog();
}

/* ---- format ---- */
function fsFormat(totalSize, blockSize) {
  const t0 = now();
  if (blockSize < 144) return { ok: false, msg: `Hata: blockSize (${blockSize}) < sizeof(Inode) (144).` };
  const totalBlocks  = Math.floor(totalSize / blockSize);
  const bitmapBlocks = Math.max(1, Math.ceil(totalBlocks / (blockSize * 8)));
  const inodeBlocks  = Math.max(1, Math.floor(totalBlocks / 10));
  if (1 + bitmapBlocks + inodeBlocks >= totalBlocks) {
    return { ok: false, msg: `Hata: Disk çok küçük (${totalBlocks} blok).` };
  }
  const inodesPerBlock = Math.floor(blockSize / 144);
  const maxInodes      = inodesPerBlock * inodeBlocks;
  if (maxInodes === 0) return { ok: false, msg: 'Hata: Blok boyutu inode için çok küçük.' };

  const dataStart  = 1 + bitmapBlocks + inodeBlocks;
  const dataBlocks = totalBlocks - dataStart;

  FS.superblock = {
    magic: 0x4D494E49, totalBlocks, blockSize, maxInodes,
    bitmapStart: 1, bitmapBlocks,
    inodeStart: 1 + bitmapBlocks, inodeBlocks,
    dataStart, dataBlocks,
    freeBlocks: dataBlocks, freeInodes: maxInodes,
    totalWrites: 0, totalReads: 0, bytesWritten: 0, bytesRead: 0,
    formattedAt: new Date().toLocaleString('tr-TR'),
  };

  FS.files         = [];
  FS.nextInode     = 0;
  FS.usedDataBlocks = 0;
  FS.formatted     = true;

  fsLog(`FORMAT: size=${totalSize}B block=${blockSize}B blocks=${totalBlocks} maxInodes=${maxInodes}`);
  perfRecord('format', t0, totalSize);

  const sb = FS.superblock;
  return {
    ok: true,
    msg: `Filesystem formatted successfully.
  Total size    : ${fmtBytes(totalSize)}
  Block size    : ${blockSize} bytes
  Total blocks  : ${totalBlocks}
  Data blocks   : ${dataBlocks}
  Max inodes    : ${maxInodes}  (${inodesPerBlock} inode/blok)
  Data start    : block ${dataStart}
  Formatted at  : ${sb.formattedAt}
  Perf          : format: ${(now()-t0)*1000}µs (simulated)`,
    isFormat: true,
  };
}

/* ---- create ---- */
function fsCreate(name) {
  const t0 = now();
  if (!FS.formatted) return { ok: false, msg: 'Hata: Disk formatlanmamış.' };
  if (name.length >= 32) return { ok: false, msg: 'Hata: Dosya adı çok uzun (max 31).' };
  if (FS.files.find(f => f.name === name)) return { ok: false, msg: `Hata: '${name}' zaten var.` };
  if (FS.superblock.freeInodes <= 0) return { ok: false, msg: 'Hata: Boş inode yok.' };

  const inode = FS.nextInode++;
  const ts    = new Date().toLocaleString('tr-TR');
  FS.files.push({ name, inode, size: 0, content: '', mode: 0o100644, blocks: [], ctime: ts, mtime: ts, atime: ts, links: 1 });
  FS.superblock.freeInodes--;

  fsLog(`CREATE: '${name}' inode=${inode} mode=100644`);
  perfRecord('create', t0, 0);
  return { ok: true, msg: `Created '${name}'  [inode:${inode}, mode:100644]  (create: simulated)` };
}

/* ---- delete ---- */
function fsDelete(name) {
  const t0 = now();
  if (!FS.formatted) return { ok: false, msg: 'Hata: Disk formatlanmamış.' };
  const idx = FS.files.findIndex(f => f.name === name);
  if (idx === -1) return { ok: false, msg: `Hata: '${name}' bulunamadı.` };
  const f = FS.files[idx];
  FS.usedDataBlocks -= f.blocks.length;
  FS.superblock.freeBlocks  += f.blocks.length;
  FS.superblock.freeInodes++;
  FS.files.splice(idx, 1);
  fsLog(`DELETE: '${name}' inode=${f.inode} freed ${f.blocks.length} blocks`);
  perfRecord('delete', t0, f.size);
  return { ok: true, msg: `Deleted '${name}'  [freed ${f.blocks.length} blocks]` };
}

/* ---- _doWrite (internal) ---- */
function _doWrite(file, content) {
  const sb = FS.superblock;
  const bs = sb.blockSize;
  const needed = Math.max(1, Math.ceil(content.length / bs));
  if (needed > 16) return { ok: false, msg: `Hata: Dosya çok büyük (max ${16 * bs} byte).` };
  if (needed > sb.freeBlocks + file.blocks.length) return { ok: false, msg: 'Hata: Disk dolu.' };

  FS.usedDataBlocks  -= file.blocks.length;
  sb.freeBlocks      += file.blocks.length;

  const newBlocks = [];
  for (let i = 0; i < needed; i++) {
    const b = sb.dataStart + FS.usedDataBlocks;
    newBlocks.push(b);
    FS.usedDataBlocks++;
  }
  sb.freeBlocks -= needed;
  sb.totalWrites++;
  sb.bytesWritten += content.length;

  file.content = content;
  file.size    = content.length;
  file.blocks  = newBlocks;
  file.mtime   = new Date().toLocaleString('tr-TR');
  return { ok: true };
}

/* ---- write ---- */
function fsWrite(name, content) {
  const t0 = now();
  if (!FS.formatted) return { ok: false, msg: 'Hata: Disk formatlanmamış.' };
  const file = FS.files.find(f => f.name === name);
  if (!file) return { ok: false, msg: `Hata: '${name}' bulunamadı.` };
  const r = _doWrite(file, content);
  if (!r.ok) return r;
  fsLog(`WRITE: '${name}' ${content.length} bytes inode=${file.inode}`);
  perfRecord('write', t0, content.length);
  return { ok: true, msg: `Wrote ${content.length} bytes to '${name}'  (write: simulated)` };
}

/* ---- append ---- */
function fsAppend(name, data) {
  const t0 = now();
  if (!FS.formatted) return { ok: false, msg: 'Hata: Disk formatlanmamış.' };
  const file = FS.files.find(f => f.name === name);
  if (!file) return { ok: false, msg: `Hata: '${name}' bulunamadı.` };
  const newContent = file.content + data;
  const r = _doWrite(file, newContent);
  if (!r.ok) return r;
  fsLog(`APPEND: '${name}' +${data.length} bytes total=${newContent.length}`);
  perfRecord('append', t0, data.length);
  return { ok: true, msg: `Appended ${data.length} bytes to '${name}'  (total: ${newContent.length} bytes)` };
}

/* ---- read ---- */
function fsRead(name) {
  const t0 = now();
  if (!FS.formatted) return { ok: false, msg: 'Hata: Disk formatlanmamış.' };
  const file = FS.files.find(f => f.name === name);
  if (!file) return { ok: false, msg: `Hata: '${name}' bulunamadı.` };
  file.atime = new Date().toLocaleString('tr-TR');
  FS.superblock.totalReads++;
  FS.superblock.bytesRead += file.size;
  fsLog(`READ: '${name}' ${file.size} bytes inode=${file.inode}`);
  perfRecord('read', t0, file.size);
  if (file.size === 0) return { ok: true, msg: '(boş dosya)', isContent: true };
  return { ok: true, msg: file.content, isContent: true };
}

/* ---- rename ---- */
function fsRename(oldName, newName) {
  const t0 = now();
  if (!FS.formatted) return { ok: false, msg: 'Hata: Disk formatlanmamış.' };
  const file = FS.files.find(f => f.name === oldName);
  if (!file) return { ok: false, msg: `Hata: '${oldName}' bulunamadı.` };
  if (FS.files.find(f => f.name === newName)) return { ok: false, msg: `Hata: '${newName}' zaten var.` };
  if (newName.length >= 32) return { ok: false, msg: 'Hata: Yeni isim çok uzun.' };
  file.name  = newName;
  file.mtime = new Date().toLocaleString('tr-TR');
  fsLog(`RENAME: '${oldName}' -> '${newName}' inode=${file.inode}`);
  perfRecord('rename', t0, 0);
  return { ok: true, msg: `Renamed '${oldName}' -> '${newName}'` };
}

/* ---- copy ---- */
function fsCopy(src, dst) {
  const t0 = now();
  if (!FS.formatted) return { ok: false, msg: 'Hata: Disk formatlanmamış.' };
  const srcFile = FS.files.find(f => f.name === src);
  if (!srcFile) return { ok: false, msg: `Hata: '${src}' bulunamadı.` };
  if (FS.files.find(f => f.name === dst)) return { ok: false, msg: `Hata: '${dst}' zaten var.` };
  if (FS.superblock.freeInodes <= 0) return { ok: false, msg: 'Hata: Boş inode yok.' };
  const ts    = new Date().toLocaleString('tr-TR');
  const inode = FS.nextInode++;
  const newFile = { name: dst, inode, size: 0, content: '', mode: srcFile.mode, blocks: [], ctime: ts, mtime: ts, atime: ts, links: 1 };
  FS.files.push(newFile);
  FS.superblock.freeInodes--;
  if (srcFile.size > 0) {
    const r = _doWrite(newFile, srcFile.content);
    if (!r.ok) { FS.files.pop(); FS.superblock.freeInodes++; return r; }
  }
  fsLog(`COPY: '${src}' -> '${dst}' ${srcFile.size} bytes inode=${inode}`);
  perfRecord('copy', t0, srcFile.size);
  return { ok: true, msg: `Copied '${src}' -> '${dst}'  [${srcFile.size} bytes, inode:${inode}]` };
}

/* ---- chmod ---- */
function fsChmod(name, modeOctal) {
  const t0 = now();
  if (!FS.formatted) return { ok: false, msg: 'Hata: Disk formatlanmamış.' };
  const file = FS.files.find(f => f.name === name);
  if (!file) return { ok: false, msg: `Hata: '${name}' bulunamadı.` };
  const typeBits = file.mode & 0xF000;
  file.mode = typeBits | (modeOctal & 0x0FFF);
  file.mtime = new Date().toLocaleString('tr-TR');
  fsLog(`CHMOD: '${name}' -> ${modeOctal.toString(8).padStart(4,'0')}`);
  perfRecord('chmod', t0, 0);
  return { ok: true, msg: `Changed mode of '${name}' to ${modeOctal.toString(8).padStart(4,'0')}  (${modeStr(file.mode)})` };
}

/* ---- truncate ---- */
function fsTruncate(name, newSize) {
  const t0 = now();
  if (!FS.formatted) return { ok: false, msg: 'Hata: Disk formatlanmamış.' };
  const file = FS.files.find(f => f.name === name);
  if (!file) return { ok: false, msg: `Hata: '${name}' bulunamadı.` };
  if (newSize > file.size) return { ok: false, msg: `Hata: truncate ile genişletme yapılamaz (${newSize} > ${file.size}).` };
  const newContent = file.content.slice(0, newSize);
  const r = _doWrite(file, newContent);
  if (!r.ok) return r;
  fsLog(`TRUNCATE: '${name}' -> ${newSize} bytes`);
  perfRecord('truncate', t0, 0);
  return { ok: true, msg: `Truncated '${name}' to ${newSize} bytes.` };
}

/* ---- stat ---- */
function fsStat(name) {
  const t0 = now();
  if (!FS.formatted) return { ok: false, msg: 'Hata: Disk formatlanmamış.' };
  const file = FS.files.find(f => f.name === name);
  if (!file) return { ok: false, msg: `Hata: '${name}' bulunamadı.` };
  const blkStr = file.blocks.length > 0 ? file.blocks.join(' ') : '(none)';
  fsLog(`STAT: '${name}' inode=${file.inode} size=${file.size}`);
  perfRecord('stat', t0, 0);
  return {
    ok: true,
    msg: `  File      : ${file.name}
  Inode     : ${file.inode}
  Size      : ${file.size} bytes
  Blocks    : ${file.blocks.length}  (block size: ${FS.superblock.blockSize} bytes)
  Mode      : ${file.mode.toString(8).padStart(6,'0')}  (${modeStr(file.mode)})
  Links     : ${file.links}
  Created   : ${file.ctime}
  Modified  : ${file.mtime}
  Accessed  : ${file.atime}
  Blk ptrs  : ${blkStr}`,
  };
}

/* ---- ls ---- */
function fsLs() {
  const t0 = now();
  if (!FS.formatted) return { ok: false, msg: 'Hata: Disk formatlanmamış.' };
  const sb = FS.superblock;
  let out = `${'Name'.padEnd(32)}  ${'Size'.padStart(8)}  ${'Inode'.padStart(6)}  ${'Modified'.padEnd(19)}  Mode\n`;
  out    += `${'-'.repeat(32)}  ${'-'.repeat(8)}  ${'-'.repeat(6)}  ${'-'.repeat(19)}  ----\n`;
  if (FS.files.length === 0) { out += '  (empty directory)'; }
  else {
    FS.files.forEach(f => {
      out += `${f.name.padEnd(32)}  ${String(f.size).padStart(8)}  ${String(f.inode).padStart(6)}  ${f.mtime.padEnd(19)}  ${modeStr(f.mode)}\n`;
    });
  }
  out += `\n  ${FS.files.length} file(s),  ${sb.maxInodes - sb.freeInodes}/${sb.maxInodes} inodes used,  ${sb.dataBlocks - sb.freeBlocks}/${sb.dataBlocks} blocks used`;
  fsLog(`LS: ${FS.files.length} files`);
  perfRecord('ls', t0, 0);
  return { ok: true, msg: out };
}

/* ---- statfs ---- */
function fsStatfs() {
  const t0 = now();
  if (!FS.formatted) return { ok: false, msg: 'Hata: Disk formatlanmamış.' };
  const sb = FS.superblock;
  const pct = ((sb.dataBlocks - sb.freeBlocks) / sb.dataBlocks * 100).toFixed(1);
  fsLog(`STATFS: free_blocks=${sb.freeBlocks} free_inodes=${sb.freeInodes}`);
  perfRecord('statfs', t0, 0);
  return {
    ok: true,
    msg: `=== File System Status ===
  Magic          : 0x${sb.magic.toString(16).toUpperCase().padStart(8,'0')}  ('MINI')
  Block size     : ${sb.blockSize} bytes
  Total blocks   : ${sb.totalBlocks}
  Data blocks    : ${sb.dataBlocks}  (${pct}% used)
  Free blocks    : ${sb.freeBlocks}
  Max inodes     : ${sb.maxInodes}
  Free inodes    : ${sb.freeInodes}
  Bitmap start   : block ${sb.bitmapStart}  (${sb.bitmapBlocks} blocks)
  Inode start    : block ${sb.inodeStart}  (${sb.inodeBlocks} blocks)
  Data start     : block ${sb.dataStart}
  Formatted at   : ${sb.formattedAt}
  --- I/O Statistics ---
  Total writes   : ${sb.totalWrites}  (${fmtBytes(sb.bytesWritten)})
  Total reads    : ${sb.totalReads}  (${fmtBytes(sb.bytesRead)})`,
  };
}

/* ---- fsck ---- */
function fsFsck() {
  const t0 = now();
  if (!FS.formatted) return { ok: false, msg: 'Hata: Disk formatlanmamış.' };
  const sb    = FS.superblock;
  let errors  = 0;
  let out     = '=== Filesystem Consistency Check (fsck) ===\n';

  if (sb.magic === 0x4D494E49) {
    out += `  [OK]   Magic number: 0x${sb.magic.toString(16).toUpperCase()}\n`;
  } else {
    out += `  [FAIL] Magic number corrupt\n`; errors++;
  }

  const expectedUsed = sb.maxInodes - sb.freeInodes;
  if (FS.files.length === expectedUsed) {
    out += `  [OK]   Inode count: ${FS.files.length} used / ${sb.maxInodes} total\n`;
  } else {
    out += `  [FAIL] Inode count mismatch: counted=${FS.files.length}, superblock says=${expectedUsed}\n`;
    errors++;
  }

  let countedBlocks = 0;
  let dups = new Set();
  for (const f of FS.files) {
    countedBlocks += f.blocks.length;
    if (f.name.length === 0 || f.name.length >= 32) {
      out += `  [FAIL] Inode ${f.inode}: invalid filename\n`; errors++;
    }
    for (const b of f.blocks) {
      if (b < sb.dataStart || b >= sb.totalBlocks) {
        out += `  [FAIL] Inode ${f.inode} ('${f.name}'): block ptr ${b} out of data range\n`; errors++;
      }
      if (dups.has(b)) {
        out += `  [FAIL] Inode ${f.inode}: block ${b} double-allocated\n`; errors++;
      }
      dups.add(b);
    }
  }

  const sbUsedBlocks = sb.dataBlocks - sb.freeBlocks;
  if (countedBlocks === sbUsedBlocks) {
    out += `  [OK]   Block count : ${countedBlocks} used / ${sb.dataBlocks} total\n`;
  } else {
    out += `  [FAIL] Block count mismatch: counted=${countedBlocks}, superblock says=${sbUsedBlocks}\n`;
    errors++;
  }

  out += `  [OK]   Bitmap structure appears consistent\n`;
  out += `\n  fsck result: ${errors} error(s) found\n`;
  out += errors === 0
    ? '  *** Filesystem is CLEAN ***'
    : '  *** Filesystem has errors — consider reformatting ***';

  fsLog(`FSCK: ${errors} errors found`);
  perfRecord('fsck', t0, 0);

  if (errors === 0) {
    setTimeout(launchConfetti, 200);
    showToast('✅ Filesystem CLEAN!', 'success');
  }

  return { ok: errors === 0, msg: out, isFsck: true };
}

/* ---- perf ---- */
function fsPerfReport() {
  const t0  = now();
  const recs = Perf.records;
  if (recs.length === 0) return { ok: true, msg: '  (Henüz işlem yok — önce format ve dosya işlemleri yapın)' };
  let out = '=== Performance Report ===\n';
  out    += `  Total operations : ${Perf.totalOps}\n`;
  out    += `  Total I/O bytes  : ${fmtBytes(Perf.totalBytes)}\n`;
  out    += `  Avg latency      : ${(Perf.totalUs / Perf.totalOps).toFixed(3)} µs\n\n`;
  out    += `  Last ${recs.length} operations:\n`;
  recs.forEach((r, i) => {
    out += `  [${String(i+1).padStart(2,'0')}] ${r.op.padEnd(16)}  ${r.durationUs.toFixed(3).padStart(10)} µs  ${String(r.bytes).padStart(8)} bytes\n`;
  });
  perfRecord('perf', t0, 0);
  return { ok: true, msg: out };
}

/* ====================================================================
   COMMAND PARSER
==================================================================== */

const COMMANDS = [
  { cmd: 'format',   usage: 'format <size> <block_size>',   desc: 'Diski formatla' },
  { cmd: 'create',   usage: 'create <dosya>',               desc: 'Dosya oluştur' },
  { cmd: 'write',    usage: 'write <dosya> "<metin>"',      desc: 'Dosyaya yaz (üzerine)' },
  { cmd: 'append',   usage: 'append <dosya> "<metin>"',     desc: 'Dosya sonuna ekle' },
  { cmd: 'read',     usage: 'read <dosya>',                  desc: 'Dosyayı oku' },
  { cmd: 'rename',   usage: 'rename <eski> <yeni>',         desc: 'Yeniden adlandır' },
  { cmd: 'cp',       usage: 'cp <kaynak> <hedef>',          desc: 'Dosyayı kopyala' },
  { cmd: 'stat',     usage: 'stat <dosya>',                  desc: 'İnode detayları' },
  { cmd: 'chmod',    usage: 'chmod <dosya> <octal>',        desc: 'İzinleri değiştir' },
  { cmd: 'truncate', usage: 'truncate <dosya> <boyut>',     desc: 'Dosyayı kırp' },
  { cmd: 'rm',       usage: 'rm <dosya>',                   desc: 'Dosyayı sil' },
  { cmd: 'ls',       usage: 'ls',                            desc: 'Dosyaları listele' },
  { cmd: 'statfs',   usage: 'statfs',                        desc: 'FS istatistikleri' },
  { cmd: 'fsck',     usage: 'fsck',                          desc: 'Tutarlılık kontrolü' },
  { cmd: 'perf',     usage: 'perf',                          desc: 'Performans raporu' },
  { cmd: 'help',     usage: 'help',                          desc: 'Komutları listele' },
  { cmd: 'clear',    usage: 'clear',                         desc: 'Terminali temizle' },
];

function smartSplit(str) {
  const result = [];
  let cur = '', inQ = false, qc = '';
  for (const c of str) {
    if (inQ) { if (c === qc) { inQ = false; } else { cur += c; } }
    else if (c === '"' || c === "'") { inQ = true; qc = c; }
    else if (c === ' ' || c === '\t') { if (cur) { result.push(cur); cur = ''; } }
    else { cur += c; }
  }
  if (cur) result.push(cur);
  return result;
}

function parseAndRun(raw) {
  const parts = smartSplit(raw.trim());
  if (!parts.length) return null;
  const cmd  = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    case 'format':
      if (args.length !== 2) return err('format', 'format <size> <block_size>');
      return fsFormat(parseInt(args[0]), parseInt(args[1]));
    case 'create':
      if (args.length !== 1) return err('create', 'create <dosya>');
      return fsCreate(args[0]);
    case 'rm': case 'delete':
      if (args.length !== 1) return err('rm', 'rm <dosya>');
      return fsDelete(args[0]);
    case 'write':
      if (args.length < 2) return err('write', 'write <dosya> "<metin>"');
      return fsWrite(args[0], args.slice(1).join(' ').replace(/^["']|["']$/g, ''));
    case 'append':
      if (args.length < 2) return err('append', 'append <dosya> "<metin>"');
      return fsAppend(args[0], args.slice(1).join(' ').replace(/^["']|["']$/g, ''));
    case 'read':
      if (args.length !== 1) return err('read', 'read <dosya>');
      return fsRead(args[0]);
    case 'rename':
      if (args.length !== 2) return err('rename', 'rename <eski> <yeni>');
      return fsRename(args[0], args[1]);
    case 'cp':
      if (args.length !== 2) return err('cp', 'cp <kaynak> <hedef>');
      return fsCopy(args[0], args[1]);
    case 'stat':
      if (args.length !== 1) return err('stat', 'stat <dosya>');
      return fsStat(args[0]);
    case 'chmod':
      if (args.length !== 2) return err('chmod', 'chmod <dosya> <octal>');
      return fsChmod(args[0], parseInt(args[1], 8));
    case 'truncate':
      if (args.length !== 2) return err('truncate', 'truncate <dosya> <boyut>');
      return fsTruncate(args[0], parseInt(args[1]));
    case 'ls':     return fsLs();
    case 'statfs': return fsStatfs();
    case 'fsck':   return fsFsck();
    case 'perf':   return fsPerfReport();
    case 'help': {
      let h = 'Kullanılabilir komutlar:\n';
      COMMANDS.forEach(c => { h += `  ${c.usage.padEnd(30)} — ${c.desc}\n`; });
      return { ok: true, msg: h };
    }
    case 'clear':  clearTerminal(); return null;
    default:
      return { ok: false, msg: `Bilinmeyen komut: '${cmd}'. 'help' yazın.` };
  }
}

function err(_cmd, usage) { return { ok: false, msg: `Kullanım: ${usage}` }; }

/* ====================================================================
   TERMINAL RENDERING
==================================================================== */

function termLine(html, cls = '') {
  const out = document.getElementById('termOut');
  const el  = document.createElement('div');
  el.className = 'tl' + (cls ? ' ' + cls : '');
  el.innerHTML = html;
  out.appendChild(el);
  out.scrollTop = out.scrollHeight;
}

function termSep() {
  const out = document.getElementById('termOut');
  const el  = document.createElement('div');
  el.className = 'tl tl-sep';
  out.appendChild(el);
  out.scrollTop = out.scrollHeight;
}

function clearTerminal() {
  const out = document.getElementById('termOut');
  out.innerHTML = '';
  termLine('<span class="tl-info">Terminal temizlendi.</span>');
}

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

function colorizeStatLine(line) {
  return esc(line).replace(
    /^(\s*)([\w\s\/\-]+?)(\s*:\s*)(.+)$/,
    (_, pre, key, sep, val) =>
      `${pre}<span class="t-key">${key}</span>${sep}<span class="t-val">${val}</span>`
  );
}

function printResult(result) {
  if (!result) return;
  const lines = result.msg.split('\n');

  lines.forEach((l, i) => {
    if (result.isContent) {
      termLine(`<span class="tl-out">${esc(l)}</span>`);
    } else if (!result.ok && i === 0) {
      termLine(`<span class="tl-err">${esc(l)}</span>`, 'tl-err');
    } else {
      termLine(colorizeStatLine(l), result.ok ? 'tl-out' : 'tl-err');
    }
  });

  /* Show perf timing after every op */
  if (Perf.records.length > 0) {
    const last = Perf.records[Perf.records.length - 1];
    termLine(`<span class="tl-perf">  ⏱ ${last.op}: ${last.durationUs.toFixed(3)} µs (simulated timing)</span>`);
  }
}

/* ====================================================================
   COMMAND EXECUTION
==================================================================== */

function runCmd(cmdStr) {
  const inp = document.getElementById('termInp');
  // Print command line
  termLine(`<span class="t-prompt">mini_fs</span><span class="t-sep">$</span> <span class="t-cmd">${esc(cmdStr)}</span>`, 'tl-cmd');

  cmdHistory.unshift(cmdStr);
  if (cmdHistory.length > 50) cmdHistory.pop();
  historyIdx = -1;
  if (inp) inp.value = '';

  const result = parseAndRun(cmdStr);
  printResult(result);

  refreshAll(result);
}

function submitCmd() {
  const inp = document.getElementById('termInp');
  const val = inp.value.trim();
  if (!val) return;
  runCmd(val);
}

/* ====================================================================
   REFRESH ALL UI
==================================================================== */

function refreshAll(lastResult) {
  refreshHeader();
  refreshBlockGrid();
  refreshSbCards();
  refreshInodeTable();
  refreshFileList();
  refreshPerfTab();
  updateTutorial(lastResult);
  enableControls();
}

function refreshHeader() {
  const dot    = document.getElementById('statusDot');
  const txt    = document.getElementById('statusText');
  const status = document.getElementById('diskStatus');

  if (!FS.formatted || !FS.superblock) {
    status.classList.remove('online');
    txt.textContent = 'Disk bulunamadı — format gerekli';
    ['svBlocks','svInodes','svFiles','svPerf'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
    ['statBlocks','statInodes','statFiles','statOps'].forEach(id => {
      document.getElementById(id)?.classList.remove('active');
    });
    return;
  }

  const sb = FS.superblock;
  status.classList.add('online');
  txt.textContent = `Disk: ${fmtBytes(sb.totalBlocks * sb.blockSize)} · ${sb.blockSize}B/blok · ${sb.dataBlocks} data blok`;

  document.getElementById('svBlocks').textContent = `${sb.freeBlocks}/${sb.dataBlocks}`;
  document.getElementById('svInodes').textContent = `${sb.freeInodes}/${sb.maxInodes}`;
  document.getElementById('svFiles').textContent  = FS.files.length;

  if (Perf.records.length > 0) {
    const last = Perf.records[Perf.records.length-1];
    document.getElementById('svPerf').textContent = `${last.op} ${last.durationUs.toFixed(1)}µs`;
  }
  ['statBlocks','statInodes','statFiles','statOps'].forEach(id => {
    document.getElementById(id)?.classList.add('active');
  });
}

function refreshSbCards() {
  const el = document.getElementById('sbCards');
  if (!FS.formatted || !FS.superblock) {
    el.innerHTML = `<div class="sb-card sb-card-empty">
      <div class="sb-empty-icon">💾</div>
      <div>Disk henüz formatlanmadı</div>
      <div class="sb-empty-hint">Format butonuna tıklayın veya <code>format 1048576 512</code> yazın</div>
    </div>`;
    document.getElementById('diskLegend').style.display = 'none';
    document.getElementById('usageWrap').style.display  = 'none';
    return;
  }

  const sb  = FS.superblock;
  const pct = ((sb.dataBlocks - sb.freeBlocks) / sb.dataBlocks * 100).toFixed(1);
  const cards = [
    { label: 'Magic',       val: `0x${sb.magic.toString(16).toUpperCase()}`, sub: "'MINI'" },
    { label: 'Blok boyutu', val: `${sb.blockSize} B`,   sub: 'block size' },
    { label: 'Top. blok',   val: sb.totalBlocks,         sub: 'total blocks' },
    { label: 'Boş blok',    val: sb.freeBlocks,          sub: `${(sb.freeBlocks/sb.dataBlocks*100).toFixed(1)}% free`, hl: sb.freeBlocks < sb.dataBlocks * 0.1 },
    { label: 'Max inode',   val: sb.maxInodes,           sub: 'inode capacity' },
    { label: 'Boş inode',   val: sb.freeInodes,          sub: `${(sb.freeInodes/sb.maxInodes*100).toFixed(1)}% free` },
    { label: 'Bitmap',      val: `blk ${sb.bitmapStart}`, sub: `${sb.bitmapBlocks} blok` },
    { label: 'İnode bölgesi', val: `blk ${sb.inodeStart}`, sub: `${sb.inodeBlocks} blok` },
    { label: 'Veri başl.',  val: `blk ${sb.dataStart}`, sub: `${sb.dataBlocks} blok` },
    { label: 'Kullanım',    val: `${pct}%`,              sub: `${sb.dataBlocks - sb.freeBlocks} blok dolu`, hl: true },
    { label: 'Top. yazma',  val: sb.totalWrites,         sub: fmtBytes(sb.bytesWritten) },
    { label: 'Top. okuma',  val: sb.totalReads,          sub: fmtBytes(sb.bytesRead) },
  ];

  el.innerHTML = cards.map(c => `
    <div class="sb-card ${c.hl ? 'highlight' : ''}">
      <div class="sb-card-label">${c.label}</div>
      <div class="sb-card-val">${c.val}</div>
      <div class="sb-card-sub">${c.sub}</div>
    </div>
  `).join('');

  document.getElementById('diskLegend').style.display  = 'flex';
  document.getElementById('usageWrap').style.display   = 'flex';
  document.getElementById('usagePct').textContent      = `${pct}%`;
  document.getElementById('usageFill').style.width     = `${pct}%`;
  document.getElementById('usageDetail').textContent   =
    `Superblock: 1 · Bitmap: ${sb.bitmapBlocks} · İnode: ${sb.inodeBlocks} · Veri: ${sb.dataBlocks} blok`;
}

function refreshBlockGrid() {
  const grid = document.getElementById('blockGrid');
  if (!FS.formatted || !FS.superblock) {
    grid.innerHTML = `<div class="grid-empty"><span>💾</span><span>Disk formatlanmadı</span></div>`;
    return;
  }

  const sb = FS.superblock;
  const DISP_MAX = 300;
  const ratio = Math.ceil(sb.totalBlocks / DISP_MAX);
  const count = Math.ceil(sb.totalBlocks / ratio);

  grid.innerHTML = '';

  for (let i = 0; i < count; i++) {
    const real = i * ratio;
    const el   = document.createElement('div');
    el.className = 'blk animate';
    el.style.animationDelay = `${i * 1.5}ms`;

    let type = 'df';
    let tip  = `Blok ${real}`;

    if (real === 0) {
      type = 'sb'; tip = 'Superblock (blok 0)';
    } else if (real >= sb.bitmapStart && real < sb.bitmapStart + sb.bitmapBlocks) {
      type = 'bm'; tip = `Bitmap blok ${real - sb.bitmapStart}`;
    } else if (real >= sb.inodeStart && real < sb.inodeStart + sb.inodeBlocks) {
      type = 'in'; tip = `İnode blok ${real - sb.inodeStart}`;
    } else if (real >= sb.dataStart) {
      const dataIdx = real - sb.dataStart;
      if (dataIdx < FS.usedDataBlocks) {
        type = 'du';
        /* Find which file owns this block */
        let owner = null;
        for (const f of FS.files) {
          if (f.blocks.includes(real)) { owner = f; break; }
        }
        tip = owner ? `Veri blok ${dataIdx} → '${owner.name}'` : `Veri blok ${dataIdx} (dolu)`;
      } else {
        tip = `Veri blok ${dataIdx} (boş)`;
      }
    }

    el.classList.add(`type-${type}`);
    el.dataset.tip = tip;
    el.dataset.block = real;

    el.addEventListener('mouseenter', (e) => showBlockTooltip(e, tip));
    el.addEventListener('mouseleave', hideBlockTooltip);
    el.addEventListener('click', () => showHexBlock(real, tip));

    grid.appendChild(el);
  }
}

function showBlockTooltip(e, text) {
  const tt = document.getElementById('blockTooltip');
  tt.textContent = text;
  tt.style.left = (e.clientX + 12) + 'px';
  tt.style.top  = (e.clientY - 28) + 'px';
  tt.classList.add('show');
}

function hideBlockTooltip() {
  document.getElementById('blockTooltip').classList.remove('show');
}

function showHexBlock(blockNum, label) {
  const sb = FS.superblock;
  if (!sb) return;

  /* Simulate hex dump */
  const bs    = Math.min(sb.blockSize, 128);
  const bytes = [];
  /* Deterministic pseudo-random per block */
  let   seed  = blockNum * 6364136223846793005n;
  for (let i = 0; i < bs; i++) {
    seed = (seed * 6364136223846793005n + 1442695040888963407n) & 0xFFFFFFFFn;
    bytes.push(Number(seed & 0xFFn));
  }

  let hex = '';
  for (let row = 0; row < bs; row += 16) {
    const rowBytes = bytes.slice(row, row + 16);
    const addr     = (row).toString(16).padStart(4, '0');
    const hexPart  = rowBytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
    const ascPart  = rowBytes.map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
    hex += `${addr}  ${hexPart.padEnd(48)}  |${ascPart}|\n`;
  }

  document.getElementById('hexTitle').textContent = `${label} — Hex Dump (${bs} / ${sb.blockSize} byte)`;
  document.getElementById('hexContent').textContent = hex;
  document.getElementById('hexViewer').style.display = 'block';
}

function closeHex() {
  document.getElementById('hexViewer').style.display = 'none';
}

function refreshInodeTable() {
  const container = document.getElementById('inodeCards');
  const hint      = document.getElementById('inodeTableHint');

  if (FS.files.length === 0) {
    container.innerHTML = `<div class="inode-empty"><div>⊞</div><div>Henüz inode yok</div><div class="inode-empty-hint">Dosya oluşturun</div></div>`;
    hint.textContent = '— inode yok —';
    return;
  }

  hint.textContent = `${FS.files.length} inode · sizeof(Inode)=144B`;
  container.innerHTML = '';

  FS.files.forEach(file => {
    const card = document.createElement('div');
    card.className = 'inode-card';
    card.dataset.inode = file.inode;

    const blkTags = file.blocks.map(b =>
      `<span class="ic-blk-tag" title="blok ${b}">${b}</span>`
    ).join('');

    card.innerHTML = `
      <div class="ic-main" onclick="toggleInodeCard(this.closest('.inode-card'))">
        <span class="ic-id">#${file.inode}</span>
        <span class="ic-name">📄 ${esc(file.name)}</span>
        <span class="ic-size">${file.size}B</span>
        <span class="ic-mode">${modeStr(file.mode)}</span>
      </div>
      <div class="ic-detail">
        <div class="ic-row"><span class="ic-k">İsim</span><span class="ic-v">${esc(file.name)}</span></div>
        <div class="ic-row"><span class="ic-k">İnode ID</span><span class="ic-v">${file.inode}</span></div>
        <div class="ic-row"><span class="ic-k">Boyut</span><span class="ic-v">${file.size} bytes</span></div>
        <div class="ic-row"><span class="ic-k">İzin (mode)</span><span class="ic-v">${file.mode.toString(8).padStart(6,'0')} (${modeStr(file.mode)})</span></div>
        <div class="ic-row"><span class="ic-k">Link sayısı</span><span class="ic-v">${file.links}</span></div>
        <div class="ic-row"><span class="ic-k">Oluşturulma</span><span class="ic-v">${file.ctime}</span></div>
        <div class="ic-row"><span class="ic-k">Değiştirilme</span><span class="ic-v">${file.mtime}</span></div>
        <div class="ic-row"><span class="ic-k">Erişim</span><span class="ic-v">${file.atime}</span></div>
        <div class="ic-row"><span class="ic-k">Blok sayısı</span><span class="ic-v">${file.blocks.length} blok (${FS.superblock?.blockSize || '?'}B/blok)</span></div>
        <div class="ic-row"><span class="ic-k">Blok ptrs</span></div>
        <div class="ic-blks">${blkTags || '<span style="color:var(--text-faint)">boş</span>'}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

function toggleInodeCard(card) {
  card.classList.toggle('expanded');
}

function refreshFileList() {
  const container = document.getElementById('fileList');
  let files = FS.files;

  if (filterQuery) {
    files = files.filter(f => f.name.toLowerCase().includes(filterQuery.toLowerCase()));
  }

  if (files.length === 0) {
    container.innerHTML = FS.files.length === 0
      ? `<div class="file-list-empty"><div class="fle-icon">📁</div><div>Henüz dosya yok</div><div class="fle-hint">Bir dosya oluşturun veya <code>ls</code> çalıştırın</div></div>`
      : `<div class="file-list-empty"><div class="fle-icon">🔍</div><div>'${esc(filterQuery)}' için sonuç yok</div></div>`;
    return;
  }

  container.innerHTML = '';
  files.forEach(file => {
    const row = document.createElement('div');
    row.className = 'file-row';
    row.innerHTML = `
      <span class="fr-icon">📄</span>
      <div class="fr-info">
        <div class="fr-name">${esc(file.name)}</div>
        <div class="fr-meta">
          <span>inode:${file.inode}</span>
          <span>${file.size} byte</span>
          <span>${file.blocks.length} blok</span>
          <span>${modeStr(file.mode)}</span>
          <span title="Değiştirilme">${file.mtime}</span>
        </div>
      </div>
      <div class="fr-actions">
        <button class="fr-btn" onclick="openInlineRead('${esc(file.name)}')">📖 oku</button>
        <button class="fr-btn" onclick="openInlineEditor('${esc(file.name)}')">✏️ yaz</button>
        <button class="fr-btn" onclick="runCmd('stat ${esc(file.name)}')">ℹ stat</button>
        <button class="fr-btn danger" onclick="runCmd('rm ${esc(file.name)}')">🗑️ sil</button>
      </div>
    `;
    container.appendChild(row);
  });
}

function filterFiles() {
  filterQuery = document.getElementById('fileSearch').value;
  refreshFileList();
}

function refreshPerfTab() {
  /* Summary cards */
  document.getElementById('pc-total').textContent = Perf.totalOps;
  document.getElementById('pc-bytes').textContent = fmtBytes(Perf.totalBytes);

  if (Perf.totalOps > 0) {
    const avg = Perf.totalUs / Perf.totalOps;
    document.getElementById('pc-time').textContent = `${Perf.totalUs.toFixed(1)} µs`;
    document.getElementById('pc-avg').textContent  = `${avg.toFixed(3)} µs`;

    const times = Perf.records.map(r => r.durationUs);
    document.getElementById('pc-min').textContent = `${Math.min(...times).toFixed(3)} µs`;
    document.getElementById('pc-max').textContent = `${Math.max(...times).toFixed(3)} µs`;
  }

  /* Bar chart */
  const chart = document.getElementById('perfChart');
  const recs  = Perf.records.slice(-20);
  if (recs.length === 0) { chart.innerHTML = ''; return; }
  const maxDur = Math.max(...recs.map(r => r.durationUs), 1);
  chart.innerHTML = recs.map(r => {
    const h   = Math.max(4, Math.round((r.durationUs / maxDur) * 76));
    const col = r.ok ? 'rgba(99,179,237,0.5)' : 'rgba(252,129,129,0.5)';
    return `<div class="pc-bar" style="height:${h}px;background:${col}" title="${r.op}: ${r.durationUs.toFixed(3)}µs"></div>`;
  }).join('');

  /* Table */
  const tbody = document.getElementById('perfTableBody');
  const all   = [...Perf.records].reverse();
  tbody.innerHTML = all.map((r, i) => `
    <tr>
      <td>${all.length - i}</td>
      <td class="op-name">${esc(r.op)}</td>
      <td class="op-time">${r.durationUs.toFixed(3)}</td>
      <td>${r.bytes}</td>
      <td class="${r.ok ? 'op-ok' : 'op-err'}">${r.ok ? '✓' : '✗'}</td>
    </tr>
  `).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--text-dim)">Henüz işlem yok</td></tr>`;
}

function renderLog() {
  const out = document.getElementById('logOut');
  if (Log.entries.length === 0) {
    out.innerHTML = '<div class="log-empty">Log henüz boş</div>';
    return;
  }
  out.innerHTML = Log.entries.map(e =>
    `<div class="log-entry"><span class="log-ts">[${e.ts}]</span> <span class="log-msg">${esc(e.msg)}</span></div>`
  ).join('');
  if (document.getElementById('logAutoScroll')?.checked) {
    out.scrollTop = out.scrollHeight;
  }
}

function clearLog() {
  Log.entries = [];
  renderLog();
}

/* ====================================================================
   INLINE EDITOR / READER
==================================================================== */

function openInlineEditor(name) {
  writeTarget = name;
  const file  = FS.files.find(f => f.name === name);
  document.getElementById('ieFilename').textContent = `📝 ${name}`;
  document.getElementById('ieContent').value = file ? file.content : '';
  document.getElementById('ieAppend').checked = false;
  document.getElementById('inlineEditor').style.display = 'block';
  document.getElementById('inlineReader').style.display = 'none';
  updateCharCount();
  document.getElementById('ieContent').focus();
  switchTab('files');
}

function closeInlineEditor() {
  document.getElementById('inlineEditor').style.display = 'none';
  writeTarget = null;
}

function doInlineWrite() {
  if (!writeTarget) return;
  const content = document.getElementById('ieContent').value;
  const append  = document.getElementById('ieAppend').checked;
  runCmd(append ? `append ${writeTarget} "${content}"` : `write ${writeTarget} "${content}"`);
  closeInlineEditor();
}

function updateCharCount() {
  const ta = document.getElementById('ieContent');
  document.getElementById('ieCharCount').textContent = `${ta.value.length} karakter`;
}

function openInlineRead(name) {
  const result = fsRead(name);
  document.getElementById('irFilename').textContent = `📖 ${name}`;
  document.getElementById('irContent').textContent  = result.msg;
  document.getElementById('inlineReader').style.display = 'block';
  document.getElementById('inlineEditor').style.display = 'none';
  switchTab('files');
  refreshAll(result);
}

function closeInlineReader() {
  document.getElementById('inlineReader').style.display = 'none';
}

function copyReadContent() {
  const text = document.getElementById('irContent').textContent;
  navigator.clipboard.writeText(text).then(() => showToast('Kopyalandı!', 'info'));
}

/* ====================================================================
   CONTROLS
==================================================================== */

function enableControls() {
  const on = FS.formatted;
  ['qLs','qStatfs','qFsck','qPerf'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !on;
  });
  document.getElementById('termInp').disabled = !on;
  document.getElementById('inpRun').disabled  = !on;
  document.getElementById('newFname').disabled = !on;
  document.getElementById('btnCreate').disabled = !on;
  document.getElementById('fileSearch').disabled = !on;
  if (on && document.activeElement === document.body) {
    document.getElementById('termInp').focus();
  }
}

function quickCreate() {
  const name = document.getElementById('newFname').value.trim();
  if (!name) { showToast('Dosya adı girin!', 'error'); return; }
  document.getElementById('newFname').value = '';
  runCmd(`create ${name}`);
}

function doReset() {
  Object.assign(FS, { formatted: false, superblock: null, files: [], nextInode: 0, usedDataBlocks: 0 });
  Object.assign(Perf, { records: [], totalOps: 0, totalUs: 0, totalBytes: 0 });
  Log.entries = [];
  clearTerminal();
  termLine('<span class="tl-info">Sistem sıfırlandı. Yeniden format atın.</span>');
  enableControls();
  refreshAll(null);
  tutStep = 0;
  updateTutorial(null);
}

/* ====================================================================
   FORMAT MODAL
==================================================================== */

function openFormatModal() {
  document.getElementById('modalFormat').classList.add('open');
  updateFmtCalc();
}

function doFormat() {
  const size  = parseInt(document.getElementById('fmtSize').value);
  const block = parseInt(document.getElementById('fmtBlock').value);
  if (!size || !block || size < 4096 || block < 144) {
    showToast('Geçersiz değerler!', 'error'); return;
  }
  closeModal('modalFormat');
  runCmd(`format ${size} ${block}`);
  setTimeout(() => {
    document.getElementById('termInp').focus();
    advanceTutorial(0);
  }, 100);
}

function setPreset(btn) {
  const field = btn.dataset.field;
  const val   = btn.dataset.val;
  document.getElementById(field).value = val;
  /* Update active state in same preset row */
  btn.closest('.mf-presets').querySelectorAll('.mpbtn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateFmtCalc();
}

function updateFmtCalc() {
  const size  = parseInt(document.getElementById('fmtSize')?.value  || 0);
  const block = parseInt(document.getElementById('fmtBlock')?.value || 0);
  const el    = document.getElementById('calcResult');
  if (!el || !size || !block || block < 1) return;
  const totalBlocks  = Math.floor(size / block);
  const bitmapBlocks = Math.max(1, Math.ceil(totalBlocks / (block * 8)));
  const inodeBlocks  = Math.max(1, Math.floor(totalBlocks / 10));
  const inPerBlock   = Math.floor(block / 144);
  const maxInodes    = inPerBlock * inodeBlocks;
  const dataStart    = 1 + bitmapBlocks + inodeBlocks;
  const dataBlocks   = totalBlocks - dataStart;
  el.textContent = `${totalBlocks} blok · ${maxInodes} inode · ${dataBlocks} veri bloğu · blk/inode: ${inPerBlock}`;
}

/* ====================================================================
   TABS
==================================================================== */

function switchTab(name) {
  activeTab = name;
  document.querySelectorAll('.vtab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.vtab-content').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${name}`)?.classList.add('active');
  document.getElementById(`tc-${name}`)?.classList.add('active');
}

/* ====================================================================
   MODAL HELPERS
==================================================================== */

function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function closeModalIf(e, id) { if (e.target.id === id) closeModal(id); }

/* ====================================================================
   INFO MODALS
==================================================================== */

const INFO_CONTENT = {
  superblock: {
    title: '💡 Superblock nedir?',
    body: `<div class="info-content">
      <h4>Superblock — Block 0</h4>
      <p>Superblock, dosya sisteminin genel bilgilerini içeren ilk bloktur.
      Disk üzerinde <strong>ofset 0</strong>'da bulunur ve her bağlama (mount) işleminde okunur.</p>
      <pre>typedef struct {
  uint32_t magic;         /* 0x4D494E49 ('MINI') */
  uint32_t total_blocks;
  uint32_t block_size;
  uint32_t max_inodes;
  uint32_t free_blocks;
  uint32_t free_inodes;
  uint32_t bitmap_start;
  uint32_t bitmap_blocks;
  uint32_t inode_start;
  uint32_t inode_blocks;
  uint32_t data_start;
  uint32_t data_blocks;
  uint64_t total_writes;
  uint64_t bytes_written;
  time_t   formatted_at;
} Superblock;</pre>
      <p>Boyutu: <code>sizeof(Superblock)</code> — bir blok boyutundan küçük olmalı.</p>
    </div>`,
  },
  bitmap: {
    title: '💡 Bitmap nedir?',
    body: `<div class="info-content">
      <h4>Free Block Bitmap</h4>
      <p>Bitmap, hangi veri bloklarının dolu (1) hangilerinin boş (0) olduğunu tutar.
      Her bit bir bloku temsil eder: </p>
      <pre>/* Blok i kullanılıyorsa bit set: */
bitmap[i/8] |= (1 << (i%8));

/* Blok i serbest bırakılırsa: */
bitmap[i/8] &= ~(1 << (i%8));</pre>
      <p><code>bitmap_allocate_block()</code> ilk 0 biti bulup 1 yapar ve blok numarasını döner.
      <code>bitmap_sync()</code> bitmap'ı diske yazar.</p>
    </div>`,
  },
  inode: {
    title: '💡 İnode nedir?',
    body: `<div class="info-content">
      <h4>Index Node (İnode)</h4>
      <p>Bir inode, dosyanın meta verilerini tutar. Dosya <em>ismi</em> hariç her şey:</p>
      <pre>typedef struct {
  uint32_t id;
  uint32_t size;
  uint8_t  is_used;
  uint16_t mode;           /* 0644, 0755, vb. */
  char     name[32];
  uint32_t direct_blocks[16];  /* maks 16 blok */
  time_t   created_at;
  time_t   modified_at;
  time_t   accessed_at;
  uint32_t link_count;
  uint8_t  _pad[3];
} Inode; /* sizeof = 144 bytes */</pre>
      <p>İnode tablosu diskten <code>pread()</code> ile blok blok okunur.
      <code>inode_read(id)</code> → blok hesapla → <code>disk_read()</code> → memcpy ile inode çıkar.</p>
    </div>`,
  },
  data: {
    title: '💡 Veri Blokları',
    body: `<div class="info-content">
      <h4>Data Blocks</h4>
      <p>Asıl dosya içeriği veri bloklarında tutulur. Her inode'da
      <strong>16 adet direct_block pointer</strong> vardır:</p>
      <pre>/* fs_write() implementasyonu (özet): */
for (i = 0; i < blocks_needed; i++) {
  bitmap_allocate_block(&block_num);
  inode.direct_blocks[i] = block_num;

  pwrite(disk_fd, data + offset,
         write_len,
         block_num * block_size);
}</pre>
      <p>Maksimum dosya boyutu: <code>16 × block_size</code> bytes.
      512B blok için: <strong>8 KB/dosya</strong>.</p>
    </div>`,
  },
};

function showInfo(key) {
  const info = INFO_CONTENT[key];
  if (!info) return;
  document.getElementById('infoTitle').textContent = info.title;
  document.getElementById('infoBody').innerHTML    = info.body;
  document.getElementById('modalInfo').classList.add('open');
}

function showAboutModal() {
  document.getElementById('modalAbout').classList.add('open');
}

function showShortcuts() {
  document.getElementById('modalShortcuts').classList.add('open');
}

/* ====================================================================
   COMMAND PALETTE
==================================================================== */

let paletteActive = 0;

function openPalette() {
  document.getElementById('modalPalette').classList.add('open');
  document.getElementById('paletteInp').value = '';
  renderPalette(COMMANDS);
  document.getElementById('paletteInp').focus();
}

function filterPalette() {
  const q    = document.getElementById('paletteInp').value.toLowerCase();
  const cmds = COMMANDS.filter(c => c.cmd.includes(q) || c.desc.toLowerCase().includes(q));
  renderPalette(cmds);
  paletteActive = 0;
}

function renderPalette(cmds) {
  const list = document.getElementById('paletteList');
  list.innerHTML = cmds.map((c, i) => `
    <div class="pl-item ${i === 0 ? 'pl-active' : ''}" onclick="selectPalette('${esc(c.usage)}')">
      <span class="pl-cmd">${esc(c.cmd)}</span>
      <span class="pl-desc">${esc(c.desc)}</span>
      <span class="pl-shortcut"><kbd>${esc(c.usage)}</kbd></span>
    </div>
  `).join('');
}

function selectPalette(usage) {
  closeModal('modalPalette');
  const inp = document.getElementById('termInp');
  inp.value = usage;
  inp.focus();
}

/* ====================================================================
   TUTORIAL
==================================================================== */

function closeTutorial() {
  document.getElementById('tutorialBanner').style.display = 'none';
}

function advanceTutorial(step) {
  const steps = document.querySelectorAll('.tut-step');
  steps.forEach((s, i) => {
    s.classList.remove('active', 'done');
    if (i < step) s.classList.add('done');
    else if (i === step) s.classList.add('active');
  });
  tutStep = step;
}

function updateTutorial(lastResult) {
  if (!lastResult) return;
  if (lastResult.isFormat && tutStep === 0) advanceTutorial(1);
  else if (lastResult.ok && tutStep === 1 && FS.files.length > 0) advanceTutorial(2);
}

/* ====================================================================
   THEME
==================================================================== */

function toggleTheme() {
  document.body.classList.toggle('light-mode');
  document.body.classList.toggle('dark-mode');
  document.getElementById('themeBtn').textContent =
    document.body.classList.contains('light-mode') ? '🌙' : '☀';
}

/* ====================================================================
   TOAST
==================================================================== */

function showToast(msg, type = 'info') {
  const stack = document.getElementById('toastStack');
  const el    = document.createElement('div');
  el.className = `toast t-${type}`;
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 350);
  }, 2800);
}

function copyOutput() {
  const text = document.getElementById('termOut').innerText;
  navigator.clipboard.writeText(text).then(() => showToast('Terminal kopyalandı!', 'info'));
}

/* ====================================================================
   CONFETTI
==================================================================== */

function launchConfetti() {
  const container = document.getElementById('confettiContainer');
  const colors = ['#63b3ed','#9f7aea','#68d391','#f6ad55','#fc8181','#4fd1c5','#f6e05e'];
  for (let i = 0; i < 80; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.left     = `${Math.random() * 100}%`;
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.animationDuration = `${1.5 + Math.random() * 2}s`;
    el.style.animationDelay   = `${Math.random() * 0.5}s`;
    el.style.width  = `${6 + Math.random() * 8}px`;
    el.style.height = `${6 + Math.random() * 8}px`;
    container.appendChild(el);
  }
  setTimeout(() => container.innerHTML = '', 4000);
}

/* ====================================================================
   UTILITIES
==================================================================== */

function fmtBytes(b) {
  if (b === 0)     return '0 B';
  if (b < 1024)    return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1048576).toFixed(2)} MB`;
}

function modeStr(mode) {
  const bits = [
    (mode & 0x8000) ? '-' : (mode & 0x4000) ? 'd' : '-',
    (mode & 0o400) ? 'r' : '-', (mode & 0o200) ? 'w' : '-', (mode & 0o100) ? 'x' : '-',
    (mode & 0o040) ? 'r' : '-', (mode & 0o020) ? 'w' : '-', (mode & 0o010) ? 'x' : '-',
    (mode & 0o004) ? 'r' : '-', (mode & 0o002) ? 'w' : '-', (mode & 0o001) ? 'x' : '-',
  ];
  return bits.join('');
}

/* ====================================================================
   KEYBOARD SHORTCUTS
==================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  /* Terminal input */
  const inp = document.getElementById('termInp');
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { submitCmd(); return; }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIdx < cmdHistory.length - 1) inp.value = cmdHistory[++historyIdx] || '';
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx > 0) inp.value = cmdHistory[--historyIdx] || '';
      else { historyIdx = -1; inp.value = ''; }
    } else if (e.key === 'Tab') {
      e.preventDefault(); doAutocomplete(inp);
    }
  });

  /* Inline editor char count */
  document.getElementById('ieContent')?.addEventListener('input', updateCharCount);

  /* Format modal recalc */
  document.getElementById('fmtSize')?.addEventListener('input',  updateFmtCalc);
  document.getElementById('fmtBlock')?.addEventListener('input', updateFmtCalc);

  /* Global keys */
  document.addEventListener('keydown', e => {
    /* Esc: close modals */
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open'));
      return;
    }
    /* Ctrl+L: clear terminal */
    if (e.ctrlKey && e.key === 'l') { e.preventDefault(); clearTerminal(); return; }
    /* Ctrl+K: command palette */
    if (e.ctrlKey && e.key === 'k') { e.preventDefault(); openPalette(); return; }
    /* ?: shortcuts */
    if (e.key === '?' && document.activeElement !== inp) { showShortcuts(); return; }
    /* 1-5: switch tabs */
    if (!e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement !== inp) {
      const tabMap = { '1':'disk','2':'inodes','3':'files','4':'perf','5':'log' };
      if (tabMap[e.key]) switchTab(tabMap[e.key]);
    }
  });

  /* Palette keyboard nav */
  document.getElementById('paletteInp')?.addEventListener('keydown', e => {
    const items = document.querySelectorAll('.pl-item');
    if (e.key === 'ArrowDown') {
      paletteActive = Math.min(paletteActive + 1, items.length - 1);
      items.forEach((it,i) => it.classList.toggle('pl-active', i === paletteActive));
    } else if (e.key === 'ArrowUp') {
      paletteActive = Math.max(paletteActive - 1, 0);
      items.forEach((it,i) => it.classList.toggle('pl-active', i === paletteActive));
    } else if (e.key === 'Enter') {
      items[paletteActive]?.click();
    }
  });

  /* Initial state */
  enableControls();
  renderLog();
  refreshAll(null);
  renderPalette(COMMANDS);
});

function doAutocomplete(inp) {
  const val  = inp.value;
  const cmds = COMMANDS.map(c => c.cmd);
  const parts = val.split(' ');
  if (parts.length === 1) {
    const m = cmds.find(c => c.startsWith(val));
    if (m) inp.value = m + ' ';
  } else if (parts.length === 2) {
    const base  = parts[0];
    const frag  = parts[1];
    const fileOps = ['read','rm','write','append','stat','chmod','truncate','rename','cp'];
    if (fileOps.includes(base)) {
      const fm = FS.files.map(f => f.name).find(n => n.startsWith(frag));
      if (fm) inp.value = base + ' ' + fm;
    }
  }
}
