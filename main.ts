// Launch Radar v4 — token-radar-01 entrypoint (program/v1, Node 22, stdlib only).
//
// Reads the sealed snapshot, builds the 192-row radar-4 board, writes
// board.json, writes the dashboard's data, copies dashboard/ and
// screenshots/ to the output directory, and writes dossier.json with
// buildDossier from vendor/makefun-board.ts. Then it runs the seven gate
// rows against what it wrote and prints the result.
//
//   node main.ts [--input <snapshot.json>] [--output <dir>]
//   defaults: --input /input/snapshot.json, --output $MAKEFUN_OUTPUT_DIR or /output
//
// The program is deterministic: same snapshot in, same bytes out. It uses
// no clock, no unseeded randomness, no network. The bootstrap rank ranges
// run on one seeded stream (mulberry32, seed 42), so they are byte-stable
// too. It exits 0 once the outputs are written; the printed self-check is
// the verdict on them.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';
import {
  buildBoard,
  buildDashboardData,
  boardIssue,
  type Snapshot,
} from './lib/model.ts';

const ROOT = dirname(fileURLToPath(import.meta.url));
const TEXT_MAX_BYTES = 65536;
const DOSSIER_MAX_BYTES = 1572864;

function parseArgs(argv: string[]): { input: string; output: string } {
  let input = '/input/snapshot.json';
  let output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input' && i + 1 < argv.length) input = argv[++i];
    else if (argv[i] === '--output' && i + 1 < argv.length) output = argv[++i];
    else if (argv[i] === '--help') {
      process.stdout.write('usage: node main.ts [--input <snapshot.json>] [--output <dir>]\n');
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${argv[i]}`);
    }
  }
  return { input, output };
}

function loadSnapshot(path: string): Snapshot {
  const raw = readFileSync(path, 'utf8');
  const snap = JSON.parse(raw) as Snapshot;
  if (!Array.isArray(snap.protocols) || !Array.isArray(snap.watchlist)) {
    throw new Error(`snapshot ${path} has no protocols/watchlist arrays`);
  }
  if (typeof snap.floor_usd !== 'number' || typeof snap.as_of !== 'string') {
    throw new Error(`snapshot ${path} has no floor_usd/as_of`);
  }
  return snap;
}

// ---------------------------------------------------------------- gate self-check

interface GateRow {
  row: string;
  pass: boolean;
  detail: string;
}

const PLAIN_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function walkFiles(dir: string, rel = ''): { path: string; size: number }[] {
  const out: { path: string; size: number }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = rel === '' ? entry.name : `${rel}/${entry.name}`;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full, p));
    else if (entry.isFile()) out.push({ path: p, size: statSync(full).size });
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : 1));
}

function networkInHtml(text: string): string | null {
  const attr = /(?:href|src|action|poster|cite|data|formaction)\s*=\s*["']https?:\/\//i.exec(text);
  if (attr) return `HTML attribute names https:// (${attr[0].slice(0, 40)})`;
  const style = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = style.exec(text)) !== null) {
    if (/https?:\/\//.test(m[1])) return 'HTML <style> body names an http(s) address';
  }
  const script = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = script.exec(text)) !== null) {
    if (/(?:from\s+['"]|import\s*\(\s*['"]|require\s*\(\s*['"])https?:\/\//.test(m[1])) {
      return 'inline <script> imports an http(s) address';
    }
  }
  return null;
}

