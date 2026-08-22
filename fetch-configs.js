'use strict';
const fs = require('fs');
const net = require('net');
const path = require('path');

const SCRIPT_DIR = __dirname;
const DIST = process.env.OUT_DIR || path.join(SCRIPT_DIR, 'dist');
const PING_CAP = parseInt(process.env.PING_CAP || '1200', 10);
const EXPORT_CAP = parseInt(process.env.EXPORT_CAP || '800', 10);
const TCP_TIMEOUT = parseInt(process.env.TCP_TIMEOUT || '2000', 10);
const SKIP_PING = process.env.SKIP_PING === '1';
const MSK_NODES = ['ru1.node.check-host.net', 'ru2.node.check-host.net'];

const SOURCES = [
  { id: 'pawdroid',      name: 'Pawdroid/Free-servers',          repo: 'https://github.com/Pawdroid/Free-servers',          url: 'https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub' },
  { id: 'free-nodes',    name: 'free-nodes/v2rayfree',           repo: 'https://github.com/free-nodes/v2rayfree',           url: 'https://raw.githubusercontent.com/free-nodes/v2rayfree/main/sub' },
  { id: 'igareck',       name: 'igareck/vpn-configs-for-russia', repo: 'https://github.com/igareck/vpn-configs-for-russia', url: 'https://raw.githubusercontent.com/igareck/vpn-configs-for-russia/main/BLACK_VLESS_RUS.txt' },
  { id: 'awesome-vpn',   name: 'awesome-vpn/awesome-vpn',        repo: 'https://github.com/awesome-vpn/awesome-vpn',        url: 'https://raw.githubusercontent.com/awesome-vpn/awesome-vpn/master/all' },
  { id: 'mahdibland',    name: 'mahdibland/V2RayAggregator',     repo: 'https://github.com/mahdibland/V2RayAggregator',     url: 'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/sub_merge.txt' },
  { id: 'eternity',      name: 'mahdibland (Eternity)',          repo: 'https://github.com/mahdibland/V2RayAggregator',     url: 'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/Eternity.txt' },
  { id: 'epodonios',     name: 'Epodonios/v2ray-configs',        repo: 'https://github.com/Epodonios/v2ray-configs',        url: 'https://raw.githubusercontent.com/Epodonios/v2ray-configs/main/All_Configs_Sub.txt' },
  { id: 'barry-far',     name: 'barry-far/V2ray-Config',         repo: 'https://github.com/barry-far/V2ray-Config',         url: 'https://raw.githubusercontent.com/barry-far/V2ray-Config/main/All_Configs_Sub.txt' },
  { id: 'barabama',      name: 'Barabama/FreeNodes',             repo: 'https://github.com/Barabama/FreeNodes',             url: 'https://raw.githubusercontent.com/Barabama/FreeNodes/feat/ai-crawler-v2/nodes/nodev2ray.txt' },
  { id: 'snakem982',     name: 'snakem982/proxypool',            repo: 'https://github.com/snakem982/proxypool',            url: 'https://raw.githubusercontent.com/snakem982/proxypool/main/source/v2ray-2.txt' },
  { id: 'ebrasha',       name: 'ebrasha/free-v2ray-public-list', repo: 'https://github.com/ebrasha/free-v2ray-public-list', url: 'https://raw.githubusercontent.com/ebrasha/free-v2ray-public-list/main/V2Ray-Config-By-EbraSha.txt' },
  { id: 'matinghambari', name: 'MatinGhanbari/v2ray-configs',    repo: 'https://github.com/MatinGhanbari/v2ray-configs',    url: 'https://raw.githubusercontent.com/MatinGhanbari/v2ray-configs/main/subscriptions/base64/all_sub.txt' },
  { id: 'ripaojiedian',  name: 'ripaojiedian/freenode',          repo: 'https://github.com/ripaojiedian/freenode',          url: 'https://raw.githubusercontent.com/ripaojiedian/freenode/main/sub' },
  { id: 'zhuhaiuk',      name: 'zhuhaiuk/free-nodes',            repo: 'https://github.com/zhuhaiuk/free-nodes',            url: 'https://raw.githubusercontent.com/zhuhaiuk/free-nodes/main/nodes.txt' },
];

