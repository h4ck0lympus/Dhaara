// Throwaway: poll host B's DevTools endpoint until window.noemaExperimentReady; print WebGL renderer.
const deadline = Date.now() + Number(process.argv[2] || 40) * 1000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
while (Date.now() < deadline) {
  try {
    const list = await (await fetch('http://127.0.0.1:9339/json')).json();
    const page = list.find(p => p.type === 'page' && p.url.includes(':8792'));
    if (page) {
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      let id = 0;
      const ask = expr => new Promise(res => {
        const my = ++id;
        ws.addEventListener('message', function h(m) { const d = JSON.parse(m.data); if (d.id === my) { ws.removeEventListener('message', h); res(d.result?.result?.value); } });
        ws.send(JSON.stringify({ id: my, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
      });
      while (Date.now() < deadline) {
        if (await ask('!!window.noemaExperimentReady')) {
          const gl = await ask(`(()=>{const c=document.createElement('canvas').getContext('webgl');const e=c&&c.getExtension('WEBGL_debug_renderer_info');return e?c.getParameter(e.UNMASKED_RENDERER_WEBGL):String(!!c)})()`);
          console.log(JSON.stringify({ ready: true, webgl: gl }));
          ws.close(); process.exit(0);
        }
        await sleep(25);
      }
    }
  } catch (e) { if (process.env.CDP_DEBUG) console.error(e); }
  await sleep(50);
}
process.exit(1);
