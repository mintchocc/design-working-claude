// Renders index.html frame-by-frame and encodes to MP4 (1920x1080, 30fps).
// Usage: node render.mjs [out.mp4] [--stills 1,3.5,8,11,14]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2);
const stillsIdx = args.indexOf('--stills');
const stills = stillsIdx >= 0 ? args[stillsIdx + 1].split(',').map(Number) : null;
const out = (stillsIdx === 0 ? null : args[0]) || path.join(here, 'tacp-intro.mp4');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(here, 'index.html')).href + '?render=1');
await page.waitForFunction(() => window.__ready === true);
const { dur, fps } = await page.evaluate(() => ({ dur: window.__DURATION, fps: window.__FPS }));

if (stills) {
  for (const t of stills) {
    await page.evaluate(t => window.renderAt(t), t);
    await page.screenshot({ path: path.join(here, `still-${t}s.png`) });
  }
  await browser.close();
  process.exit(0);
}

const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'slow', '-movflags', '+faststart', out],
  { stdio: ['pipe', 'ignore', 'inherit'] });

const total = Math.round(dur * fps);
for (let f = 0; f < total; f++) {
  await page.evaluate(t => window.renderAt(t), f / fps);
  ff.stdin.write(await page.screenshot({ type: 'png' }));
}
ff.stdin.end();
await new Promise(r => ff.on('close', r));
await browser.close();
console.log('wrote', out, total, 'frames');