const PROTO_OUT = ['vless', 'vmess', 'trojan', 'ss', 'hysteria2', 'tuic', 'ssr'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  return { protocol: 'vmess', host, port, uuid: v.id, name: (name || v.ps || '').toString(), _json: v };
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
        if (c) return c;
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
    if (c) c.raw = link;
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

function prio(c) {
  const q = c.params || {};
  if (c.protocol === 'vless' && q.security === 'reality') return 0;
  if (c.protocol === 'trojan') return 1;
  if (c.protocol === 'hysteria2') return 2;
  if (c.protocol === 'tuic') return 3;
  if (c.protocol === 'vless' && q.security === 'tls') return 4;
  if (c.protocol === 'vmess' && c._json && c._json.tls && c._json.tls !== 'none') return 5;
  if (c.protocol === 'vless') return 6;
  if (c.protocol === 'vmess') return 7;
  return 8;
}

async function tcpCheck(host, port, timeoutMs = TCP_TIMEOUT) {
  return new Promise((res) => {
    const s = net.connect({ host, port });
    s.setTimeout(timeoutMs);
    s.once('connect', () => { s.destroy(); res(true); });
    s.once('timeout', () => { s.destroy(); res(false); });
    s.once('error', () => res(false));
  });
}

async function tcpCheckAll(items) {
  let idx = 0;
  const results = new Array(items.length).fill(false);
  const concurrency = 250;
  const worker = async () => {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await tcpCheck(items[i].host, items[i].port);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

async function mskPing(hostPort) {
  let body;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`https://check-host.net/check-tcp?host=${encodeURIComponent(hostPort)}&${MSK_NODES.map((n) => `node=${n}`).join('&')}`, {
        headers: { Accept: 'application/json' },
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      body = await r.json();
      break;
    } catch (e) {
      if (attempt === 2) return { err: true };
      await sleep(1500 * (attempt + 1));
    }
  }
  if (!body || !body.request_id) return { err: true };
  const reqId = body.request_id;
  for (let i = 0; i < 12; i++) {
    await sleep(1500);
    try {
      const rr = await fetch(`https://check-host.net/check-result/${reqId}`, { headers: { Accept: 'application/json' } });
      const res = await rr.json();
      let best = null;
      let gotAny = false;
      for (const node of Object.values(res || {})) {
        const arr = Array.isArray(node) ? node : [node];
        for (const x of arr) {
          if (!x) continue;
          if (x.error) { gotAny = true; continue; }
          const t = (typeof x.time_to_connect === 'number') ? x.time_to_connect : (typeof x.time === 'number' ? x.time : null);
          if (t !== null) { gotAny = true; best = best === null ? t : Math.min(best, t); }
        }
      }
      if (gotAny) return { rtt: best === null ? null : Math.round(best * 1000) };
    } catch (e) {}
  }
  return { err: true };
}

async function mskPingAll(hpList) {
  const out = new Map();
  async function pass(list, conc, gap, tag) {
    let idx = 0;
    const worker = async () => {
      while (idx < list.length) {
        const hp = list[idx++];
        const r = await mskPing(hp);
        out.set(hp, r.err ? 'err' : r.rtt);
        if ((out.size % 100) === 0) console.log(`[ping${tag}] ${out.size}/${hpList.length}`);
        await sleep(gap);
      }
    };
    await Promise.all(Array.from({ length: conc }, worker));
  }
  await pass(hpList, 6, 80, '');
  const failed = hpList.filter((hp) => out.get(hp) === 'err');
  if (failed.length) {
    console.log(`[ping] retrying ${failed.length} unresolved...`);
    await sleep(5000);
    await pass(failed, 3, 200, '/retry');
  }
  const res = new Map();
  for (const hp of hpList) res.set(hp, out.get(hp) === 'err' ? null : out.get(hp));
  return res;
}

const y = (v) => JSON.stringify(v == null ? '' : String(v));

function ssPluginOpts(raw) {
  if (!raw) return null;
  const parts = String(raw).split(';').filter(Boolean);
  const o = { mode: 'websocket' };
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq > 0) o[p.slice(0, eq)] = p.slice(eq + 1);
  }
  if (parts[0] && parts[0].includes('simple-obfs')) o.mode = o.mode || 'http';
  return o;
}

