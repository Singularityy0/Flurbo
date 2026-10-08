// Builds docs/handbook/flurbo-handbook.html: one self-contained file holding every handbook page.
// Each page is embedded unchanged (except its own top navigation) in an iframe srcdoc, so its styles and scripts
// stay isolated. Links between handbook pages switch pages in the master instead of opening files.
// Run after editing any page:  node docs/handbook/build-handbook.mjs
import { readFile, writeFile } from 'node:fs/promises';

const here = new URL('./', import.meta.url);
const pages = [
  { id: 'architecture', file: 'architecture.html', title: 'Architecture and environment', summary: 'Components, data stores, and every environment variable (names only for secrets).' },
  { id: 'wallets', file: 'wallets-and-markets.html', title: 'Wallets and listing markets', summary: 'Internal wallets, funding commands, key access, and the full process and template for listing markets.' },
  { id: 'settlement', file: 'settlement.html', title: 'Settlement', summary: 'From trading close to payout, what the bot does, which questions settle automatically, and when a person steps in.' },
  { id: 'gaps', file: 'gaps-and-limitations.html', title: 'Gaps and limitations', summary: 'Known gaps, each checked against the code, with status and next step.' },
  { id: 'landscape', file: 'market-landscape.html', title: 'Market landscape', summary: 'Ten prediction venues, five on Monad, compared with Flurbo, with an interactive scorecard and loss calculator.' },
];
const byFile = Object.fromEntries(pages.map(p => [p.file, p.id]));
const attr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// Inside the master, page links call the parent instead of navigating the frame.
const bridge = `<script>document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;var f=a.getAttribute('href').split('#')[0];var map=${JSON.stringify(byFile)};if(map[f]&&window.parent!==window){e.preventDefault();window.parent.postMessage({flurboHandbook:map[f]},'*');}});</script>`;

const frames = [];
for (const p of pages) {
  let html = await readFile(new URL(p.file, here), 'utf8');
  html = html.replace(/<nav>[\s\S]*?<\/nav>\s*/, '');
  html = html.includes('</body>') ? html.replace('</body>', bridge + '</body>') : html + bridge;
  frames.push(`<iframe id="frame-${p.id}" title="${attr(p.title)}" hidden srcdoc="${attr(html)}"></iframe>`);
}

const built = new Date().toISOString().slice(0, 16).replace('T', ' ');
const master = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Flurbo handbook</title>
<style>
:root{--bg:#f6f5ef;--panel:#ffffff;--ink:#16241c;--muted:#5b6b61;--line:#d9ddd3;--accent:#1f6b4a;--accent-soft:#e3efe8}
@media (prefers-color-scheme:dark){:root{--bg:#111714;--panel:#18211c;--ink:#e6ece8;--muted:#9fb0a5;--line:#2c3a32;--accent:#6fcf9f;--accent-soft:#1e3328}}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;display:grid;grid-template-columns:260px 1fr;grid-template-rows:100%}
aside{background:var(--panel);border-right:1px solid var(--line);padding:20px 14px;overflow-y:auto}
aside h1{font-size:20px;margin:0 0 2px}aside p.meta{color:var(--muted);font-size:12px;margin:0 0 18px}
aside button{display:block;width:100%;text-align:left;background:none;border:0;border-radius:8px;padding:9px 10px;margin:2px 0;color:var(--ink);font:inherit;cursor:pointer}
aside button:hover{background:var(--accent-soft)}
aside button[aria-current="page"]{background:var(--accent-soft);color:var(--accent);font-weight:650}
aside .foot{margin-top:18px;border-top:1px solid var(--line);padding-top:12px;color:var(--muted);font-size:12px}
main{position:relative;min-width:0;height:100%}
iframe{border:0;width:100%;height:100%;display:block;background:var(--bg)}
#home{height:100%;overflow-y:auto;padding:28px 24px}
#home h2{font-size:26px;margin:0 0 6px}#home p.lead{color:var(--muted);margin:0 0 20px;max-width:720px}
.cards{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));max-width:1000px}
.cards button{text-align:left;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px;font:inherit;color:var(--ink);cursor:pointer}
.cards button:hover{border-color:var(--accent)}.cards strong{display:block;margin-bottom:4px}.cards span{color:var(--muted);font-size:14px}
code{font-family:ui-monospace,Consolas,monospace;font-size:13px;background:var(--accent-soft);padding:1px 4px;border-radius:4px}
@media (max-width:760px){body{grid-template-columns:1fr;grid-template-rows:auto 1fr}aside{border-right:0;border-bottom:1px solid var(--line);padding:10px 12px;display:flex;gap:6px;overflow-x:auto;align-items:center}
aside h1,aside p.meta,aside .foot{display:none}aside button{white-space:nowrap;width:auto;margin:0}}
</style>
</head>
<body>
<aside aria-label="Handbook pages">
<h1>Flurbo handbook</h1>
<p class="meta">Monad testnet, test assets only. Built ${built} UTC.</p>
<button type="button" data-page="home">Start here</button>
${pages.map(p => `<button type="button" data-page="${p.id}">${p.title}</button>`).join('\n')}
<div class="foot">Handoff notes and working rules: <code>docs/HANDOFF.md</code>. Rebuild this file with <code>node docs/handbook/build-handbook.mjs</code>.</div>
</aside>
<main>
<section id="home">
<h2>Flurbo handbook</h2>
<p class="lead">Everything needed to understand, operate and extend Flurbo: how it runs, the wallets, how markets are listed and settled, what is still missing, and where Flurbo sits among other prediction venues. Each page is also available as a separate file in <code>docs/handbook/</code>.</p>
<div class="cards">
${pages.map(p => `<button type="button" data-page="${p.id}"><strong>${p.title}</strong><span>${p.summary}</span></button>`).join('\n')}
</div>
</section>
${frames.join('\n')}
</main>
<script>
(function(){
  var ids=${JSON.stringify(['home', ...pages.map(p => p.id)])};
  function show(id){
    if(ids.indexOf(id)<0)id='home';
    document.getElementById('home').hidden=id!=='home';
    ids.slice(1).forEach(function(p){document.getElementById('frame-'+p).hidden=p!==id;});
    document.querySelectorAll('aside button').forEach(function(b){if(b.dataset.page===id)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    if(location.hash.slice(1)!==id)history.replaceState(null,'','#'+id);
  }
  document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('button[data-page]');if(b)show(b.dataset.page);});
  window.addEventListener('message',function(e){if(e.data&&typeof e.data.flurboHandbook==='string')show(e.data.flurboHandbook);});
  window.addEventListener('hashchange',function(){show(location.hash.slice(1));});
  show(location.hash.slice(1)||'home');
})();
</script>
</body>
</html>
`;
await writeFile(new URL('flurbo-handbook.html', here), master);
console.log(`Wrote flurbo-handbook.html (${Math.round(master.length / 1024)} KB, ${pages.length} pages)`);
