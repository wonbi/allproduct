#!/usr/bin/env node
/*
 * data/products.json을 마스터 유통 유통시트에서 다시 읽어와 갱신한다.
 *
 * 인증키는 이 스크립트 안에 없다 — chanwha0221-cmyk/baljuseo (비공개 레포)의
 * catalog.html에 이미 박혀 있는 읽기전용 서비스계정(spreadsheets.readonly)을
 * 실행할 때마다 그 자리에서 읽어 쓰고 버린다. 그래서 이 레포에는 그 서비스계정
 * 비밀값이 커밋되지 않는다 — 대신 baljuseo 레포 자체를 읽기 위한 BALJUSEO_TOKEN
 * (그 레포 전용 fine-grained PAT, read-only)을 환경변수로 받는다.
 *
 * data/image-overrides.json에 있는 항목(관리자가 사이트에서 직접 바꾼 사진)은
 * 시트에서 새로 받아온 사진보다 항상 우선한다 — 그래야 매일 도는 이 스크립트가
 * 관리자가 바꾼 사진을 지우지 않는다.
 *
 * 사용법: node scripts/sync-catalog.js [--baljuseo <clone-path>] [--out <products.json 경로>]
 * 종료코드 0 = 성공(파일을 갱신했음), 0이 아니면 실패 — 이 경우 호출한 쪽은
 * 커밋하면 안 된다(기존 data/products.json을 그대로 둬야 함).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : dflt;
}
const BALJUSEO_PATH = arg('baljuseo', path.join(require('os').tmpdir(), 'baljuseo-sync-src'));
const OUT_PATH = arg('out', path.join(__dirname, '..', 'data', 'products.json'));
const MIN_SANE_PRODUCTS = 400; // 실제론 647개 안팎 — 이보다 훨씬 적게 나오면 뭔가 잘못된 것

function log(...a) { console.error('[sync]', ...a); }

function ensureBaljuseoClone() {
  if (fs.existsSync(path.join(BALJUSEO_PATH, 'catalog.html'))) {
    log('기존 클론 재사용:', BALJUSEO_PATH);
    return;
  }
  log('baljuseo 클론 중 →', BALJUSEO_PATH);
  const token = process.env.BALJUSEO_TOKEN;
  const env = Object.assign({}, process.env, { GIT_LFS_SKIP_SMUDGE: '1', GIT_TERMINAL_PROMPT: '0' });
  let url = 'https://github.com/chanwha0221-cmyk/baljuseo';
  if (token) {
    // 토큰을 명령줄 문자열에 직접 넣지 않는다 — 실패 시 에러 메시지에 그대로
    // 노출될 수 있으므로 GIT_ASKPASS를 통해 넘긴다.
    const askpassPath = path.join(require('os').tmpdir(), 'baljuseo-askpass.sh');
    fs.writeFileSync(askpassPath, '#!/bin/sh\necho "$BALJUSEO_TOKEN"\n', { mode: 0o700 });
    env.GIT_ASKPASS = askpassPath;
    url = 'https://x-access-token@github.com/chanwha0221-cmyk/baljuseo';
  } else {
    log('경고: BALJUSEO_TOKEN이 설정되어 있지 않습니다 — baljuseo가 비공개 레포라면 클론이 실패합니다.');
  }
  execSync(`git clone --depth 1 ${url} "${BALJUSEO_PATH}"`, { stdio: 'inherit', env });
}

function extractCreds() {
  const src = fs.readFileSync(path.join(BALJUSEO_PATH, 'catalog.html'), 'utf8');
  const key = src.match(/const PRIVATE_KEY=`(.*?)`;/s);
  const email = src.match(/const CLIENT_EMAIL='([^']+)'/);
  const sheet = src.match(/const SHEET_ID='([^']+)'/);
  const dogu = src.match(/const DOGU_ID='([^']+)'/);
  if (!key || !email || !sheet || !dogu) throw new Error('catalog.html에서 인증 정보를 찾지 못했습니다 (원본 구조가 바뀌었을 수 있음)');
  return {
    privateKey: key[1].replace(/\\n/g, '\n'),
    clientEmail: email[1],
    sheetId: sheet[1],
    doguId: dogu[1]
  };
}

const EXCLUDE = ['상품변동사항', '공급가', '리모콘', '링크', '마감시간', '유통시트_1차', '유통시트_2차', '변동사항'];
const RENAME = { '공지_당일생물': '당일생물' };

function b64url(buf) { return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }

async function getAccessToken(creds) {
  const now = Math.floor(Date.now() / 1000);
  const enc = o => b64url(Buffer.from(JSON.stringify(o)));
  const toSign = enc({ alg: 'RS256', typ: 'JWT' }) + '.' + enc({
    iss: creds.clientEmail, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now
  });
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(toSign); signer.end();
  const sig = signer.sign(creds.privateKey);
  const jwt = toSign + '.' + b64url(sig);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const d = await res.json();
  if (!d.access_token) throw new Error('토큰 발급 실패: ' + JSON.stringify(d));
  return d.access_token;
}

function parsePrice(s) {
  s = (s == null ? '' : s).toString().trim();
  if (!s) return null;
  const parts = s.split(/>|＞|→/).map(x => x.trim());
  const num = x => { const m = (x.match(/[\d,]+/) || [''])[0].replace(/,/g, ''); return m ? parseInt(m, 10) : null; };
  if (parts.length >= 2) return { old: num(parts[0]), cur: num(parts[parts.length - 1]) };
  return { old: null, cur: num(s) };
}
function parseNum(x) { const m = ((x == null ? '' : x).toString().match(/[\d,]+/) || [''])[0].replace(/,/g, ''); return m ? parseInt(m, 10) : 0; }
function linkOf(cell) {
  if (!cell) return '';
  if (cell.hyperlink) return cell.hyperlink;
  if (cell.textFormatRuns) { for (const r of cell.textFormatRuns) { if (r.format && r.format.link && r.format.link.uri) return r.format.link.uri; } }
  const f = cell.userEnteredValue && cell.userEnteredValue.formulaValue;
  if (f) { const m = f.match(/HYPERLINK\(\s*"([^"]+)"/i); if (m) return m[1]; }
  return '';
}

async function loadCatalog(creds, token) {
  const meta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${creds.sheetId}?fields=sheets.properties(title,hidden)`,
    { headers: { Authorization: 'Bearer ' + token } })).json();
  if (meta.error) throw new Error('시트 접근 실패: ' + JSON.stringify(meta.error));
  const tabs = (meta.sheets || []).map(s => s.properties).filter(p => !p.hidden && EXCLUDE.indexOf(p.title) < 0).map(p => p.title);
  const ranges = tabs.map(t => 'ranges=' + encodeURIComponent(`'${t.replace(/'/g, "''")}'!A1:N400`)).join('&');
  const fields = 'sheets(properties.title,data.rowData.values(formattedValue,hyperlink,textFormatRuns(format.link.uri),userEnteredValue.formulaValue))';
  const grid = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${creds.sheetId}?${ranges}&fields=${encodeURIComponent(fields)}`,
    { headers: { Authorization: 'Bearer ' + token } })).json();
  if (grid.error) throw new Error('데이터 로드 실패: ' + JSON.stringify(grid.error));

  const groups = [];
  for (const sh of (grid.sheets || [])) {
    const name = sh.properties.title;
    const rows = ((sh.data && sh.data[0] && sh.data[0].rowData) || []).map(r => r.values || []);
    if (rows.length < 2) continue;
    const disp = rows.map(r => r.map(c => (c && c.formattedValue) || ''));
    let hr = -1;
    for (let r = 0; r < Math.min(40, disp.length); r++) { const j = disp[r].join('|'); if (j.indexOf('상품명') >= 0 && j.indexOf('공급가') >= 0) { hr = r; break; } }
    if (hr < 0) continue;
    const H = disp[hr];
    if (/원가|공급처|기존가/.test(H.join('|'))) continue;
    const col = labels => { for (let i = 0; i < H.length; i++) for (const k of labels) if (H[i].indexOf(k) >= 0) return i; return -1; };
    const ci = { name: col(['상품명']), price: col(['공급가']), tax: col(['면과세', '면/과세', '과세']), cut: col(['발주마감', '마감']), exp: col(['유통기한']), wh: col(['창고명']) };
    if (ci.name < 0 || ci.price < 0) continue;
    const shipIdxs = []; for (let i = 0; i < H.length; i++) if (H[i].indexOf('택배') >= 0) shipIdxs.push(i);
    let shipCol = -1, courierCol = -1;
    for (const idx of shipIdxs) {
      let num = 0, courier = 0;
      for (let r = hr + 1; r < Math.min(hr + 12, disp.length); r++) {
        const v = (disp[r][idx] || '').trim(); if (!v) continue;
        if (/택배|통운|로젠|우체국|경동|천일|합동|화물/.test(v)) courier++;
        else if (/[\d,]/.test(v) || v.indexOf('무료') >= 0) num++;
      }
      if (courier > num) { if (courierCol < 0) courierCol = idx; } else if (shipCol < 0) shipCol = idx;
    }
    const refCol = (ci.cut >= 0) ? ci.cut + 1 : -1;
    const products = [];
    for (let r = hr + 1; r < disp.length; r++) {
      const row = disp[r];
      const nm = (row[ci.name] || '').trim();
      if (!nm || nm === '상품명') continue;
      const pr = parsePrice(row[ci.price]);
      if (!pr || pr.cur == null) continue;
      products.push({
        name: nm, url: linkOf(rows[r][ci.name]), old: pr.old, cur: pr.cur,
        ship: (shipCol >= 0 ? parseNum(row[shipCol]) : 0),
        courier: (courierCol >= 0 ? (row[courierCol] || '').trim() : ''),
        tax: (ci.tax >= 0 ? (row[ci.tax] || '').trim() : ''),
        cut: (ci.cut >= 0 ? (row[ci.cut] || '').trim() : ''),
        exp: (ci.exp >= 0 ? (row[ci.exp] || '').trim() : ''),
        ref: (refCol >= 0 && refCol < row.length ? (row[refCol] || '').trim() : ''),
        srcWh: (ci.wh >= 0 ? (row[ci.wh] || '').trim() : '')
      });
    }
    if (products.length) groups.push({ wh: (RENAME[name] || name), products });
  }
  groups.sort((a, b) => (a.wh === '당일생물' ? -1 : 0) - (b.wh === '당일생물' ? -1 : 0));
  return groups;
}

const pkey = s => String(s || '').replace(/\s+/g, '').toLowerCase();
async function loadMedia(creds, token) {
  const r = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + creds.doguId + '/values/' + encodeURIComponent("'상품이미지_v2'!A1:F3000"),
    { headers: { Authorization: 'Bearer ' + token } });
  const j = await r.json();
  if (j.error) { log('사진 정보 로드 실패(사진 없이 진행):', JSON.stringify(j.error)); return {}; }
  const m = {};
  const rows = j.values || [];
  for (let i = 1; i < rows.length; i++) {
    const v = rows[i] || [];
    const nm = (v[0] || '').trim();
    if (!nm) continue;
    m['n:' + pkey(nm)] = { img: v[2] || '', spec: (v[3] ? String(v[3]).split('\n') : []) };
  }
  return m;
}

function kstStamp() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date());
  const g = t => parts.find(p => p.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
}

// 관리자가 사이트에서 직접 사진을 바꾸면 data/image-overrides.json에 커밋된다
// (index.html의 commitImageOverride 참고). 시트에서 새로 받아온 사진을 여기서
// 다시 덮어써서, 매일 도는 이 스크립트가 관리자가 바꾼 사진을 지우지 않게 한다.
const OVERRIDES_PATH = path.join(__dirname, '..', 'data', 'image-overrides.json');
function loadImageOverrides() {
  try { return JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8')); }
  catch (e) { return {}; }
}

(async () => {
  ensureBaljuseoClone();
  const creds = extractCreds();
  const token = await getAccessToken(creds);
  log('인증 완료');
  const [groups, media] = await Promise.all([loadCatalog(creds, token), loadMedia(creds, token)]);
  const overrides = loadImageOverrides();

  const products = [];
  groups.forEach(g => g.products.forEach(p => {
    const m = media['n:' + pkey(p.name)] || null;
    const ov = overrides[pkey(p.name)];
    products.push({
      warehouse: g.wh, sourceWarehouse: (p.srcWh && p.srcWh !== g.wh) ? p.srcWh : '',
      category: '', name: p.name, spec: (m && m.spec && m.spec.length) ? m.spec : [],
      supplyPrice: p.cur, previousPrice: p.old, tax: p.tax, courier: p.courier,
      shipFee: p.ship, orderCutoff: p.cut, shelfLife: p.exp,
      image: (ov && ov.image) ? ov.image : ((m && m.img) ? m.img : ''), note: p.ref || ''
    });
  }));

  if (products.length < MIN_SANE_PRODUCTS) {
    throw new Error(`받아온 상품이 ${products.length}개뿐입니다 (최소 ${MIN_SANE_PRODUCTS}개 기대) — 시트 구조가 바뀌었을 수 있어 기존 파일을 그대로 둡니다.`);
  }

  const doc = { updatedAt: kstStamp(), supplier: '마스터 유통', products };
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(doc, null, 1), 'utf8');
  log('완료:', products.length, '개 상품,', groups.length, '개 창고 →', OUT_PATH);
  log('SYNC_SUMMARY', JSON.stringify({ count: products.length, warehouses: groups.length, updatedAt: doc.updatedAt }));
})().catch(e => {
  log('실패:', e.message);
  process.exit(1);
});