function transportYaml(lines, q, indent) {
  const t = (q.type || 'tcp').toLowerCase();
  if (t === 'ws') {
    lines.push(`${indent}network: ws`);
    lines.push(`${indent}ws-opts:`);
    lines.push(`${indent}  path: ${y(q.path || '/')}`);
    if (q.host) {
      lines.push(`${indent}  headers:`);
      lines.push(`${indent}    Host: ${y(q.host)}`);
    }
  } else if (t === 'grpc') {
    lines.push(`${indent}network: grpc`);
    lines.push(`${indent}grpc-opts:`);
    lines.push(`${indent}  grpc-service-name: ${y(q.serviceName || q.path || '')}`);
  }
}

function clashProxyYaml(c, i) {
  const q = c.params || {};
  const ind = '    ';
  const insecure = q.insecure === '1' || q.allowInsecure === '1';
  const L = [`  - name: ${y(`${c.protocol}-${i}`)}`, `${ind}server: ${y(c.host)}`, `${ind}port: ${c.port}`, `${ind}type: ${c.protocol}`, `${ind}udp: true`];
  if (c.protocol === 'vless') {
    L.push(`${ind}uuid: ${y(c.uuid)}`);
    const sec = q.security || '';
    if (sec === 'tls' || sec === 'reality') {
      L.push(`${ind}tls: true`);
      L.push(`${ind}servername: ${y(q.sni || q.host || c.host)}`);
      L.push(`${ind}client-fingerprint: ${y(q.fp || 'chrome')}`);
    }
    if (sec === 'reality') {
      L.push(`${ind}reality-opts:`);
      L.push(`${ind}  public-key: ${y(q.pbk || '')}`);
      L.push(`${ind}  short-id: ${y(q.sid || '')}`);
    }
    if (q.flow) L.push(`${ind}flow: ${y(q.flow)}`);
    transportYaml(L, q, ind);
  } else if (c.protocol === 'vmess') {
    const v = c._json || {};
    L.push(`${ind}uuid: ${y(c.uuid)}`);
    L.push(`${ind}alterId: ${Number(v.aid) || 0}`);
    L.push(`${ind}cipher: ${y(v.scy || 'auto')}`);
    if (v.tls && v.tls !== 'none') {
      L.push(`${ind}tls: true`);
      L.push(`${ind}servername: ${y(v.sni || v.host || c.host)}`);
    }
    transportYaml(L, { type: v.net || 'tcp', path: v.path, host: v.host, serviceName: v.serviceName }, ind);
  } else if (c.protocol === 'trojan') {
    L.push(`${ind}password: ${y(c.password)}`);
    L.push(`${ind}sni: ${y(q.sni || q.peer || c.host)}`);
    if (insecure) L.push(`${ind}skip-cert-verify: true`);
    transportYaml(L, q, ind);
  } else if (c.protocol === 'ss') {
    L.push(`${ind}cipher: ${y(c.method)}`);
    L.push(`${ind}password: ${y(c.password)}`);
    const po = ssPluginOpts(q.plugin);
    if (po) {
      L.push(`${ind}plugin: v2ray-plugin`);
      L.push(`${ind}plugin-opts:`);
      L.push(`${ind}  mode: ${y(po.mode || 'websocket')}`);
      if (po.host) L.push(`${ind}  host: ${y(po.host)}`);
      if (po.path) L.push(`${ind}  path: ${y(po.path)}`);
      if (po.tls) L.push(`${ind}  tls: true`);
    }
  } else if (c.protocol === 'hysteria2') {
    L.push(`${ind}password: ${y(c.password)}`);
    L.push(`${ind}sni: ${y(q.sni || q.peer || c.host)}`);
    if (insecure) L.push(`${ind}skip-cert-verify: true`);
    if (q.obfs) {
      L.push(`${ind}obfs: salamander`);
      L.push(`${ind}obfs-password: ${y(q['obfs-password'] || '')}`);
    }
  } else if (c.protocol === 'tuic') {
    L.push(`${ind}uuid: ${y(c.uuid)}`);
    L.push(`${ind}password: ${y(c.password)}`);
    L.push(`${ind}sni: ${y(q.sni || c.host)}`);
    L.push(`${ind}congestion-controller: bbr`);
    L.push(`${ind}udp-relay-mode: native`);
    L.push(`${ind}reduce-rtt: true`);
    if (insecure) L.push(`${ind}skip-cert-verify: true`);
  } else {
    return null;
  }
  return L.join('\n');
}

