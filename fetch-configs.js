'use strict';
const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;
const DIST = process.env.OUT_DIR || path.join(SCRIPT_DIR, 'dist');

const SOURCES = [
  { id: 'pawdroid',    name: 'Pawdroid/Free-servers',        repo: 'https://github.com/Pawdroid/Free-servers',        url: 'https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub' },
  { id: 'free-nodes',  name: 'free-nodes/v2rayfree',         repo: 'https://github.com/free-nodes/v2rayfree',         url: 'https://raw.githubusercontent.com/free-nodes/v2rayfree/main/sub' },
  { id: 'igareck',     name: 'igareck/vpn-configs-for-russia', repo: 'https://github.com/igareck/vpn-configs-for-russia', url: 'https://raw.githubusercontent.com/igareck/vpn-configs-for-russia/main/BLACK_VLESS_RUS.txt' },
  { id: 'awesome-vpn', name: 'awesome-vpn/awesome-vpn',      repo: 'https://github.com/awesome-vpn/awesome-vpn',      url: 'https://raw.githubusercontent.com/awesome-vpn/awesome-vpn/master/all' },
  { id: 'mahdibland',  name: 'mahdibland/V2RayAggregator',   repo: 'https://github.com/mahdibland/V2RayAggregator',   url: 'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/sub_merge.txt' },
  { id: 'eternity',    name: 'mahdibland (Eternity)',        repo: 'https://github.com/mahdibland/V2RayAggregator',   url: 'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/Eternity.txt' },
  { id: 'epodonios',   name: 'Epodonios/v2ray-configs',      repo: 'https://github.com/Epodonios/v2ray-configs',      url: 'https://raw.githubusercontent.com/Epodonios/v2ray-configs/main/All_Configs_Sub.txt' },
  { id: 'barry-far',   name: 'barry-far/V2ray-Config',       repo: 'https://github.com/barry-far/V2ray-Config',       url: 'https://raw.githubusercontent.com/barry-far/V2ray-Config/main/All_Configs_Sub.txt' },
  { id: 'barabama',    name: 'Barabama/FreeNodes',           repo: 'https://github.com/Barabama/FreeNodes',           url: 'https://raw.githubusercontent.com/Barabama/FreeNodes/feat/ai-crawler-v2/nodes/nodev2ray.txt' },
  { id: 'snakem982',   name: 'snakem982/proxypool',          repo: 'https://github.com/snakem982/proxypool',          url: 'https://raw.githubusercontent.com/snakem982/proxypool/main/source/v2ray-2.txt' },
];

const PROTO_OUT = ['vless', 'vmess', 'trojan', 'ss', 'hysteria2', 'tuic', 'ssr'];

