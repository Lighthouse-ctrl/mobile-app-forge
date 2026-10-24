#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config' || a === '-c') out.config = argv[++i];
    else if (a === '--url') out.url = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--port') out.port = Number(argv[++i]);
    else if (a === '--keep') out.keep = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const configPath = path.resolve(args.config || 'qa.json');
if (!fs.existsSync(configPath)) {
  console.error(`config not found: ${configPath}`);
  process.exit(2);
}

const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (args.url) cfg.url = args.url;
if (args.out) cfg.out = args.out;
if (!cfg.url) {
  console.error('config.url is required');
  process.exit(2);
}

const outDir = path.resolve(cfg.out || 'shots');
fs.mkdirSync(outDir, { recursive: true });

const viewports = cfg.viewports && cfg.viewports.length
  ? cfg.viewports
  : [{ name: '390x844', width: 390, height: 844, dpr: 2, steps: [{ name: 'main', wait: 700 }] }];

const edgeCandidates = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);
const browserPath = edgeCandidates.find((p) => fs.existsSync(p));
if (!browserPath) {
  console.error('Edge/Chrome not found; set EDGE_PATH');
  process.exit(2);
}

const port = args.port || 9500 + Math.floor(Math.random() * 400);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-mobile-'));
const proc = spawn(browserPath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-sync',
  '--disable-background-networking',
  '--hide-scrollbars',
  '--window-size=1280,900',
  'about:blank',
], { stdio: 'ignore', windowsHide: true });
proc.on('error', () => {});

async function waitForBrowser() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) });
      const v = await r.json();
      if (v.webSocketDebuggerUrl) return v.webSocketDebuggerUrl;
    } catch {}
    await sleep(400);
  }
  throw new Error('browser did not start');
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let seq = 0;
    const timer = setTimeout(() => reject(new Error('ws open timeout')), 10000);
    ws.onopen = () => {
      clearTimeout(timer);
      resolve({
        send(method, params = {}, sessionId = null, timeoutMs = 60000) {
          return new Promise((res, rej) => {
            const id = ++seq;
            const t = setTimeout(() => {
              pending.delete(id);
              rej(new Error(`timeout: ${method}`));
            }, timeoutMs);
            pending.set(id, { res, rej, t });
            ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
          });
        },
        close() {
          try { ws.close(); } catch {}
        },
      });
    };
    ws.onerror = () => reject(new Error('ws error'));
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id && pending.has(msg.id)) {
        const { res, rej, t } = pending.get(msg.id);
        clearTimeout(t);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
      }
    };
  });
}

const cleanup = () => {
  try { proc.kill(); } catch {}
  if (!args.keep) {
    setTimeout(() => {
      try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    }, 600);
  }
};

let client = null;
let sessionId = null;
let failures = 0;

async function ev(expr) {
  const r = await client.send('Runtime.evaluate', {
    expression: expr,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'eval failed');
  }
  return r.result.value;
}

const measureExpr = `(() => {
  const w = innerWidth;
  const skip = '.drawer, .sheet, .overlay, .toast, .float-msg';
  const svgTags = new Set(['svg', 'g', 'path', 'circle', 'rect', 'text', 'ellipse', 'line', 'defs', 'use']);
  const offenders = [...document.querySelectorAll('body *')]
    .filter((el) => !el.closest(skip) && !svgTags.has(el.tagName.toLowerCase()))
    .map((el) => {
      const r = el.getBoundingClientRect();
      const cls = typeof el.className === 'string' ? el.className : '';
      return { tag: el.tagName.toLowerCase(), cls: cls.slice(0, 40), right: Math.round(r.right), left: Math.round(r.left) };
    })
    .filter((o) => o.right > w + 1 || o.left < -1)
    .slice(0, 6);
  return JSON.stringify({ vw: w, scrollW: document.documentElement.scrollWidth, offenders });
})()`;

try {
  const wsUrl = await waitForBrowser();
  client = await connect(wsUrl);

  const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
  const attached = await client.send('Target.attachToTarget', { targetId, flatten: true });
  sessionId = attached.sessionId;
  await client.send('Page.enable', {}, sessionId);
  await client.send('Runtime.enable', {}, sessionId);

  const initScript = `window.__qaErrors = [];
    window.addEventListener('error', (e) => window.__qaErrors.push(String(e.message)));
    window.addEventListener('unhandledrejection', (e) => window.__qaErrors.push('rejection: ' + e.reason));
    ${cfg.clearStorage ? 'try { localStorage.clear(); } catch (e) {}' : ''}`;
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: initScript }, sessionId);

  let shotCount = 0;
  for (const vp of viewports) {
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: vp.dpr || 2,
      mobile: true,
    }, sessionId);

    await client.send('Page.navigate', { url: cfg.url }, sessionId);
    await sleep(300);
    for (let i = 0; i < 60; i++) {
      try {
        if ((await ev('document.readyState')) === 'complete') break;
      } catch {}
      await sleep(100);
    }
    await sleep(cfg.settleMs || 800);

    const steps = vp.steps && vp.steps.length ? vp.steps : [{ name: 'main' }];
    for (const step of steps) {
      if (step.js) {
        try {
          await ev(step.js);
        } catch (e) {
          failures++;
          console.log(`[eval-error] ${vp.name}/${step.name}: ${e.message}`);
        }
      }
      await sleep(step.wait == null ? 450 : step.wait);

      const name = `${vp.name}-${step.name}`;
      const shot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true }, sessionId);
      const file = path.join(outDir, `${name}.png`);
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
      shotCount++;

      let layout = null;
      let errors = [];
      try {
        layout = JSON.parse(await ev(measureExpr));
        errors = await ev('JSON.stringify(window.__qaErrors || [])');
      } catch {}
      const overflow = layout && layout.scrollW > layout.vw ? ` OVERFLOW scrollW=${layout.scrollW}/${layout.vw}` : '';
      console.log(`${name}.png${overflow} errors=${errors}`);
      if (overflow && layout.offenders && layout.offenders.length) {
        console.log('  offenders: ' + JSON.stringify(layout.offenders));
      }
    }
  }

  const remaining = JSON.parse(await ev('JSON.stringify(window.__qaErrors || [])'));
  if (remaining.length) {
    failures += remaining.length;
    console.log('[js-errors] ' + JSON.stringify(remaining));
  }
  console.log(`done: ${shotCount} screenshots -> ${outDir}`);
  if (failures) console.log(`warnings: ${failures}`);
} catch (e) {
  console.error('QA failed:', e.message);
  process.exitCode = 1;
} finally {
  try { if (client) client.close(); } catch {}
  cleanup();
}