function sbOutbound(c, tag) {
  const q = c.params || {};
  const tlsName = q.sni || q.host || q.peer || c.host;
  const insecure = q.insecure === '1' || q.allowInsecure === '1';
  const tlsObj = (reality) => reality
    ? { enabled: true, server_name: tlsName, utls: { enabled: true, fingerprint: q.fp || 'chrome' }, reality: { enabled: true, public_key: q.pbk || '', short_id: q.sid || '' } }
    : { enabled: true, server_name: tlsName, insecure, utls: q.fp ? { enabled: true, fingerprint: q.fp } : undefined };
  const transport = (() => {
    const t = (q.type || (c._json && c._json.net) || 'tcp').toLowerCase();
    if (t === 'ws') return { type: 'ws', path: q.path || (c._json && c._json.path) || '/', headers: (q.host || (c._json && c._json.host)) ? { Host: q.host || (c._json && c._json.host) } : undefined };
    if (t === 'grpc') return { type: 'grpc', service_name: q.serviceName || q.path || '' };
    if (t === 'http') return { type: 'http', host: q.host ? [q.host] : undefined, path: q.path || '/' };
    return undefined;
  })();
  if (c.protocol === 'vless') {
    return { type: 'vless', tag, server: c.host, server_port: c.port, uuid: c.uuid, flow: q.flow || '', tls: q.security === 'reality' ? tlsObj(true) : q.security === 'tls' ? tlsObj(false) : undefined, transport };
  }
  if (c.protocol === 'vmess') {
    const v = c._json || {};
    return { type: 'vmess', tag, server: c.host, server_port: c.port, uuid: c.uuid, security: v.scy || 'auto', tls: v.tls && v.tls !== 'none' ? tlsObj(false) : undefined, transport };
  }
  if (c.protocol === 'trojan') {
    return { type: 'trojan', tag, server: c.host, server_port: c.port, password: c.password, tls: tlsObj(false), transport };
  }
  if (c.protocol === 'ss') {
    const po = ssPluginOpts(q.plugin);
    return {
      type: 'shadowsocks', tag, server: c.host, server_port: c.port, method: c.method, password: c.password,
      plugin: po ? 'v2ray-plugin' : undefined,
      plugin_opts: po ? ['tls', `mode=${po.mode || 'websocket'}`, po.host ? `host=${po.host}` : null, po.path ? `path=${po.path}` : null].filter(Boolean).join(';') : undefined,
    };
  }
  if (c.protocol === 'tuic') {
    return { type: 'tuic', tag, server: c.host, server_port: c.port, uuid: c.uuid, password: c.password, congestion_control: 'bbr', udp_relay_mode: 'native', tls: tlsObj(false) };
  }
  if (c.protocol === 'hysteria2') {
    return { type: 'hysteria2', tag, server: c.host, server_port: c.port, password: c.password, tls: { enabled: true, server_name: tlsName, insecure }, obfs: q.obfs ? { type: 'salamander', password: q['obfs-password'] || '' } : undefined };
  }
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
  const byRawKey = new Map();
  let parsedOk = 0;
  for (const { src, link } of allRaw) {
    const c = parseLink(link);
    let entry;
    if (c) {
      parsedOk++;
      entry = { protocol: c.protocol, host: c.host, port: c.port, uuid: c.uuid, password: c.password, method: c.method, name: (c.name || '').slice(0, 80), country: countryHint(c.host), src, link: buildLink(c) || link, params: c.params || {}, _json: c._json };
    } else {
      const protoGuess = (link.match(/^([a-z0-9]+):\/\//) || [])[1] || 'other';
      entry = { protocol: protoGuess === 'hy2' ? 'hysteria2' : protoGuess, host: null, port: null, name: '', country: null, src, link };
    }
    if (byRawKey.has(entry.link)) continue;
    byRawKey.set(entry.link, entry);
  }
  const nodes = [...byRawKey.values()];
  console.log(`[parse] valid: ${parsedOk}, after raw dedup: ${nodes.length}`);

  const byNodeKey = new Set();
  const finalNodes = [];
  for (const n of nodes) {
    if (n.host && n.port) {
      const nk = `${n.protocol}|${n.host}|${n.port}`;
      if (byNodeKey.has(nk)) continue;
      byNodeKey.add(nk);
    }
    finalNodes.push(n);
  }
  console.log(`[dedup] final nodes: ${finalNodes.length}`);

  console.log('[tcp] liveness check...');
  const tcpable = finalNodes.filter((n) => n.host && n.port);
  const tcpRes = await tcpCheckAll(tcpable);
  const aliveSet = new Set();
  for (let i = 0; i < tcpable.length; i++) if (tcpRes[i]) aliveSet.add(tcpable[i]);
  const tcpAlive = tcpable.filter((n) => aliveSet.has(n)).sort((a, b) => prio(a) - prio(b));
  console.log(`[tcp] alive: ${tcpAlive.length}/${tcpable.length}`);

  let moscowList = [];
  let moscow = null;
  if (SKIP_PING) {
    console.log('[ping] SKIP_PING=1, russia list = tcp-alive by priority');
    moscowList = [];
  } else {
    const pingPool = tcpAlive.slice(0, PING_CAP);
    const hpMap = new Map();
    for (const n of pingPool) {
      const hp = `${n.host}:${n.port}`;
      if (!hpMap.has(hp)) hpMap.set(hp, []);
      hpMap.get(hp).push(n);
    }
    const hpList = [...hpMap.keys()];
    console.log(`[ping] Moscow check-host.net for ${hpList.length} endpoints (cap ${PING_CAP})...`);
    const pingMap = await mskPingAll(hpList);
    moscowList = [];
    for (const [hp, rtt] of pingMap) {
      if (rtt === null) continue;
      for (const n of hpMap.get(hp)) { n.rtt = rtt; moscowList.push(n); }
    }
    moscowList.sort((a, b) => a.rtt - b.rtt);
    moscow = moscowList.length;
    console.log(`[ping] reachable from Moscow: ${moscowList.length}/${hpList.length} endpoints`);
  }

  const ruSource = SKIP_PING ? tcpAlive : moscowList;
  fs.writeFileSync(path.join(DIST, 'sub', 'russia.txt'), ruSource.map((n) => n.link).join('\n') + '\n');
  fs.writeFileSync(path.join(DIST, 'sub', 'russia_base64.txt'), Buffer.from(ruSource.map((n) => n.link).join('\n')).toString('base64'));

  const exportSet = (ruSource.length >= 20 ? ruSource : tcpAlive.length ? tcpAlive : finalNodes.filter((n) => n.host)).slice(0, EXPORT_CAP);

  const proxyYamls = [];
  const sbOutbounds = [];
  const tags = [];
  let i = 0;
  for (const n of exportSet) {
    const tag = `${n.protocol}-${i++}`;
    const yl = clashProxyYaml(n, i - 1 + 0);
    if (yl) proxyYamls.push(yl);
    const ob = sbOutbound(n, tag);
    if (ob) { sbOutbounds.push(ob); tags.push(tag); }
  }

  const clashConf = [
    'port: 7890',
    'socks-port: 7891',
    'allow-lan: false',
    'mode: rule',
    'log-level: warning',
    '',
    'proxies:',
    ...proxyYamls,
    '',
    'proxy-groups:',
    '  - name: PROXY',
    '    type: select',
    '    proxies: [AUTO, DIRECT]',
    '  - name: AUTO',
    '    type: url-test',
    '    url: "http://www.gstatic.com/generate_204"',
    '    interval: 300',
    '    tolerance: 50',
    '    proxies:',
    ...tags.map((t) => `      - ${y(t)}`),
    '',
    'rules:',
    '  - MATCH,PROXY',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(DIST, 'sub', 'clash.yaml'), clashConf);

  const sbConf = {
    log: { level: 'warn' },
    dns: { servers: [{ tag: 'remote', address: 'https://1.1.1.1/dns-query' }, { tag: 'local', address: 'local' }], final: 'remote' },
    inbounds: [{ type: 'mixed', tag: 'in', listen: '127.0.0.1', listen_port: 2080 }],
    outbounds: [
      { type: 'selector', tag: 'PROXY', outbounds: ['AUTO'], interrupt_exist_connections: true },
      { type: 'urltest', tag: 'AUTO', outbounds: tags, url: 'http://www.gstatic.com/generate_204', interval: '5m', tolerance: 50 },
      ...sbOutbounds,
    ],
    route: { final: 'PROXY', auto_detect_interface: true },
  };
  fs.writeFileSync(path.join(DIST, 'sub', 'sing-box.json'), JSON.stringify(sbConf, null, 2));

  fs.writeFileSync(path.join(DIST, 'sub', 'all.txt'), finalNodes.map((n) => n.link).join('\n') + '\n');
  fs.writeFileSync(path.join(DIST, 'sub', 'base64.txt'), Buffer.from(finalNodes.map((n) => n.link).join('\n')).toString('base64'));
  const protocols = {};
  for (const p of PROTO_OUT) protocols[p] = [];
  for (const n of finalNodes) {
    if (!protocols[n.protocol]) protocols[n.protocol] = [];
    protocols[n.protocol].push(n.link);
  }
  for (const [p, arr] of Object.entries(protocols)) {
    if (!arr.length) continue;
    fs.writeFileSync(path.join(DIST, 'sub', p + '.txt'), arr.join('\n') + '\n');
    fs.writeFileSync(path.join(DIST, 'sub', p + '_base64.txt'), Buffer.from(arr.join('\n')).toString('base64'));
  }

  const protoCounts = {};
  for (const [p, arr] of Object.entries(protocols)) if (arr.length) protoCounts[p] = arr.length;
  const countries = {};
  for (const n of finalNodes) if (n.country) countries[n.country] = (countries[n.country] || 0) + 1;
  const ruProtocols = {};
  for (const n of ruSource) ruProtocols[n.protocol] = (ruProtocols[n.protocol] || 0) + 1;

  const data = {
    updated: new Date().toISOString(),
    stats: {
      fetchedRaw: allRaw.length,
      parsedValid: parsedOk,
      nodes: finalNodes.length,
      tcpAlive: tcpAlive.length,
      moscow,
      exported: exportSet.length,
      sourcesTotal: SOURCES.length,
      sourcesOk: srcStats.filter((s) => s.ok).length,
    },
    protocols: protoCounts,
    russiaTotal: ruSource.length,
    russiaProtocols: ruProtocols,
    pingSkipped: SKIP_PING,
    countries,
    sources: srcStats,
  };
  fs.writeFileSync(path.join(DIST, 'data.json'), JSON.stringify(data));
  console.log(`[done] ${(Date.now() - t0) / 1000 | 0}s nodes=${finalNodes.length} alive=${tcpAlive.length} moscow=${moscow} exported=${exportSet.length}`);
})();
