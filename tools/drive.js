#!/usr/bin/env node
'use strict';

/**
 * CDP driver for Chrome on port 9223 — acts on the browser, not just reads it.
 *
 * Commands:
 *   node drive.js tabs
 *   node drive.js goto <tabIndex|new> <url>
 *   node drive.js eval <tabIndex> <js>
 *   node drive.js click <tabIndex> <selector>
 *   node drive.js type <tabIndex> <selector> <text>
 *   node drive.js upload <tabIndex> <selector> <filePath>
 *   node drive.js shot <tabIndex> <outfile>
 *   node drive.js wait <tabIndex> <selector> [timeoutMs]
 */

const fs = require('node:fs');

const PORT = 9223;
const HOST = '127.0.0.1';

async function listTargets() {
  const r = await fetch(`http://${HOST}:${PORT}/json/list`);
  return r.json();
}

function pagesOf(t) {
  return t.filter((x) => x.type === 'page' && x.webSocketDebuggerUrl);
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();

  ws.addEventListener('message', (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (m.id && pending.has(m.id)) {
      const { resolve } = pending.get(m.id);
      pending.delete(m.id);
      resolve(m);
    }
  });

  const send = (method, params = {}, timeoutMs = 30000) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
    setTimeout(() => {
      if (pending.has(i)) { pending.delete(i); reject(new Error(`timeout: ${method}`)); }
    }, timeoutMs);
  });

  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', () => rej(new Error('ws connect failed')));
  });

  return { ws, send };
}

async function pickTab(index) {
  const t = pagesOf(await listTargets());
  const tab = t[Number(index)];
  if (!tab) throw new Error(`no tab at index ${index} (hay ${t.length})`);
  return tab;
}

async function rpc(tab, fn) {
  const { ws, send } = await connect(tab.webSocketDebuggerUrl);
  try {
    await send('Runtime.enable');
    return await fn(send);
  } finally {
    try { ws.close(); } catch {}
  }
}

async function evaluate(tab, expression) {
  return rpc(tab, async (send) => {
    const r = await send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true, userGesture: true,
    });
    if (r.result?.exceptionDetails) {
      throw new Error(r.result.exceptionDetails.exception?.description || 'eval threw');
    }
    return r.result?.result?.value;
  });
}

function out(v) {
  console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
}

const [, , cmd, ...rest] = process.argv;