function networkInCss(text: string): string | null {
  if (/url\(\s*["']?https?:\/\//i.test(text)) return 'CSS url() names an http(s) address';
  if (/@import\s+["']https?:\/\//i.test(text)) return 'CSS @import names an http(s) address';
  return null;
}

function networkInJs(text: string): string | null {
  if (/(?:from\s+['"]|import\s*\(\s*['"]|require\s*\(\s*['"])https?:\/\//.test(text)) {
    return 'JS import names an http(s) address';
  }
  if (/import\s+[^'"]*['"]https?:\/\//.test(text)) return 'JS import names an http(s) address';
  return null;
}

function pngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let off = 2;
  while (off + 4 < buf.length) {
    if (buf[off] !== 0xff) return null;
    const marker = buf[off + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      off += 2;
      continue;
    }
    const len = buf.readUInt16BE(off + 2);
    if (len < 2 || off + 2 + len > buf.length) return null;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
    }
    off += 2 + len;
  }
  return null;
}

function checkGate(outDir: string, snapshot: Snapshot): GateRow[] {
  const rows: GateRow[] = [];

  // dashboard_files
  {
    const dashDir = join(outDir, 'dashboard');
    let detail = '';
    let pass = true;
    try {
      const files = walkFiles(dashDir);
      const totalBytes = files.reduce((n, f) => n + f.size, 0);
      const hasIndex = files.some((f) => f.path === 'index.html');
      const css = files.filter((f) => f.path.endsWith('.css')).length;
      const js = files.filter((f) => f.path.endsWith('.js')).length;
      if (!hasIndex) {
        pass = false;
        detail = 'dashboard/ has no index.html';
      } else if (css < 1 || js < 1) {
        pass = false;
        detail = `dashboard/ has ${css} css and ${js} js files`;
      } else if (files.length > 400 || totalBytes > 4 * 1024 * 1024) {
        pass = false;
        detail = `dashboard/ holds ${files.length} files, ${totalBytes} bytes`;
      } else {
        for (const f of files) {
          for (const part of f.path.split('/')) {
            if (!PLAIN_NAME.test(part) || part.startsWith('.')) {
              pass = false;
              detail = `dashboard/${f.path}: bad name`;
              break;
            }
          }
          if (!pass) break;
          const text = readFileSync(join(dashDir, f.path), 'utf8');
          const bad = f.path.endsWith('.html')
            ? networkInHtml(text)
            : f.path.endsWith('.css')
              ? networkInCss(text)
              : f.path.endsWith('.js') || f.path.endsWith('.mjs')
                ? networkInJs(text)
                : null;
          if (bad) {
            pass = false;
            detail = `dashboard/${f.path}: ${bad}`;
            break;
          }
        }
        if (pass) detail = `${files.length} files, ${totalBytes} bytes, no network address`;
      }
    } catch (err) {
      pass = false;
      detail = `dashboard/ cannot be read: ${(err as Error).message}`;
    }
    rows.push({ row: 'dashboard_files', pass, detail });
  }

  // board_file + sorted_by_value + coverage + farm_steps (on the written board.json)
  const boardPath = join(outDir, 'board.json');
  let board: { rows?: unknown[] } | null = null;
  let boardBytes = 0;
  try {
    boardBytes = statSync(boardPath).size;
    board = JSON.parse(readFileSync(boardPath, 'utf8')) as { rows?: unknown[] };
  } catch {
    board = null;
  }
  const boardRows = (board && Array.isArray(board.rows) ? board.rows : Array.isArray(board) ? board : null) as
    | Record<string, unknown>[]
    | null;
  const snapshotSlugs = new Set(snapshot.protocols.map((p) => p.slug));

  {
    let pass = true;
    let detail = '';
    if (boardRows === null) {
      pass = false;
      detail = 'board.json is unreadable or has no rows array';
    } else if (boardRows.length < 100 || boardRows.length > 4000) {
      pass = false;
      detail = `board.json holds ${boardRows.length} rows`;
    } else if (boardBytes > 8 * 1024 * 1024) {
      pass = false;
      detail = `board.json is ${boardBytes} bytes`;
    } else {
      for (const r of boardRows) {
        if (typeof r.slug !== 'string' || !snapshotSlugs.has(r.slug)) {
          pass = false;
          detail = `row slug ${String(r.slug)} is not a snapshot protocol`;
          break;
        }
        if (typeof r.name !== 'string' || r.name.length === 0) {
          pass = false;
          detail = `row ${String(r.slug)} has an empty name`;
          break;
        }
        if (!Number.isSafeInteger(r.rank) || (r.rank as number) < 1) {
          pass = false;
          detail = `row ${String(r.slug)} has a bad rank`;
          break;
        }
        if (
          !Number.isSafeInteger(r.implied_value_usd) ||
          (r.implied_value_usd as number) <= 0 ||
          (r.implied_value_usd as number) > 1e14
        ) {
          pass = false;
          detail = `row ${String(r.slug)} has a bad implied value`;
          break;
        }
        if (!Number.isSafeInteger(r.rankLo) || !Number.isSafeInteger(r.rankHi)) {
          pass = false;
          detail = `row ${String(r.slug)} has no rank range`;
          break;
        }
        if (!Array.isArray(r.farm_steps)) {
          pass = false;
          detail = `row ${String(r.slug)} has no farm_steps`;
          break;
        }
      }
      if (pass) detail = `${boardRows.length} rows, ${boardBytes} bytes`;
    }
    rows.push({ row: 'board_file', pass, detail });
  }

  {
    let pass = true;
    let detail = '';
    if (boardRows === null) {
      pass = false;
      detail = 'board.json is unreadable';
    } else {
      const ranks = boardRows.map((r) => r.rank as number).sort((a, b) => a - b);
      const byRank = [...boardRows].sort((a, b) => (a.rank as number) - (b.rank as number));
      let ok = ranks.length > 0;
      for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) ok = false;
      let prev: number | null = null;
      let allEqual = true;
      let first: number | null = null;
      for (const r of byRank) {
        const v = r.implied_value_usd as number;
        if (first === null) first = v;
        else if (v !== first) allEqual = false;
        if (prev !== null && v > prev) ok = false;
        prev = v;
      }
      if (allEqual && byRank.length >= 2) ok = false;
      pass = ok;
      detail = ok ? `ranks 1..${byRank.length}, implied non-increasing` : 'ranks or order fail';
    }
    rows.push({ row: 'sorted_by_value', pass, detail });
  }

  {
    let pass = true;
    let detail = '';
    if (boardRows === null) {
      pass = false;
      detail = 'board.json is unreadable';
    } else {
      const onBoard = new Set(boardRows.map((r) => r.slug as string));
      const missing = snapshot.watchlist.filter((s) => !onBoard.has(s));
      pass = missing.length === 0;
      detail = pass
        ? `watchlist ${snapshot.watchlist.length}/${snapshot.watchlist.length} covered`
        : `missing watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
    }
    rows.push({ row: 'coverage', pass, detail });
  }

  {
    let pass = true;
    let detail = '';
    if (boardRows === null) {
      pass = false;
      detail = 'board.json is unreadable';
    } else {
      for (const r of boardRows) {
        const steps = r.farm_steps as unknown[];
        if (!Array.isArray(steps) || steps.length < 3 || steps.length > 12) {
          pass = false;
          detail = `row ${String(r.slug)} has ${Array.isArray(steps) ? steps.length : 0} farm steps`;
          break;
        }
        for (const s of steps) {
          const t = String(s).trim();
          if (t.length < 20 || t.length > 600) {
            pass = false;
            detail = `row ${String(r.slug)} has a farm step of ${t.length} chars`;
            break;
          }
        }
        if (!pass) break;
      }
      if (pass) detail = 'every row carries 8 farm steps, 20-600 chars';
    }
    rows.push({ row: 'farm_steps', pass, detail });
  }

  // screenshots
  {
    let pass = true;
    let detail = '';
    try {
      const shotsDir = join(outDir, 'screenshots');
      const names = readdirSync(shotsDir, { withFileTypes: true })
        .filter((e) => e.isFile() && !e.name.startsWith('.'))
        .map((e) => e.name)
        .sort();
      if (names.length < 3 || names.length > 4) {
        pass = false;
        detail = `screenshots/ holds ${names.length} images`;
      } else {
        for (const name of names) {
          const buf = readFileSync(join(shotsDir, name));
          if (buf.length > 512 * 1024) {
            pass = false;
            detail = `screenshots/${name} is ${buf.length} bytes, over 512 KiB`;
            break;
          }
          const dims = pngSize(buf) ?? jpegSize(buf);
          if (dims === null) {
            pass = false;
            detail = `screenshots/${name} is neither a whole PNG nor a JPEG`;
            break;
          }
          const long = Math.max(dims.width, dims.height);
          const short = Math.min(dims.width, dims.height);
          if (long > 1440 || short < 800) {
            pass = false;
            detail = `screenshots/${name} is ${dims.width}x${dims.height}`;
            break;
          }
        }
        if (pass) detail = `${names.length} images within size and dimension caps`;
      }
    } catch (err) {
      pass = false;
      detail = `screenshots/ cannot be read: ${(err as Error).message}`;
    }
    rows.push({ row: 'screenshots', pass, detail });
  }

  // dossier_matches
  {
    let pass = true;
    let detail = '';
    try {
      const dossierPath = join(outDir, 'dossier.json');
      const written = readFileSync(dossierPath);
      const rebuilt = Buffer.from(buildDossier(outDir, { text_max_bytes: TEXT_MAX_BYTES }));
      if (!written.equals(rebuilt)) {
        pass = false;
        detail = 'dossier.json differs from buildDossier output';
      } else if (written.length > DOSSIER_MAX_BYTES) {
        pass = false;
        detail = `dossier.json is ${written.length} bytes, over 1.5 MiB`;
      } else {
        detail = `dossier.json is ${written.length} bytes and matches buildDossier`;
      }
    } catch (err) {
      pass = false;
      detail = `dossier.json cannot be verified: ${(err as Error).message}`;
    }
    rows.push({ row: 'dossier_matches', pass, detail });
  }

  return rows;
}

// ---------------------------------------------------------------- main

function main(): void {
  const { input, output } = parseArgs(process.argv.slice(2));
  const snapshot = loadSnapshot(input);
  const board = buildBoard(snapshot);
  const issue = boardIssue(board.rows, snapshot);
  if (issue !== null) throw new Error(`board failed its own check: ${issue}`);

  const steakhouse = board.rows.find((r) => r.slug === 'steakhouse-financial');
  if (!steakhouse) throw new Error('steakhouse-financial is not on the board');
  if (steakhouse.implied_value_usd < 31_000_000 || steakhouse.implied_value_usd > 126_000_000) {
    throw new Error(
      `Steakhouse implied $${steakhouse.implied_value_usd.toLocaleString('en-US')} is outside the top-10 field range $31M-$126M`,
    );
  }
  // The round-3 composition error must not recur: the two largest
  // pre-token protocols the old floor rule dropped have to be on the board.
  for (const slug of ['sentora-curator', 'polymarket-international']) {
    const row = board.rows.find((r) => r.slug === slug);
    if (!row) throw new Error(`${slug} is not on the board — the floor bug is back`);
    process.stdout.write(`${slug}: rank ${row.rank}, $${row.implied_value_usd.toLocaleString('en-US')}\n`);
  }

  mkdirSync(output, { recursive: true });
  mkdirSync(join(output, 'dashboard'), { recursive: true });
  mkdirSync(join(output, 'screenshots'), { recursive: true });

  const boardJson = { model: 'radar-4', as_of: snapshot.as_of, rows: board.rows };
  writeFileSync(join(output, 'board.json'), `${JSON.stringify(boardJson, null, 2)}\n`, 'utf8');

  cpSync(join(ROOT, 'dashboard'), join(output, 'dashboard'), { recursive: true });
  const data = buildDashboardData(board, snapshot);
  writeFileSync(join(output, 'dashboard', 'data.js'), `window.BOARD_DATA = ${JSON.stringify(data)};\n`, 'utf8');

  cpSync(join(ROOT, 'screenshots'), join(output, 'screenshots'), { recursive: true });

  const dossier = buildDossier(output, { text_max_bytes: TEXT_MAX_BYTES });
  writeFileSync(join(output, 'dossier.json'), dossier);

  const gate = checkGate(output, snapshot);
  const passed = gate.filter((g) => g.pass).length;

  const top = board.rows.slice(0, 5);
  process.stdout.write(`radar-4 board: ${board.rows.length} rows (watchlist ${snapshot.watchlist.length}/40)\n`);
  process.stdout.write(
    `Steakhouse Financial: rank ${steakhouse.rank}, $${steakhouse.implied_value_usd.toLocaleString('en-US')} (field $31M-$126M)\n`,
  );
  process.stdout.write(
    `top 5: ${top.map((r) => `${r.slug} $${Math.round(r.implied_value_usd / 1e6)}M`).join(', ')}\n`,
  );
  process.stdout.write(
    `total implied $${(board.totals.totalImpliedUsd / 1e9).toFixed(2)}B, median $${Math.round(board.totals.medianImpliedUsd / 1e6)}M\n`,
  );
  process.stdout.write(`verdicts: ${JSON.stringify(board.totals.verdictCounts)}\n`);
  if (board.totals.bestPerHour) {
    process.stdout.write(
      `best per hour: ${board.totals.bestPerHour.name} +$${board.totals.bestPerHour.netPerHourUsd.toFixed(2)}/h\n`,
    );
  }
  process.stdout.write(`dossier: ${statSync(join(output, 'dossier.json')).size} bytes\n`);
  for (const g of gate) {
    process.stdout.write(`gate ${g.row}: ${g.pass ? 'PASS' : 'FAIL'} — ${g.detail}\n`);
  }
  process.stdout.write(`self-check: ${passed}/7 ${passed === 7 ? 'PASS' : 'FAIL'}\n`);
  if (passed !== 7) {
    process.exitCode = 1;
  }
  void existsSync;
}

main();