async function fetchText(url, timeoutMs = 45000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 vpn-hub' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}

function decodeB64(s) {
  return Buffer.from(s.replace(/\s+/g, ''), 'base64').toString('utf8');
}

function extractLinks(text) {
  const out = [];
  for (let t of text.split(/\s+/).filter(Boolean)) {
    if (!/(vless|vmess|ss|ssr|trojan|tuic|hysteria2|hy2):\/\//.test(t)) continue;
    for (const p of t.split(/(?=(?:vless|vmess|ss|ssr|trojan|tuic|hysteria2|hy2):\/\/)/)) {
      if (/^(vless|vmess|ss|ssr|trojan|tuic|hysteria2|hy2):\/\/\S+$/.test(p)) out.push(p.trim());
    }
  }
  return out;
}

function splitHostPort(hp) {
  if (!hp) return [null, null];
  hp = hp.replace(/\/$/, '');
  let m = hp.match(/^\[([^\]]+)\]:(\d+)$/);
  if (m) return [m[1], Number(m[2])];
  m = hp.match(/^(.+):(\d+)$/);
  if (m) return [m[1].startsWith('[') ? m[1] : m[1], Number(m[2])];
  return [hp, null];
}

function parseQuery(qs) {
  const out = {};
  if (!qs) return out;
  for (const [k, v] of new URLSearchParams(qs)) out[k.toLowerCase()] = v;
  return out;
}

function parseVless(rest) {
  const nameIdx = rest.indexOf('#');
  const name = nameIdx >= 0 ? decodeURIComponent(rest.slice(nameIdx + 1)) : '';
  const body = nameIdx >= 0 ? rest.slice(0, nameIdx) : rest;
  const qIdx = body.indexOf('?');
  const q = parseQuery(qIdx >= 0 ? body.slice(qIdx + 1) : '');
  const hp = qIdx >= 0 ? body.slice(0, qIdx) : body;
  const parts = hp.split('@');
  if (parts.length !== 2) return null;
  const [uuid, hostPort] = parts;
  if (!hostPort || !uuid) return null;
  const [host, port] = splitHostPort(hostPort);
  if (!host || !port) return null;
  return { protocol: 'vless', host, port, uuid, name, params: q };
}

function parseTrojan(rest) {
  const nameIdx = rest.indexOf('#');
  const name = nameIdx >= 0 ? decodeURIComponent(rest.slice(nameIdx + 1)) : '';
  const body = nameIdx >= 0 ? rest.slice(0, nameIdx) : rest;
  const qIdx = body.indexOf('?');
  const q = parseQuery(qIdx >= 0 ? body.slice(qIdx + 1) : '');
  const hp = qIdx >= 0 ? body.slice(0, qIdx) : body;
  const parts = hp.split('@');
  if (parts.length !== 2) return null;
  const [password, hostPort] = parts;
  if (!hostPort || !password) return null;
  const [host, port] = splitHostPort(hostPort);
  if (!host || !port) return null;
  return { protocol: 'trojan', host, port, password, name, params: q };
}

function parseVmess(rest) {
  const nameIdx = rest.indexOf('#');
  const name = nameIdx >= 0 ? decodeURIComponent(rest.slice(nameIdx + 1)) : '';
  let body = nameIdx >= 0 ? rest.slice(0, nameIdx) : rest;
  const qIdx = body.indexOf('?');
  if (qIdx >= 0) body = body.slice(0, qIdx);
  let j = body;
  if (!j.startsWith('{')) j = decodeB64(j);
  const v = JSON.parse(j);
  const host = v.add || v.address || v.host;
  const port = Number(v.port);
  if (!host || !port || !v.id) return null;
  return {
    protocol: 'vmess',
    host,
    port,
    uuid: v.id,
    name: (name || v.ps || '').toString(),
    _json: v,
  };
}

function parseSS(rest) {
  const nameIdx = rest.indexOf('#');
  const name = nameIdx >= 0 ? decodeURIComponent(rest.slice(nameIdx + 1)) : '';
  let body = nameIdx >= 0 ? rest.slice(0, nameIdx) : rest;
  const qIdx = body.indexOf('?');
  const q = parseQuery(qIdx >= 0 ? body.slice(qIdx + 1) : '');
  if (qIdx >= 0) body = body.slice(0, qIdx);
  let b64, host, port;
  if (body.includes('@')) {
    const ci = body.indexOf('@');
    b64 = body.slice(0, ci);
    const h = splitHostPort(body.slice(ci + 1));
    host = h[0]; port = h[1];
    const dec0 = decodeB64(b64);
    if (!dec0.includes(':') && !b64.includes(':')) {
      const c = parseVless(rest);
      if (c) { c.protocol = 'vless'; c._disguised = true; return c; }
    }
  } else {
    const dec = decodeB64(body);
    if (dec.trimStart().startsWith('{')) {
      try {
        const c = parseVmess(rest);
        if (c) { c._disguisedJson = true; return c; }
      } catch (e) {}
    }
    const at = dec.lastIndexOf('@');
    if (at < 0) return null;
    b64 = dec.slice(0, at);
    const h = splitHostPort(dec.slice(at + 1));
    host = h[0]; port = h[1];
  }
  if (!host || !port) return null;
  let mp = null;
  {
    const dec = decodeB64(b64);
    if (dec.includes(':')) mp = dec;
    else if (b64.includes(':')) mp = b64;
  }
  if (!mp) return null;
  const ci = mp.indexOf(':');
  if (ci < 0) return null;
  const method = mp.slice(0, ci);
  const password = mp.slice(ci + 1);
  if (!method || !password) return null;
  return { protocol: 'ss', host, port, method, password, name, params: q };
}

function parseTuic(rest) {
  const nameIdx = rest.indexOf('#');
  const name = nameIdx >= 0 ? decodeURIComponent(rest.slice(nameIdx + 1)) : '';
  const body = nameIdx >= 0 ? rest.slice(0, nameIdx) : rest;
  const qIdx = body.indexOf('?');
  const q = parseQuery(qIdx >= 0 ? body.slice(qIdx + 1) : '');
  const hp = qIdx >= 0 ? body.slice(0, qIdx) : body;
  const parts = hp.split('@');
  if (parts.length !== 2) return null;
  const [uuidPass, hostPort] = parts;
  if (!hostPort || !uuidPass) return null;
  const ci = uuidPass.lastIndexOf(':');
  if (ci < 0) return null;
  const uuid = uuidPass.slice(0, ci);
  const password = uuidPass.slice(ci + 1);
  const [host, port] = splitHostPort(hostPort);
  if (!host || !port) return null;
  return { protocol: 'tuic', host, port, uuid, password, name, params: q };
}

function parseHy2(rest) {
  const nameIdx = rest.indexOf('#');
  const name = nameIdx >= 0 ? decodeURIComponent(rest.slice(nameIdx + 1)) : '';
  const body = nameIdx >= 0 ? rest.slice(0, nameIdx) : rest;
  const qIdx = body.indexOf('?');
  const q = parseQuery(qIdx >= 0 ? body.slice(qIdx + 1) : '');
  const hp = qIdx >= 0 ? body.slice(0, qIdx) : body;
  const ci = hp.lastIndexOf('@');
  const password = ci >= 0 ? hp.slice(0, ci) : '';
  const hostPort = ci >= 0 ? hp.slice(ci + 1) : hp;
  const [host, port] = splitHostPort(hostPort);
  if (!host || !port) return null;
  return { protocol: 'hysteria2', host, port, password, name, params: q };
}

function buildLink(c) {
  try {
    const q = c.params || {};
    const name = c.name ? '#' + encodeURIComponent(c.name) : '';
    if (c.protocol === 'vless' && c._disguised) {
      const p = ['type=' + encodeURIComponent(q.type || 'tcp'), 'encryption=' + encodeURIComponent(q.encryption || 'none')];
      if (q.security) p.push('security=' + encodeURIComponent(q.security));
      if (q.sni) p.push('sni=' + encodeURIComponent(q.sni));
      if (q.fp) p.push('fp=' + encodeURIComponent(q.fp));
      if (q.pbk) p.push('pbk=' + encodeURIComponent(q.pbk));
      if (q.sid) p.push('sid=' + encodeURIComponent(q.sid));
      if (q.flow) p.push('flow=' + encodeURIComponent(q.flow));
      if (q.host) p.push('host=' + encodeURIComponent(q.host));
      if (q.path) p.push('path=' + encodeURIComponent(q.path));
      if (q.alpn) p.push('alpn=' + encodeURIComponent(q.alpn));
      if (q.insecure === '1' || q.allowInsecure === '1') p.push('allowInsecure=1');
      return 'vless://' + c.uuid + '@' + c.host + ':' + c.port + '?' + p.join('&') + name;
    }
    if (c.protocol === 'vmess' && c._json) {
      const v = c._json;
      const j = {
        v: '2', ps: c.name || v.ps || '', add: c.host, port: String(c.port), id: c.uuid,
        aid: String(v.aid != null ? v.aid : 0), scy: v.scy || 'auto',
        net: v.net || 'tcp', type: v.type || '', host: v.host || '',
        path: v.path || '', tls: v.tls || '', sni: v.sni || '', fp: v.fp || '',
      };
      return 'vmess://' + Buffer.from(JSON.stringify(j)).toString('base64');
    }
    return null;
  } catch (e) { return null; }
}

function parseLink(link) {
  try {
    const m = link.match(/^(vless|vmess|ss|ssr|trojan|tuic|hysteria2|hy2):\/\/(.+)$/);
    if (!m) return null;
    const proto = m[1];
    let c = null;
    if (proto === 'hysteria2' || proto === 'hy2') c = parseHy2(m[2]);
    else if (proto === 'vless') c = parseVless(m[2]);
    else if (proto === 'trojan') c = parseTrojan(m[2]);
    else if (proto === 'ss') c = parseSS(m[2]);
    else if (proto === 'tuic') c = parseTuic(m[2]);
    else if (proto === 'vmess') c = parseVmess(m[2]);
    if (c) { c.raw = link; if ((proto === 'hysteria2' || proto === 'hy2') && c.protocol === 'hysteria2') c.raw = link.replace(/^hy2:/, 'hysteria2:'); }
    return c;
  } catch (e) { return null; }
}

const CITY_MAP = {
  frankfurt: 'de', berlin: 'de', munich: 'de', hamburg: 'de', dusseldorf: 'de',
  amsterdam: 'nl', rotterdam: 'nl', paris: 'fr', london: 'gb', manchester: 'gb',
  tokyo: 'jp', osaka: 'jp', singapore: 'sg', sydney: 'au', toronto: 'ca', montreal: 'ca',
  moscow: 'ru', warsaw: 'pl', stockholm: 'se', helsinki: 'fi', oslo: 'no', zurich: 'ch',
  vienna: 'at', prague: 'cz', istanbul: 'tr', dubai: 'ae', hongkong: 'hk', taipei: 'tw',
  seoul: 'kr', jakarta: 'id', mumbai: 'in', delhi: 'in', losangeles: 'us', sanjose: 'us',
  seattle: 'us', chicago: 'us', dallas: 'us', miami: 'us', atlanta: 'us', phoenix: 'us',
  saopaulo: 'br', buenosaires: 'ar', johannesburg: 'za', telaviv: 'il', almaty: 'kz',
  kyiv: 'ua', kiev: 'ua', bucharest: 'ro', sofia: 'bg', budapest: 'hu', milan: 'it', rome: 'it',
  madrid: 'es', lisbon: 'pt', riyadh: 'sa', tehran: 'ir',
  japan: 'jp', germany: 'de', netherlands: 'nl', usa: 'us', america: 'us', russia: 'ru',
  poland: 'pl', turkey: 'tr', france: 'fr', britain: 'gb', england: 'gb', india: 'in',
  china: 'cn', korea: 'kr', canada: 'ca', australia: 'au', brazil: 'br', ukraine: 'ua',
};
const TLD_MAP = {
  ru: 'ru', de: 'de', fr: 'fr', nl: 'nl', jp: 'jp', sg: 'sg', hk: 'hk', tw: 'tw', kr: 'kr',
  uk: 'gb', pl: 'pl', cz: 'cz', ua: 'ua', by: 'by', kz: 'kz', se: 'se', no: 'no', fi: 'fi',
  dk: 'dk', tr: 'tr', ae: 'ae', il: 'il', ir: 'ir', vn: 'vn', th: 'th', id: 'id', my: 'my',
  ph: 'ph', in: 'in', br: 'br', ar: 'ar', mx: 'mx', za: 'za', ch: 'ch', at: 'at', it: 'it',
  es: 'es', pt: 'pt', gr: 'gr', hu: 'hu', ro: 'ro', bg: 'bg', rs: 'rs', lt: 'lt', lv: 'lv',
  ee: 'ee', ge: 'ge', am: 'am', az: 'az', md: 'md', cn: 'cn', au: 'au', ca: 'ca', is: 'is',
};

function countryHint(host) {
  const h = String(host).toLowerCase();
  for (const [city, cc] of Object.entries(CITY_MAP)) if (h.includes(city)) return cc;
  const tld = h.match(/\.([a-z]{2})$/);
  if (tld && TLD_MAP[tld[1]] && tld[1] !== 'us') return TLD_MAP[tld[1]];
  const cc = h.match(/(?:^|[\-._])(de|nl|pl|fr|jp|uk|us|ru|sg|hk|tw|kr|se|fi|no|dk|ca|au|it|es|pt|cz|tr|br|za|il|th|vn|id|my|ph|in|gb)(?:\d+)?(?:[\-._]|$)/);
  if (cc && TLD_MAP[cc[1]]) return TLD_MAP[cc[1]];
  return null;
}

(async () => {
  const t0 = Date.now();
  fs.mkdirSync(path.join(DIST, 'sub'), { recursive: true });

  console.log('[fetch] downloading ' + SOURCES.length + ' sources...');
  const fetched = await Promise.allSettled(SOURCES.map((s) => fetchText(s.url)));
  const srcStats = [];
  const allRaw = [];
  for (let i = 0; i < SOURCES.length; i++) {
    const s = SOURCES[i];
    const r = fetched[i];
    if (r.status !== 'fulfilled') {
      console.log(`[fetch] ${s.id}: FAIL (${r.reason && r.reason.message})`);
      srcStats.push({ id: s.id, name: s.name, repo: s.repo, count: 0, ok: false });
      continue;
    }
    let links = extractLinks(r.value);
    if (links.length < 2) {
      try {
        const dec = decodeB64(r.value);
        if (dec && dec.length > 20) links = extractLinks(dec);
      } catch (e) {}
    }
    const uniq = [...new Set(links)];
    console.log(`[fetch] ${s.id}: ${uniq.length} links`);
    srcStats.push({ id: s.id, name: s.name, repo: s.repo, count: uniq.length, ok: uniq.length > 0 });
    for (const l of uniq) allRaw.push({ src: s.id, link: l });
  }

  console.log(`[parse] raw total: ${allRaw.length}`);
  const nodes = [];
  const byRawKey = new Map();
  let parsedOk = 0;
  for (const { src, link } of allRaw) {
    const c = parseLink(link);
    let entry;
    if (c) {
      parsedOk++;
      entry = {
        protocol: c.protocol,
        host: c.host,
        port: c.port,
        name: (c.name || '').slice(0, 80),
        country: countryHint(c.host),
        src,
        link: buildLink(c) || link,
      };
    } else {
      const protoGuess = (link.match(/^([a-z0-9]+):\/\//) || [])[1] || 'other';
      entry = { protocol: protoGuess === 'hy2' ? 'hysteria2' : protoGuess, host: null, port: null, name: '', country: null, src, link };
    }
    const key = entry.link;
    if (byRawKey.has(key)) continue;
    byRawKey.set(key, entry);
    nodes.push(entry);
  }
  console.log(`[parse] valid: ${parsedOk}, passthrough+dedup: ${nodes.length}`);

  const byNode = new Map();
  const finalNodes = [];
  for (const n of nodes) {
    if (n.host && n.port) {
      const nk = `${n.protocol}|${n.host}|${n.port}`;
      if (byNode.has(nk)) continue;
      byNode.set(nk, n);
    }
    finalNodes.push(n);
  }
  finalNodes.sort((a, b) => a.protocol.localeCompare(b.protocol) || String(a.host).localeCompare(String(b.host)));
  console.log(`[dedup] final nodes: ${finalNodes.length}`);

  const protocols = {};
  for (const p of PROTO_OUT) protocols[p] = [];
  for (const n of finalNodes) {
    if (!protocols[n.protocol]) protocols[n.protocol] = [];
    protocols[n.protocol].push(n.link);
  }

  fs.writeFileSync(path.join(DIST, 'sub', 'all.txt'), finalNodes.map((n) => n.link).join('\n') + '\n');
  fs.writeFileSync(path.join(DIST, 'sub', 'base64.txt'), Buffer.from(finalNodes.map((n) => n.link).join('\n')).toString('base64'));
  for (const p of Object.keys(protocols)) {
    if (!protocols[p].length) continue;
    fs.writeFileSync(path.join(DIST, 'sub', p + '.txt'), protocols[p].join('\n') + '\n');
    fs.writeFileSync(path.join(DIST, 'sub', p + '_base64.txt'), Buffer.from(protocols[p].join('\n')).toString('base64'));
  }

  const protoCounts = {};
  for (const [p, arr] of Object.entries(protocols)) if (arr.length) protoCounts[p] = arr.length;
  const countries = {};
  for (const n of finalNodes) {
    if (!n.country) continue;
    countries[n.country] = (countries[n.country] || 0) + 1;
  }
  const data = {
    updated: new Date().toISOString(),
    stats: {
      fetchedRaw: allRaw.length,
      parsedValid: parsedOk,
      nodes: finalNodes.length,
      sourcesTotal: SOURCES.length,
      sourcesOk: srcStats.filter((s) => s.ok).length,
    },
    protocols: protoCounts,
    countries,
    sources: srcStats,
  };
  fs.writeFileSync(path.join(DIST, 'data.json'), JSON.stringify(data));
  console.log(`[done] ${(Date.now() - t0) / 1000 | 0}s, nodes: ${finalNodes.length}, protocols: ${JSON.stringify(protoCounts)}`);
})();