(async () => {
  switch (cmd) {
    case 'tabs': {
      pagesOf(await listTargets()).forEach((p, i) => {
        console.log(`[${i}] ${(p.title || '?').slice(0, 68)}`);
        console.log(`    ${(p.url || '').slice(0, 108)}`);
      });
      break;
    }

    case 'goto': {
      const [idx, url] = rest;
      if (idx === 'new') {
        await fetch(`http://${HOST}:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
        console.log('nueva pestaña:', url);
      } else {
        await evaluate(await pickTab(idx), `location.href=${JSON.stringify(url)}; 'ok'`);
        console.log('navegando a', url);
      }
      break;
    }

    case 'eval':
      out(await evaluate(await pickTab(rest[0]), rest.slice(1).join(' ')));
      break;

    case 'click': {
      const [idx, sel] = rest;
      const tab = await pickTab(idx);
      const r = await evaluate(tab, `(() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return 'NO_ENCONTRADO';
        el.scrollIntoView({block:'center'});
        el.click();
        return 'CLICK_OK:' + (el.tagName||'') + ':' + (el.innerText||el.value||'').slice(0,40);
      })()`);
      out(r);
      break;
    }

    case 'type': {
      const [idx, sel, ...textParts] = rest;
      const text = textParts.join(' ');
      const tab = await pickTab(idx);
      const r = await evaluate(tab, `(() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return 'NO_ENCONTRADO';
        el.focus();
        const proto = el.tagName === 'TEXTAREA'
          ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, ${JSON.stringify(text)});
        else el.value = ${JSON.stringify(text)};
        el.dispatchEvent(new Event('input', {bubbles:true}));
        el.dispatchEvent(new Event('change', {bubbles:true}));
        return 'TYPE_OK';
      })()`);
      out(r);
      break;
    }

    case 'upload': {
      const [idx, sel, filePath] = rest;
      if (!fs.existsSync(filePath)) throw new Error(`archivo no existe: ${filePath}`);
      const tab = await pickTab(idx);
      const r = await rpc(tab, async (send) => {
        await send('DOM.enable');
        const doc = await send('DOM.getDocument', { depth: -1 });
        const found = await send('DOM.querySelectorAll', {
          nodeId: doc.result.root.nodeId, selector: sel,
        });
        const ids = found.result?.nodeIds || [];
        if (!ids.length) return `SIN_INPUT: no hay "${sel}"`;
        const res = await send('DOM.setFileInputFiles', { nodeId: ids[0], files: [filePath] });
        return res.error ? 'ERROR: ' + JSON.stringify(res.error) : 'UPLOAD_OK';
      });
      out(r);
      break;
    }

    case 'shot': {
      const [idx, outFile] = rest;
      const tab = await pickTab(idx);
      const data = await rpc(tab, async (send) => {
        const r = await send('Page.captureScreenshot', { format: 'png' });
        return r.result?.data;
      });
      fs.writeFileSync(outFile || '/tmp/shot.png', Buffer.from(data, 'base64'));
      console.log('screenshot ->', outFile || '/tmp/shot.png');
      break;
    }

    case 'wait': {
      const [idx, sel, ms] = rest;
      const limit = Number(ms || 15000);
      const started = Date.now();
      const tab = await pickTab(idx);
      while (Date.now() - started < limit) {
        const found = await evaluate(tab, `!!document.querySelector(${JSON.stringify(sel)})`);
        if (found) { console.log('ENCONTRADO:', sel); return; }
        await new Promise((r) => setTimeout(r, 700));
      }
      console.log('TIMEOUT esperando', sel);
      break;
    }

    /**
     * Escribe con eventos de teclado REALES (Input.dispatchKeyEvent).
     *
     * Necesario para menús de autocompletar en React (Facebook, Instagram):
     * ignoran los eventos sintéticos de `input`, así que las sugerencias no
     * aparecen. Con teclas reales el framework se comporta como con un humano.
     */
    case 'type-real': {
      const [idx, sel, ...textParts] = rest;
      const text = textParts.join(' ');
      const tab = await pickTab(idx);
      await rpc(tab, async (send) => {
        await send('DOM.enable');
        const focus = await send('Runtime.evaluate', {
          expression: `(() => {
            const el = document.querySelector(${JSON.stringify(sel)});
            if (!el) return false;
            el.focus(); el.click(); return true;
          })()`,
          returnByValue: true,
        });
        if (!focus.result?.result?.value) { console.log('NO_ENCONTRADO:', sel); return; }

        // Limpiar antes de escribir
        await send('Runtime.evaluate', {
          expression: `(() => {
            const el = document.querySelector(${JSON.stringify(sel)});
            const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
            s.call(el, '');
            el.dispatchEvent(new Event('input', {bubbles:true}));
          })()`,
          returnByValue: true,
        });

        for (const ch of text) {
          await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, unmodifiedText: ch, key: ch });
          await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
          await new Promise((r) => setTimeout(r, 90));
        }

        const after = await send('Runtime.evaluate', {
          expression: `document.querySelector(${JSON.stringify(sel)}).value`,
          returnByValue: true,
        });
        console.log('ESCRITO:', after.result?.result?.value);
      });
      break;
    }

    default:
      console.log(`uso:
  node drive.js tabs
  node drive.js goto <idx|new> <url>
  node drive.js eval <idx> <js>
  node drive.js click <idx> <selector>
  node drive.js type <idx> <selector> <texto>
  node drive.js type-real <idx> <selector> <texto>   (teclas reales; para autocompletar)
  node drive.js upload <idx> <selector> <archivo>
  node drive.js shot <idx> <salida.png>
  node drive.js wait <idx> <selector> [ms]`);
      process.exit(1);
  }
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
