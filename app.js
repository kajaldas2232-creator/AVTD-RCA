'use strict';
// Edit this list if a hub is added or renamed.
const NE_HUBS = [
  'Agartala_UttarChampamura_I (Tripura)',
  'Aizawl_Bawngkawn_P (Mizoram)',
  'Shillong_Mawiong_I (Meghalaya)',
  'Guwahati_KaliPahar_GW (Assam)',
  'Jorhat_Podumoni_I (Assam)',
  'Dibrugarh_Mohanbari_H (Assam)',
  'Imphal_Takyel_I (Manipur)',
  'Aizawl_Sairang_I (Mizoram)',
  'Silchar_Ambikapur_H (Assam)',
  'Dimapur_Sovima_I (Nagaland)',
  'Itanagar_Doimukh_I (Arunachal Pradesh)',
  'Nagaon_Bangthai_H (Assam)',
  'Tezpur_Dipota_H (Assam)'
];
const NEEDED = ['mwn','cl','pdt','cn','st','ss','AVTD_Cat','AVTD_Cut_off_flag','Main_Remarks','pt','NSL_REMARKS'];

const $ = id => document.getElementById(id);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
// Lowercase and drop spaces, _ and - so "Pre-paid", "prepaid " and "PREPAID" all match.
const norm = s => (s || '').toLowerCase().replace(/[\s_\-]+/g, '');
let rows = [], parseInfo = null, fileMsgs = [], hubMsgs = [], latestPct = [], latestSections = [], fixes = Object.create(null), fileKey = '';

function paintMsgs() {
  const box = $('msgs'); box.innerHTML = '';
  fileMsgs.concat(hubMsgs).forEach(m => box.appendChild(el('div', 'msg ' + m.t, m.m)));
}

let toastTimer;
function toast(m) {
  const t = $('toast'); t.textContent = m; t.style.opacity = 1;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.style.opacity = 0, 2200);
}
function copyText(txt, okMsg) {
  const done = () => toast(okMsg || 'Copied!');
  const fallback = () => {
    const a = el('textarea'); a.value = txt; a.style.cssText = 'position:fixed;opacity:0;height:1px';
    document.body.appendChild(a); a.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    a.remove(); ok ? done() : toast('Copy failed. Select the text and press Ctrl+C.');
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fallback);
  else fallback();
}

const dropzone = $('dropzone'), fileInput = $('fileInput');
dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => {
  e.preventDefault(); dropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => { if (e.target.files.length) handleFile(e.target.files[0]); fileInput.value = ''; });

// ---- Reading big CSV files safely (phones run out of memory if a 600 MB file is loaded as one string) ----
// The file is read in 8 MB pieces, parsed row by row, and only the rows we need are kept.
let busy = false;
const MAX_FILE = 2 * 1024 * 1024 * 1024;
const CHUNK = 8 * 1024 * 1024;
const pctText = f => Math.round(f * 100) + '%';
const readSlice = (file, a, b) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error || new Error('read failed'));
  fr.readAsArrayBuffer(file.slice(a, b));
});
// Copy a string so a kept value does not keep the whole 8 MB chunk it was cut from alive in memory.
const own = s => s ? (' ' + s).slice(1) : s;

function createParser(opts) {
  opts = opts || {};
  const out = { rows: [], total: 0, flags: Object.create(null), missing: [], headers: [], hasFe: false };
  let headers = null, stop = false, carry = '', started = false;
  const idx = {};
  let feDn = -1, feDw = -1;
  const get = (row, k) => idx[k] < 0 ? '' : own((row[idx[k]] || '').trim());
  const findCol = guesses => { for (const g of guesses) { const i = headers.indexOf(g); if (i >= 0) return i; } return -1; };

  function onRow(row) {
    if (row.length === 1 && !row[0]) return;
    if (!headers) {
      out.headers = row.map(h => h.trim());
      headers = row.map(norm);
      NEEDED.forEach(k => idx[k] = headers.indexOf(norm(k)));
      out.missing = NEEDED.filter(k => idx[k] < 0);
      if (out.missing.length) stop = true;
      if (opts.fe) { feDn = findCol(FE_GUESS); feDw = findCol(DWBN_GUESS); out.hasFe = feDn >= 0; }
      return;
    }
    if (row.length <= 5) return;
    out.total++;
    const flag = get(row, 'AVTD_Cut_off_flag');
    if (flag in out.flags || Object.keys(out.flags).length < 20) out.flags[flag] = (out.flags[flag] || 0) + 1;
    if (norm(flag) !== 'todayavtd') return;
    const pdt = get(row, 'pdt'), pt = get(row, 'pt'), cat = get(row, 'AVTD_Cat'), rem = get(row, 'Main_Remarks'), ss = get(row, 'ss'), st = get(row, 'st');
    const nslRaw = get(row, 'NSL_REMARKS');
    const o = {
      mwn: own(get(row, 'mwn').replace(/^`+/, '').trim()),
      cl: get(row, 'cl') || 'Unknown',
      cn: get(row, 'cn'),
      pdt, pdtN: norm(pdt), pt, ptN: norm(pt), cat, catN: norm(cat),
      rem, remN: norm(rem), ss, ssN: norm(ss), st, stN: norm(st),
      nsl: nslRaw || 'No Remark',
      nslN: norm(nslRaw),
      dn: feDn >= 0 ? own((row[feDn] || '').trim()) : '',
      dw: feDw >= 0 ? own((row[feDw] || '').trim()) : ''
    };
    out.rows.push(o);
  }

  // text must hold whole rows only (it ends on a row boundary).
  function parseText(text) {
    const n = text.length;
    let i = 0, row = [];
    const end = () => { onRow(row); row = []; };
    while (i < n && !stop) {
      let f;
      if (text.charCodeAt(i) === 34) {            // quoted field
        let j = i + 1, s = '';
        for (;;) {
          const k = text.indexOf('"', j);
          if (k < 0) { s += text.slice(j); j = n; break; }
          s += text.slice(j, k);
          if (text.charCodeAt(k + 1) === 34) { s += '"'; j = k + 2; } else { j = k + 1; break; }
        }
        f = s; i = j;
        while (i < n) { const c = text.charCodeAt(i); if (c === 44 || c === 10 || c === 13) break; i++; }
      } else {                                    // plain field
        let j = i;
        while (j < n) { const c = text.charCodeAt(j); if (c === 44 || c === 10 || c === 13) break; j++; }
        f = text.slice(i, j); i = j;
      }
      row.push(f);
      if (i >= n) { end(); break; }               // last row without a trailing newline
      const c = text.charCodeAt(i);
      if (c === 44) { i++; if (i >= n) { row.push(''); end(); } continue; }
      i += (c === 13 && text.charCodeAt(i + 1) === 10) ? 2 : 1;
      end();
    }
  }

  // Feed the next piece of the file. Only complete rows are parsed; the unfinished tail waits for the next piece.
  function push(piece, final) {
    if (stop) return;
    let t = carry + piece; carry = '';
    if (!started && t.length) { started = true; if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1); }
    if (final) { parseText(t); return; }
    // Last newline that is not inside a quoted field (an even number of quotes before it).
    let par = 0, last = -1, pos = 0;
    for (;;) {
      const q = t.indexOf('"', pos), segEnd = q < 0 ? t.length : q;
      if (par === 0 && segEnd > pos) { const nl = t.lastIndexOf('\n', segEnd - 1); if (nl >= pos) last = nl; }
      if (q < 0) break;
      par ^= 1; pos = q + 1;
    }
    if (last < 0) { carry = t; return; }
    parseText(t.slice(0, last + 1));
    carry = t.slice(last + 1);
  }
  return { push, out, stopped: () => stop };
}

async function parseFile(file, opts, onProgress) {
  const p = createParser(opts), dec = new TextDecoder('utf-8');
  for (let off = 0; off < file.size && !p.stopped(); off += CHUNK) {
    const end = Math.min(off + CHUNK, file.size);
    p.push(dec.decode(await readSlice(file, off, end), { stream: true }), false);
    if (onProgress) onProgress(end / file.size);
    await new Promise(r => setTimeout(r, 0));     // let the page repaint and stay responsive
  }
  p.push(dec.decode(), true);
  return p.out;
}

async function handleFile(file) {
  if (busy) return toast('Still reading a file. Please wait.');
  $('fileInfo').textContent = `Reading ${file.name}...`;
  fileMsgs = []; hubMsgs = []; paintMsgs();
  fileKey = 'avtdFix:' + file.name + ':' + file.size;
  try { fixes = Object.assign(Object.create(null), JSON.parse(store.get(fileKey, '{}'))); } catch (e) { fixes = Object.create(null); }
  if (file.size > MAX_FILE) {
    fileMsgs.push({ t: 'err', m: 'This file is larger than 2 GB. Please use the daily AVTD export.' });
    $('fileInfo').textContent = 'No file loaded'; paintMsgs(); return;
  }
  dropzone.classList.remove('loaded'); $('controls').style.display = 'none'; $('work').style.display = 'none'; $('recon').style.display = 'none'; $('outputGrid').innerHTML = ''; rows = [];
  if (!/\.csv$/i.test(file.name)) fileMsgs.push({ t: 'warn', m: `"${file.name}" does not end in .csv. Reading it anyway.` });
  busy = true;
  const t0 = performance.now();
  try {
    parseInfo = await parseFile(file, { fe: true }, f => { $('fileInfo').textContent = `Reading ${file.name}... ${pctText(f)}`; });
  } catch (err) {
    busy = false; $('fileInfo').textContent = 'No file loaded';
    fileMsgs.push({ t: 'err', m: 'Could not read the file (the browser may have run out of memory). Try again, or use a laptop browser for very large files.' });
    paintMsgs(); return;
  }
  busy = false;
  rows = parseInfo.rows;
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  if (parseInfo.missing.length) {
    fileMsgs.push({ t: 'err', m: `Missing required column(s): ${parseInfo.missing.join(', ')}. Check that this is the AVTD export and the headers were not renamed.` });
    $('fileInfo').textContent = file.name; paintMsgs(); return;
  }
  const ignored = parseInfo.total - rows.length;
  if (ignored > 0) {
    const other = Object.entries(parseInfo.flags).filter(([k]) => norm(k) !== 'todayavtd').map(([k, v]) => `${k || '(blank)'}: ${v}`).join(', ');
    fileMsgs.push({ t: 'info', m: `${ignored.toLocaleString()} rows ignored because AVTD_Cut_off_flag is not "Today AVTD" (${other}).` });
  }
  $('fileInfo').textContent = `${file.name} (${rows.length.toLocaleString()} Today AVTD rows of ${parseInfo.total.toLocaleString()}, read in ${secs}s)`;
  if (!rows.length) {
    const seen = Object.keys(parseInfo.flags).map(k => k || '(blank)').join(', ');
    fileMsgs.push({ t: 'err', m: `No "Today AVTD" rows found. Flag values in this file: ${seen || 'none'}.` });
    paintMsgs(); return;
  }
  dropzone.classList.add('loaded');
  $('controls').style.display = 'flex'; $('work').style.display = 'block';
  feClosed.clear(); feNslOpen.clear();
  populateFacilities();
}

function populateFacilities() {
  const neOnly = $('neOnly').checked;
  const sel = $('facilitySelect');
  const byNorm = new Map();
  rows.forEach(r => { if (r.cn) byNorm.set(norm(r.cn), r.cn); });
  let list = [], missing = [];
  if (neOnly) {
    NE_HUBS.forEach(h => { const a = byNorm.get(norm(h)); a ? list.push(a) : missing.push(h); });
  } else {
    list = Array.from(new Set(rows.map(r => r.cn).filter(Boolean))).sort();
  }
  hubMsgs = [];
  if (neOnly && missing.length) {
    hubMsgs.push({ t: 'warn', m: `${missing.length} NE hub(s) have no Today AVTD rows in this file (or the name changed): ${missing.join(', ')}` });
  }
  paintMsgs();
  const last = (() => { try { return localStorage.getItem('avtdHub') || ''; } catch (e) { return ''; } })();
  sel.innerHTML = '';
  list.forEach(cn => { const o = el('option', '', cn); o.value = cn; sel.appendChild(o); });
  sel.value = list.includes(last) ? last : (list[0] || '');
  renderAll();
}

function pctOf(num, den) {
  if (den === 0) return '-';
  let p = Math.round(num / den * 100);
  if (num < den && p >= 100) p = 99;          // never show 100% while something is pending
  return p + '%';
}

function formatPendingList(items, groupByClient) {
  const byNsl = Object.create(null);
  items.forEach(r => { const k = reasonOf(r); (byNsl[k] = byNsl[k] || []).push(r); });
  const reasons = Object.entries(byNsl).sort((a, b) => b[1].length - a[1].length);
  const lines = [];
  reasons.forEach(([reason, list]) => {
    lines.push('', `>>${reason} - ${list.length}`);
    if (groupByClient) {
      const byClient = Object.create(null);
      list.forEach(r => { (byClient[r.cl] = byClient[r.cl] || []).push(r); });
      Object.entries(byClient).forEach(([client, cList]) => {
        lines.push(client);
        cList.forEach(r => lines.push(r.mwn));
      });
    } else {
      list.forEach(r => lines.push(`${r.mwn} [${r.cl}]`));
    }
  });
  return lines.join('\n');
}

function buildAVTDSection(title, subRows, groupByClient, showExcl) {
  const disp = subRows.filter(r => r.remN === 'dispatched');
  const pend = subRows.filter(r => r.remN === 'pending');
  const excl = subRows.filter(r => r.remN !== 'dispatched' && r.remN !== 'pending');
  const base = disp.length + pend.length;
  const pct = pctOf(disp.length, base);
  const out = [`Count - ${base}`, `Dispatched - ${disp.length}`, `Pending - ${pend.length}`];
  if (pend.length) out.push(formatPendingList(pend, groupByClient));
  if (showExcl && excl.length) {
    out.push('', `[Excluded from AVTD Count - ${excl.length}]`);
    excl.forEach(r => out.push(`${r.mwn} - ${r.cl} (${r.rem || 'No status'}: ${r.nsl})`));
  }
  return { title, pct, text: out.join('\n') };
}

function buildDelSection(title, subRows, isRvp, groupByClient) {
  const disp = subRows.filter(r => r.remN === 'dispatched');
  const done = r => isRvp ? r.ssN === 'intransit' : r.ssN === 'delivered';
  const deliv = disp.filter(done), pend = disp.filter(r => !done(r));
  const pct = pctOf(deliv.length, disp.length);
  const out = [`Dispatched - ${disp.length}`, `${isRvp ? 'Picked Up' : 'Delivered'} - ${deliv.length}`, `Pending - ${pend.length}`];
  if (pend.length) out.push(formatPendingList(pend, groupByClient));
  return { title, pct, text: out.join('\n') };
}

function buildHapci(hub, groupByClient) {
  const hp = hub.filter(r => r.nslN.startsWith('holdasperclient'));
  const out = [`Count - ${hp.length}`];
  if (hp.length) {
    out.push('');
    if (groupByClient) {
      const byClient = Object.create(null);
      hp.forEach(r => { (byClient[r.cl] = byClient[r.cl] || []).push(r); });
      Object.entries(byClient).sort((a, b) => b[1].length - a[1].length).forEach(([c, l]) => { out.push(`${c} - ${l.length}`); l.forEach(r => out.push(r.mwn)); });
    } else hp.forEach(r => out.push(`${r.mwn} ${r.cl}`));
  }
  return { title: 'HAPCI (Hold as per client instruction)', pct: String(hp.length), text: out.join('\n') };
}

function buildRvpDelSection(rvp, groupByClient) {
  const disp = rvp.filter(r => r.remN === 'dispatched');
  const picked = disp.filter(r => r.ssN === 'intransit'), notPicked = disp.filter(r => r.ssN !== 'intransit');
  const cancel = rvp.filter(r => r.remN === 'clientconsigneeissue');   // shown as "Cancel" and counted in Total, like the sheet
  const total = disp.length + cancel.length;
  const pct = pctOf(picked.length, total);
  const title = 'RVP Delivery SL (% Closed)';
  const out = [`Total - ${total}`, `Picked - ${picked.length}`, `Not pick - ${notPicked.length}`, `Cancel - ${cancel.length}`];
  if (notPicked.length) out.push(formatPendingList(notPicked, groupByClient));
  return { title, pct, text: out.join('\n') };
}

const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }
};
const DEFAULT_FLAGGED = ['Package found in Audit', 'NTD Updated', 'Returned as per Client Instructions', 'Maximum attempts reached', 'Agent remark incorrect', 'Reattempt - As per NDR instructions', 'Package details changed by Delhivery'];
const QUICK_REASONS = ['Consignee Unavailable', 'Consignee refused to accept', 'Delivery Rescheduled by Customer', 'Not attempted', 'Space issue at CX end', 'Open body vehicle required', 'CX number is switch off', 'CX address not serviceable', 'Address Incomplete', 'COD Amount Not Ready', 'Phone Not Reachable', 'Premises Closed', 'Manpower Shortage', 'Vehicle Delayed / Linehaul', 'Entry Restricted / Security', 'Out of Delivery Area (ODA)'];
let flagged = (() => { try { const s = JSON.parse(store.get('avtdFlagged', 'null')); if (Array.isArray(s) && s.length) return s; } catch (e) {} return DEFAULT_FLAGGED.slice(); })();
const isFlagged = r => flagged.some(f => norm(f) === norm(r.nsl));
const TOP_REASONS = ['Consignee Unavailable', 'Delivery Rescheduled by Customer', 'Consignee refused to accept', 'Not attempted'];   // one-tap reasons
const fk = r => r.catN + '|' + r.mwn;   // LM and RVP rows with the same MWN keep separate reasons
const reasonOf = r => fixes[fk(r)] || r.nsl;   // typed reason wins over the system remark
const saveFixes = () => store.set(fileKey, JSON.stringify(fixes));

// All pending AWBs of a hub (AVTD pending + delivery pending), each once.
function hubPend(h) {
  const lm = h.filter(r => r.catN === 'lmforward'), rv = h.filter(r => r.catN === 'rvp');
  const pool = $('rvpInPdt').checked ? lm.concat(rv) : lm;
  const P = r => r.remN === 'pending', N = r => r.remN === 'dispatched' && r.ssN !== 'delivered';
  const set = new Set();
  pool.filter(r => P(r) && ['b2c', 'b2b', 'heavy'].includes(r.pdtN)).forEach(r => set.add(r));
  rv.filter(P).forEach(r => set.add(r));
  lm.filter(r => N(r) && (r.pdtN === 'b2b' || r.pdtN === 'heavy' || (r.pdtN === 'b2c' && (r.ptN === 'prepaid' || r.ptN === 'cod')))).forEach(r => set.add(r));
  rv.filter(r => r.remN === 'dispatched' && r.ssN !== 'intransit').forEach(r => set.add(r));
  return Array.from(set);
}
const segOf = r => (r.catN === 'rvp' ? 'RVP ' : '') + r.pdt + (r.remN === 'pending' ? ' AVTD' : ' Delivery');

function renderFix(hubRows) {
  const pend = hubPend(hubRows);
  const todo = pend.filter(r => isFlagged(r) && !fixes[fk(r)]), done = pend.filter(r => fixes[fk(r)]);
  const cnt = $('fixCount'); cnt.textContent = todo.length; cnt.className = 'cnt ' + (todo.length ? 'bad' : 'ok');
  const box = $('fixAlert');
  box.style.display = (todo.length || done.length) ? 'flex' : 'none';
  box.className = 'msg alertbar ' + (todo.length ? 'warn' : 'info');
  $('fixAlertText').textContent = todo.length
    ? `${todo.length} pending AWB(s) in this hub have flagged remarks that need actual reasons before submitting.`
    : `All flagged remarks in this hub now have actual reasons (${done.length} updated).`;
  $('fixAlertBtn').style.display = todo.length ? '' : 'none';

  const sug = new Set(QUICK_REASONS);
  hubRows.forEach(r => { if (r.nsl !== 'No Remark' && !isFlagged(r)) sug.add(r.nsl); });
  const dl = $('reasonList'); dl.innerHTML = '';
  Array.from(sug).sort().forEach(s => { const o = el('option'); o.value = s; dl.appendChild(o); });

  const bulk = $('bulkRem'); bulk.innerHTML = '';
  const g = Object.create(null); todo.forEach(r => { g[r.nsl] = (g[r.nsl] || 0) + 1; });
  Object.entries(g).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => { const o = el('option', '', `${k} (${v})`); o.value = k; bulk.appendChild(o); });

  const bc = $('bulkChips'); bc.innerHTML = '';
  TOP_REASONS.forEach(t => { const c = el('button', 'chip', t); c.type = 'button'; c.onclick = () => { $('bulkReason').value = t; }; bc.appendChild(c); });

  const tb = $('fixBody'); tb.innerHTML = '';
  todo.concat(done).forEach(r => {
    const tr = el('tr'), inp = el('input', 'fix-in');
    inp.setAttribute('list', 'reasonList'); inp.placeholder = 'Actual reason'; inp.value = fixes[fk(r)] || '';
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') applyFix(fk(r), inp.value); });
    const b = el('button', 'copy-btn', fixes[fk(r)] ? 'Undo' : 'Apply');
    b.onclick = () => fixes[fk(r)] ? revertFix(fk(r)) : applyFix(fk(r), inp.value);
    const ti = el('td'), tbtn = el('td'); ti.appendChild(inp); tbtn.appendChild(b);
    const chips = el('div', 'chips');
    TOP_REASONS.forEach(t => { const c = el('button', 'chip' + (fixes[fk(r)] === t ? ' on' : ''), t); c.type = 'button'; c.onclick = () => applyFix(fk(r), t, true); chips.appendChild(c); });
    ti.appendChild(chips);
    tr.append(el('td', '', r.mwn), el('td', '', r.cl), el('td', '', segOf(r)), el('td', '', r.nsl), ti, tbtn);
    tb.appendChild(tr);
  });
  if (!tb.children.length) { const tr = el('tr'), td = el('td', '', 'No flagged pending AWBs for this hub.'); td.colSpan = 6; tr.appendChild(td); tb.appendChild(tr); }
  if (document.activeElement !== $('flagBox')) $('flagBox').value = flagged.join('\n');
}

function applyFix(mwn, val, noFocus) {
  val = (val || '').trim();
  if (!val) return toast('Type the actual reason first.');
  fixes[mwn] = val; saveFixes(); renderAll();
  const nx = Array.from(document.querySelectorAll('#fixBody .fix-in')).find(i => !i.value);
  if (nx && !noFocus) nx.focus();
}
function revertFix(mwn) { delete fixes[mwn]; saveFixes(); renderAll(); }
function applyBulk() {
  const rem = $('bulkRem').value, reason = $('bulkReason').value.trim();
  if (!rem) return toast('No flagged remarks left to update.');
  if (!reason) return toast('Type the actual reason first.');
  let n = 0;
  hubPend(rows.filter(r => r.cn === $('facilitySelect').value)).forEach(r => { if (isFlagged(r) && r.nsl === rem && !fixes[fk(r)]) { fixes[fk(r)] = reason; n++; } });
  saveFixes(); $('bulkReason').value = ''; renderAll(); toast(`Updated ${n} AWB(s)`);
}
function clearFixes() {
  if (!Object.keys(fixes).length) return toast('No reasons to clear.');
  if (!confirm('Remove all typed reasons for this file (all hubs)?')) return;
  fixes = Object.create(null); saveFixes(); renderAll();
}
function saveFlags() {
  flagged = $('flagBox').value.split('\n').map(s => s.trim()).filter(Boolean);
  store.set('avtdFlagged', JSON.stringify(flagged)); renderAll(); toast('Flagged list saved');
}
function resetFlags() { flagged = DEFAULT_FLAGGED.slice(); store.set('avtdFlagged', JSON.stringify(flagged)); renderAll(); toast('Flagged list reset'); }

function showTab(t) {
  ['cards', 'report', 'fix', 'fe', 'summary'].forEach(k => { $('p-' + k).style.display = k === t ? 'block' : 'none'; });
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
}
$('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showTab(b.dataset.t); });

function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t); store.set('avtdTheme', t);
  $('themeBtn').textContent = t === 'dark' ? 'Light mode' : 'Dark mode';
}
$('themeBtn').addEventListener('click', () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
setTheme(store.get('avtdTheme', (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'));

// One row of results for a hub (reuses the same builders as the cards).
function hubSummary(h) {
  const lm = h.filter(r => r.catN === 'lmforward'), rv = h.filter(r => r.catN === 'rvp');
  const pool = $('rvpInPdt').checked ? lm.concat(rv) : lm;
  const by = (s, p) => s.filter(r => r.pdtN === p);
  const a = s => buildAVTDSection('', s, false, false).pct, d = s => buildDelSection('', s, false, false).pct;
  const b2c = by(lm, 'b2c');
  return [a(by(pool, 'b2c')), a(by(pool, 'b2b')), a(by(pool, 'heavy')), String(h.filter(r => r.nslN.startsWith('holdasperclient')).length), a(rv),
    d(by(lm, 'b2b')), d(by(lm, 'heavy')), d(b2c.filter(r => r.ptN === 'prepaid')), d(b2c.filter(r => r.ptN === 'cod')), buildRvpDelSection(rv, false).pct,
    String(hubPend(h).filter(r => isFlagged(r) && !fixes[fk(r)]).length)];
}
function renderSummary() {
  const byHub = Object.create(null);
  rows.forEach(r => { (byHub[r.cn] = byHub[r.cn] || []).push(r); });
  const tb = $('sumBody'); tb.innerHTML = '';
  Array.from($('facilitySelect').options).map(o => o.value).forEach(n => {
    const tr = el('tr', 'click');
    tr.appendChild(el('td', '', n.split(' (')[0]));
    hubSummary(byHub[n] || []).forEach((c, i) => {
      const v = parseInt(c, 10);
      const cls = (i === 3 || i === 10 || isNaN(v)) ? '' : v >= 90 ? 'g' : v >= 75 ? 'a' : 'r';
      tr.appendChild(el('td', cls, c));
    });
    tr.onclick = () => { $('facilitySelect').value = n; renderAll(); showTab('cards'); };
    tb.appendChild(tr);
  });
}

function copyWhatsApp() {
  if (!latestSections.length) return toast('Nothing to copy yet.');
  const hub = $('facilitySelect').value;
  const dot = p => { const n = parseInt(p, 10); return isNaN(n) ? '⚪' : n >= 90 ? '🟢' : n >= 75 ? '🟡' : '🔴'; };
  const L = [`*AVTD Daily RCA - ${hub}*`, ''];
  latestSections.forEach(s => L.push(s.title.startsWith('HAPCI') ? `⚪ *HAPCI:* ${s.pct}` : `${dot(s.pct)} *${s.title}:* ${s.pct}`));
  const cnt = Object.create(null);
  hubPend(rows.filter(r => r.cn === hub)).forEach(r => { const k = reasonOf(r); cnt[k] = (cnt[k] || 0) + 1; });
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (top.length) { L.push('', '*Top pending reasons:*'); top.forEach(([k, v]) => L.push(`• ${k}: ${v}`)); }
  copyText(L.join('\n'), 'WhatsApp summary copied');
}

function renderAll() {
  const cn = $('facilitySelect').value;
  if (cn) { try { localStorage.setItem('avtdHub', cn); } catch (e) {} }
  const gbc = $('groupClient').checked, showEx = $('showExcl').checked;
  const hub = rows.filter(r => r.cn === cn);
  const lm = hub.filter(r => r.catN === 'lmforward'), rvp = hub.filter(r => r.catN === 'rvp');
  // The sheet's B2C/Heavy AVTD counts also include RVP rows of that product (e.g. 147 = 145 LM + 2 RVP). Delivery sections stay LM-only.
  const pool = $('rvpInPdt').checked ? hub.filter(r => r.catN === 'lmforward' || r.catN === 'rvp') : lm;
  const by = (src, p) => src.filter(r => r.pdtN === p);
  const b2c = by(lm, 'b2c'), b2b = by(lm, 'b2b'), heavy = by(lm, 'heavy');

  const S = {
    b2c: buildAVTDSection('B2C AVTD SL (% LR Dispatched)', by(pool, 'b2c'), gbc, showEx),
    b2b: buildAVTDSection('B2B AVTD SL (% LR Dispatched)', by(pool, 'b2b'), gbc, showEx),
    hvy: buildAVTDSection('Heavy AVTD SL (% LR Dispatched)', by(pool, 'heavy'), gbc, showEx),
    hapci: buildHapci(hub, gbc),
    rvp: buildAVTDSection('RVP AVTD SL (% Dispatched)', rvp, gbc, showEx),
    dB2b: buildDelSection('% Delivered of Dispatch (B2B)', b2b, false, gbc),
    dHvy: buildDelSection('% Closed of Dispatch (Heavy)', heavy, false, gbc),
    dPre: buildDelSection('% Delivered of Dispatch (Pre-paid B2C)', b2c.filter(r => r.ptN === 'prepaid'), false, gbc),
    dCod: buildDelSection('% Delivered of Dispatch (COD B2C)', b2c.filter(r => r.ptN === 'cod'), false, gbc),
    dRvp: buildRvpDelSection(rvp, gbc)
  };
  // Cards follow the order of your LM sheet.
  const sections = [S.b2c, S.b2b, S.hvy, S.hapci, S.rvp, S.dB2b, S.dHvy, S.dPre, S.dCod, S.dRvp].filter(Boolean);
  // WW row keeps the original 9 percentages (no HAPCI / return).
  latestPct = [S.b2c, S.b2b, S.hvy, S.dB2b, S.dPre, S.dCod, S.dHvy, S.rvp, S.dRvp].map(s => s.pct);

  // Reconciliation: make sure nothing was silently dropped.
  const isMapped = r => r.catN === 'rvp' || (r.catN === 'lmforward' && ['b2c', 'b2b', 'heavy'].includes(r.pdtN));
  const mapped = hub.filter(isMapped);
  const exclCount = mapped.filter(r => r.remN !== 'dispatched' && r.remN !== 'pending').length;
  const unk = Object.create(null);
  hub.filter(r => !isMapped(r)).forEach(r => { const k = `${r.cat || '(blank)'} / ${r.pdt || '(blank)'}`; unk[k] = (unk[k] || 0) + 1; });
  const unkTotal = hub.length - mapped.length;
  const badPt = b2c.filter(r => r.ptN !== 'prepaid' && r.ptN !== 'cod');
  const dup = hub.length - new Set(hub.map(r => r.catN + '|' + r.mwn)).size;
  const rc = $('recon'); rc.innerHTML = '';
  rc.appendChild(el('div', '', `Rows for this hub: ${hub.length} | Counted in the sections: ${mapped.length} | Excluded from AVTD count: ${exclCount}`));
  if (unkTotal) rc.appendChild(el('div', 'w', `${unkTotal} row(s) not in any section (category / product): ${Object.entries(unk).map(([k, v]) => `${k} x${v}`).join(', ')}`));
  if (badPt.length) rc.appendChild(el('div', 'w', `${badPt.length} B2C row(s) have a payment type other than Pre-paid / COD, so they are missing from the Prepaid and COD delivery sections.`));
  if (dup) rc.appendChild(el('div', 'w', `${dup} duplicate MWN(s) found in this hub. Counts may be inflated.`));
  const rvpOdd = Object.create(null);
  rvp.filter(r => r.remN === 'dispatched' && r.ssN !== 'intransit' && r.ssN !== 'scheduled').forEach(r => { const k = r.ss || '(blank)'; rvpOdd[k] = (rvpOdd[k] || 0) + 1; });
  if (Object.keys(rvpOdd).length) rc.appendChild(el('div', 'w', `RVP dispatched rows with another status (counted as Pending): ${Object.entries(rvpOdd).map(([k, v]) => `${k} x${v}`).join(', ')}`));
  if (!hub.length) rc.appendChild(el('div', 'w', 'No Today AVTD rows for this hub.'));
  rc.style.display = 'block';

  // KPI cards
  const kDisp = mapped.filter(r => r.remN === 'dispatched').length, kPend = mapped.filter(r => r.remN === 'pending').length;
  const kpis = [
    ['Hub Today AVTD', hub.length, `${mapped.length} mapped to sections`, '#3b82f6'],
    ['Overall AVTD %', pctOf(kDisp, kDisp + kPend), `${kDisp} disp / ${kDisp + kPend} base`, '#22c55e'],
    ['Pending Dispatch', kPend, 'Across B2C, B2B, Heavy & RVP', '#f59e0b'],
    ['Pending Delivery', hubPend(hub).filter(r => r.remN === 'dispatched').length, 'Dispatched but not delivered/picked', '#ef4444'],
    ['Excluded (NTD/Embargo)', exclCount, 'Not counted in AVTD SL', '#64748b']
  ];
  const ks = $('kpiStrip'); ks.innerHTML = '';
  kpis.forEach(([l, v, s, c]) => { const k = el('div', 'kpi'); k.style.setProperty('--k', c); k.append(el('div', 'kpi-l', l), el('div', 'kpi-v', String(v)), el('div', 'kpi-s', s)); ks.appendChild(k); });

  const grid = $('outputGrid'); grid.innerHTML = '';
  sections.forEach(sec => {
    const card = el('div', 'card'), head = el('div', 'card-head'), left = el('div');
    left.append(el('span', 'card-title', sec.title), el('span', 'badge', sec.pct));
    const ta = el('textarea'); ta.value = sec.text;   // plain text, never parsed as HTML
    const btn = el('button', 'copy-btn', 'Copy');
    btn.onclick = () => copyText(ta.value, 'Copied: ' + sec.title);
    head.append(left, btn);
    const body = el('div', 'card-body'); body.appendChild(ta);
    card.append(head, body); grid.appendChild(card);
  });
  latestSections = sections;
  renderFix(hub);
  renderSummary();
  renderReport();
  renderFe();
}


// ---- One-click hub report & All-Hubs summary report (same layout as the Excel summary sheet) ----
function buildReportFromRows(label, subRows) {
  const lm = subRows.filter(r => r.catN === 'lmforward'), rv = subRows.filter(r => r.catN === 'rvp');
  const pool = $('rvpInPdt').checked ? lm.concat(rv) : lm;
  const by = (s, p) => s.filter(r => r.pdtN === p);
  const avtd = s => { const d = s.filter(r => r.remN === 'dispatched').length, p = s.filter(r => r.remN === 'pending').length; return { n: d, d: d + p }; };
  const del = s => { const d = s.filter(r => r.remN === 'dispatched'); return { n: d.filter(r => r.ssN === 'delivered').length, d: d.length }; };
  const b2c = by(lm, 'b2c');
  const D = [['B2C AVTD SL (% LR Dispatched)', avtd(by(pool, 'b2c'))], ['B2B AVTD SL (% LR Dispatched)', avtd(by(pool, 'b2b'))], ['Heavy AVTD SL (% LR Dispatched)', avtd(by(pool, 'heavy'))]];
  const L = [['Delivered of Dispatch (B2B)', del(by(lm, 'b2b'))], ['Delivered of Dispatch (Prepaid-B2C)', del(b2c.filter(r => r.ptN === 'prepaid'))], ['Delivered of Dispatch (COD-B2C)', del(b2c.filter(r => r.ptN === 'cod'))], ['Delivered of Dispatch (Heavy)', del(by(lm, 'heavy'))]];
  const sum = a => a.reduce((t, x) => ({ n: t.n + x[1].n, d: t.d + x[1].d }), { n: 0, d: 0 });
  const p2 = x => pctOf(x.n, x.d);   // whole numbers, same rule as the cards
  D.push(['Overall Dispatch', sum(D)]); L.push(['Overall Closed', sum(L)]);
  return { hub: label, disp: D.map(([k, v]) => [k, p2(v)]), del: L.map(([k, v]) => [k, p2(v)]) };
}
function buildReport(cn) {
  return buildReportFromRows(cn.split(' (')[0], rows.filter(r => r.cn === cn));
}
function buildAllHubsReport() {
  const hubList = Array.from($('facilitySelect').options).map(o => o.value);
  const hubSet = new Set(hubList);
  const scopeRows = hubSet.size ? rows.filter(r => hubSet.has(r.cn)) : rows;
  const label = $('neOnly').checked ? `All NE Hubs (${hubSet.size})` : `All Hubs (${hubSet.size})`;
  return buildReportFromRows(label, scopeRows);
}
function reportText(rp) {
  const t = ['Hub Name :\t' + rp.hub, '', 'Dispatch Performance Metrics'];
  rp.disp.forEach(([k, v]) => t.push(k + '\t' + v));
  t.push('', 'Delivery Performance Metrics');
  rp.del.forEach(([k, v]) => t.push(k + '\t' + v));
  return t.join('\n');
}
function reportHTML(rp) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const hd = t => `<tr><td colspan="2" style="background:#dde1f3;font-weight:bold">${esc(t)}</td></tr>`;
  const rw = ([k, v]) => `<tr><td>${esc(k)}</td><td style="font-weight:bold;text-align:right">${esc(v)}</td></tr>`;
  return `<table style="border-collapse:collapse;background:#c9e6cf;font-family:Calibri,Arial;font-size:11pt"><tr><td style="font-weight:bold">Hub Name :</td><td style="font-weight:bold">${esc(rp.hub)}</td></tr><tr><td colspan="2">&nbsp;</td></tr>${hd('Dispatch Performance Metrics')}${rp.disp.map(rw).join('')}<tr><td colspan="2">&nbsp;</td></tr>${hd('Delivery Performance Metrics')}${rp.del.map(rw).join('')}</table>`;
}
function renderReportCard(panel, heading, rp, onCopy) {
  panel.innerHTML = '';
  const head = el('div', 'alertbar'); head.style.marginBottom = '8px';
  head.append(el('strong', '', heading));
  const b = el('button', 'copy-btn', 'Copy Report'); b.type = 'button'; b.onclick = onCopy; head.appendChild(b);
  const tbl = el('table');
  const add = t => { const tr = el('tr'), td = el('td', 'rep-sec', t); td.colSpan = 2; tr.appendChild(td); tbl.appendChild(tr); };
  const row = ([k, v]) => { const tr = el('tr'); tr.append(el('td', '', k), el('td', 'rep-val', v)); tbl.appendChild(tr); };
  add('Dispatch Performance Metrics'); rp.disp.forEach(row);
  add('Delivery Performance Metrics'); rp.del.forEach(row);
  const w = el('div', 'table-wrap'); w.appendChild(tbl);
  panel.append(head, w);
}
function copyReportObj(rp, label) {
  const txt = reportText(rp), html = reportHTML(rp);
  if (navigator.clipboard && window.ClipboardItem) {
    navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([txt], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })])
      .then(() => toast(`${label} copied (paste in Excel / WhatsApp)`), () => copyText(txt, `${label} copied`));
  } else copyText(txt, `${label} copied`);
}
function renderReport() {
  const p = $('reportPanel'), ap = $('allHubsReportPanel');
  p.innerHTML = ''; ap.innerHTML = '';
  const cn = $('facilitySelect').value; if (!cn) return;
  const rp = buildReport(cn);
  renderReportCard(p, 'Hub Report: ' + rp.hub, rp, copyReport);
  const arp = buildAllHubsReport();
  renderReportCard(ap, 'All Hubs Summary Report: ' + arp.hub, arp, copyAllHubsReport);
}
function copyReport() {
  const cn = $('facilitySelect').value; if (!cn) return toast('Nothing to copy yet.');
  copyReportObj(buildReport(cn), 'Hub report');
}
function copyAllHubsReport() {
  if (!rows.length) return toast('Nothing to copy yet.');
  copyReportObj(buildAllHubsReport(), 'All hubs summary report');
}

// ---- FE-wise report (Pending-only Excel-style Pivot: dn -> cs_dwbn -> actual NSL_REMARKS -> Count of mwn) ----
const FE_GUESS = ['dn','fe','fename','feid','fecode','fu_name','employee','employeename','empname','empid','agent','agentname','deliveryboy','dp','dpname','executive','fieldexecutive','dispatchedby','dispatchby','assignedto','delivery_agent'].map(norm);
const DWBN_GUESS = ['cs_dwbn','csdwbn','dwbn','dispatchid','runsheet','dispatch_id'].map(norm);
const feClosed = new Set();
const feNslOpen = new Set();
// Personal notes per MWN (saved in this browser only, kept 45 days so a note follows the shipment into the next day's file).
const NOTE_KEY = 'avtdNotes', NOTE_TTL = 45 * 86400000;
const NOTE_REASONS = [
  'Delivery Rescheduled',
  'CX not responding the call',
  'Switch off',
  'CX refused to accept',
  'Incoming not available'
];
const notes = (() => {
  const out = Object.create(null);
  try { const o = JSON.parse(store.get(NOTE_KEY, '{}')), now = Date.now(); for (const k in o) if (o[k] && o[k].n && now - o[k].t < NOTE_TTL) out[k] = o[k]; } catch (e) {}
  return out;
})();
const noteOf = m => (notes[m] && notes[m].n) || '';
function setNote(m, v) {
  v = v.trim().slice(0, 300);
  if (v) notes[m] = { n: v, t: Date.now() }; else delete notes[m];
  store.set(NOTE_KEY, JSON.stringify(notes));
}
const cleanId = s => (s || '').trim().replace(/\.0+$/, '');
const cmpPivot = (a, b) => {
  if (a === '(Unassigned)' || a === '(blank)') return 1;
  if (b === '(Unassigned)' || b === '(blank)') return -1;
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
};

function buildFePivot(cn) {
  if (!parseInfo || !parseInfo.hasFe) return null;
  const hub = rows.filter(r => r.cn === cn);
  const pendingRows = hubPend(hub);
  const tree = Object.create(null);
  pendingRows.forEach(r => {
    const dn = (r.dn || '').trim() || '(Unassigned)';
    const dw = cleanId(r.dw) || '(blank)';
    const rawNsl = (reasonOf(r) || 'No Remark').trim();
    const nslKey = rawNsl.toLowerCase();
    const dObj = tree[dn] || (tree[dn] = { dn, count: 0, dwbns: Object.create(null) });
    dObj.count++;
    const wObj = dObj.dwbns[dw] || (dObj.dwbns[dw] = { dwbn: dw, count: 0, nsls: Object.create(null) });
    wObj.count++;
    if (!wObj.nsls[nslKey]) wObj.nsls[nslKey] = { key: nslKey, label: rawNsl, count: 0, mwns: [] };
    wObj.nsls[nslKey].count++;
    wObj.nsls[nslKey].mwns.push({ mwn: r.mwn, cl: r.cl });
  });
  let total = 0;
  const items = Object.values(tree).sort((a, b) => cmpPivot(a.dn, b.dn)).map(d => {
    total += d.count;
    const dwbns = Object.values(d.dwbns).sort((a, b) => cmpPivot(a.dwbn, b.dwbn)).map(w => ({
      dwbn: w.dwbn,
      count: w.count,
      nsls: Object.values(w.nsls).sort((a, b) => cmpPivot(a.label, b.label))
    }));
    return { dn: d.dn, count: d.count, dwbns };
  });
  return { hub: cn, items, total };
}

function renderFe() {
  const cn = $('facilitySelect').value;
  $('feHubName').textContent = cn || '-';
  const tb = $('feBody'); tb.innerHTML = '';
  const data = cn ? buildFePivot(cn) : null;
  if (!data) {
    const tr = el('tr'), td = el('td', '', 'Column "dn" was not found in this CSV file.'); td.colSpan = 2; tr.appendChild(td); tb.appendChild(tr); return;
  }
  if (!data.items.length) {
    const tr = el('tr'), td = el('td', '', 'No pending shipments for this hub.'); td.colSpan = 2; tr.appendChild(td); tb.appendChild(tr); return;
  }
  data.items.forEach(d => {
    const dnKey = 'dn:' + d.dn;
    const dnClosed = feClosed.has(dnKey);
    const tr = el('tr', 'piv-dn');
    const td0 = el('td');
    const btn = el('button', 'piv-btn', dnClosed ? '+' : '−');
    btn.type = 'button';
    td0.append(btn, document.createTextNode(d.dn));
    const tdC = el('td', 'num');
    tdC.appendChild(el('span', 'piv-pill', String(d.count)));
    tr.append(td0, tdC);
    tr.onclick = () => { dnClosed ? feClosed.delete(dnKey) : feClosed.add(dnKey); renderFe(); };
    tb.appendChild(tr);
    if (dnClosed) return;

    d.dwbns.forEach(w => {
      const wKey = 'dw:' + d.dn + '|' + w.dwbn;
      const wClosed = feClosed.has(wKey);
      const trW = el('tr', 'piv-dwbn');
      const td1 = el('td');
      const btnW = el('button', 'piv-btn', wClosed ? '+' : '−');
      btnW.type = 'button';
      td1.append(btnW, el('span', 'piv-tag', 'cs_dwbn'), el('span', 'piv-id', w.dwbn));
      const tdWC = el('td', 'num');
      tdWC.appendChild(el('span', 'piv-sub', String(w.count)));
      trW.append(td1, tdWC);
      trW.onclick = () => { wClosed ? feClosed.delete(wKey) : feClosed.add(wKey); renderFe(); };
      tb.appendChild(trW);
      if (wClosed) return;

      w.nsls.forEach(n => {
        const nKey = 'nsl:' + d.dn + '|' + w.dwbn + '|' + n.key;
        const isOpen = feNslOpen.has(nKey);
        const trN = el('tr', 'piv-nsl' + (isOpen ? ' open' : ''));
        const tdN = el('td');
        const btnN = el('button', 'piv-btn', isOpen ? '−' : '+');
        btnN.type = 'button';
        tdN.append(btnN, document.createTextNode(n.label));
        const nNotes = n.mwns.filter(x => noteOf(x.mwn)).length;
        if (nNotes) tdN.appendChild(el('span', 'note-dot', '\u{1F4DD} ' + nNotes));
        const tdNC = el('td', 'num');
        tdNC.appendChild(el('span', 'piv-cnt', String(n.count)));
        trN.append(tdN, tdNC);
        trN.onclick = () => { isOpen ? feNslOpen.delete(nKey) : feNslOpen.add(nKey); renderFe(); };
        tb.appendChild(trN);

        if (isOpen) {
          const trM = el('tr', 'piv-mwn');
          const tdM = el('td'); tdM.colSpan = 2;
          const box = el('div', 'mwn-box');
          const refreshDot = () => {
            const k = n.mwns.filter(x => noteOf(x.mwn)).length;
            let dot = tdN.querySelector('.note-dot');
            if (!k) { if (dot) dot.remove(); return; }
            if (!dot) { dot = el('span', 'note-dot'); tdN.appendChild(dot); }
            dot.textContent = '\u{1F4DD} ' + k;
          };
          n.mwns.forEach(item => {
            const line = el('div', 'mwn-line');
            const chip = el('button', 'mwn-chip');
            chip.type = 'button';
            chip.title = 'Click to copy MWN';
            chip.append(document.createTextNode(item.mwn), el('span', 'mwn-cl', item.cl));
            chip.onclick = e => { e.stopPropagation(); copyText(item.mwn, 'Copied MWN: ' + item.mwn); };
            const wrap = el('div', 'note-wrap');
            const inp = el('input', 'mwn-note');
            inp.type = 'text'; inp.placeholder = 'Select or type note...'; inp.maxLength = 300;
            inp.autocomplete = 'off'; inp.enterKeyHint = 'done';
            inp.setAttribute('aria-label', 'Note for ' + item.mwn);
            inp.value = noteOf(item.mwn);
            inp.classList.toggle('has', !!inp.value.trim());

            const caret = el('button', 'note-caret', '\u25BE');
            caret.type = 'button';
            caret.setAttribute('aria-label', 'Show preset reasons');

            const menu = el('div', 'note-menu');
            const saveVal = val => {
              inp.value = val;
              setNote(item.mwn, val);
              inp.classList.toggle('has', !!val.trim());
              refreshDot();
            };
            const closeAllMenus = () => document.querySelectorAll('.note-wrap.open').forEach(w => w.classList.remove('open'));
            const openMenu = () => { closeAllMenus(); wrap.classList.add('open'); };

            NOTE_REASONS.forEach(reason => {
              const opt = el('button', 'note-opt', reason);
              opt.type = 'button';
              const pick = e => {
                e.preventDefault();
                e.stopPropagation();
                saveVal(reason);
                wrap.classList.remove('open');
              };
              opt.onmousedown = pick;
              opt.onclick = pick;
              menu.appendChild(opt);
            });

            inp.onclick = e => { e.stopPropagation(); openMenu(); };
            inp.onfocus = () => openMenu();
            inp.oninput = () => saveVal(inp.value);
            inp.onkeydown = e => {
              if (e.key === 'Enter' || e.key === 'Escape') { wrap.classList.remove('open'); inp.blur(); }
            };
            inp.onblur = () => setTimeout(() => wrap.classList.remove('open'), 150);

            caret.onmousedown = e => {
              e.preventDefault();
              e.stopPropagation();
              const isOpen = wrap.classList.contains('open');
              closeAllMenus();
              if (!isOpen) { wrap.classList.add('open'); inp.focus(); }
            };
            caret.onclick = e => e.stopPropagation();

            wrap.append(inp, caret, menu);
            line.append(chip, wrap);
            box.appendChild(line);
          });
          const cp = el('button', 'mwn-copy', `Copy ${n.mwns.length} MWN${n.mwns.length > 1 ? 's' : ''}`);
          cp.type = 'button';
          cp.onclick = e => { e.stopPropagation(); copyText(n.mwns.map(x => x.mwn).join('\n'), `Copied ${n.mwns.length} MWN(s)`); };
          box.appendChild(cp);
          tdM.appendChild(box);
          trM.appendChild(tdM);
          tb.appendChild(trM);
        }
      });
    });
  });
  syncFeToggle(data);
  const trTot = el('tr', 'piv-tot');
  trTot.append(el('td', '', 'Grand Total'), el('td', 'num', String(data.total)));
  tb.appendChild(trTot);
}

// One + / - button in the table header: "+" = something is collapsed (click shows every FE with all remarks), "-" = all open (click folds back to FE names only).
const feAnyClosed = data => data.items.some(d => feClosed.has('dn:' + d.dn) || d.dwbns.some(w => feClosed.has('dw:' + d.dn + '|' + w.dwbn)));
function syncFeToggle(data) {
  const b = $('feToggle'); if (!b) return;
  const anyClosed = feAnyClosed(data);
  b.textContent = anyClosed ? '+' : '\u2212';
  b.title = anyClosed ? 'Expand all FEs (show all remarks)' : 'Collapse all FEs (show names only)';
}
function feToggleAll() {
  const cn = $('facilitySelect').value;
  const data = cn ? buildFePivot(cn) : null;
  if (!data || !data.items.length) return;
  feAnyClosed(data) ? feExpandAll() : feCollapseAll();
}

function feExpandAll() { feClosed.clear(); renderFe(); }
function feCollapseAll() {
  const cn = $('facilitySelect').value;
  const data = cn ? buildFePivot(cn) : null;
  if (!data) return;
  feNslOpen.clear();
  data.items.forEach(d => feClosed.add('dn:' + d.dn));
  renderFe();
}

function copyNotes() {
  const cn = $('facilitySelect').value;
  const data = cn ? buildFePivot(cn) : null;
  if (!data || !data.items.length) return toast('Nothing to copy yet.');
  const lines = [['dn', 'cs_dwbn', 'NSL_REMARKS', 'MWN', 'Client', 'Note'].join('\t')];
  data.items.forEach(d => d.dwbns.forEach(w => w.nsls.forEach(n => n.mwns.forEach(m => {
    const t = noteOf(m.mwn);
    if (t) lines.push([d.dn, w.dwbn, n.label, m.mwn, m.cl, t.replace(/[\t\r\n]+/g, ' ')].join('\t'));
  }))));
  if (lines.length === 1) return toast('No notes added yet.');
  copyText(lines.join('\n'), `Copied ${lines.length - 1} note(s)`);
}

function copyFe() {
  const cn = $('facilitySelect').value;
  const data = cn ? buildFePivot(cn) : null;
  if (!data || !data.items.length) return toast('Nothing to copy yet.');
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const txtRows = [
    ['cs_sl', data.hub].join('\t'),
    '',
    ['dn', 'cs_dwbn', 'NSL_REMARKS', 'Count of mwn'].join('\t')
  ];
  const htmlRows = [
    `<tr><td style="background:#dbeafe;font-weight:bold;border:1px solid #999">cs_sl</td><td colspan="3" style="background:#f8fafc;font-weight:bold;border:1px solid #999">${esc(data.hub)}</td></tr>`,
    `<tr><td colspan="4">&nbsp;</td></tr>`,
    `<tr style="background:#dbeafe;font-weight:bold;text-align:center"><th style="border:1px solid #999">dn</th><th style="border:1px solid #999">cs_dwbn</th><th style="border:1px solid #999">NSL_REMARKS</th><th style="border:1px solid #999">Count of mwn</th></tr>`
  ];
  data.items.forEach(d => {
    txtRows.push([d.dn, '', '', d.count].join('\t'));
    htmlRows.push(`<tr style="background:#f8fafc;font-weight:bold"><td style="border:1px solid #999">${esc(d.dn)}</td><td style="border:1px solid #999"></td><td style="border:1px solid #999"></td><td style="border:1px solid #999;text-align:center">${d.count}</td></tr>`);
    d.dwbns.forEach(w => {
      txtRows.push(['', w.dwbn, '', w.count].join('\t'));
      htmlRows.push(`<tr style="font-weight:bold"><td style="border:1px solid #999"></td><td style="border:1px solid #999;text-align:center">${esc(w.dwbn)}</td><td style="border:1px solid #999"></td><td style="border:1px solid #999;text-align:center">${w.count}</td></tr>`);
      w.nsls.forEach(n => { const nsl = n.label, cnt = n.count;
        txtRows.push(['', '', nsl, cnt].join('\t'));
        htmlRows.push(`<tr><td style="border:1px solid #999"></td><td style="border:1px solid #999"></td><td style="border:1px solid #999;text-align:center">${esc(nsl)}</td><td style="border:1px solid #999;text-align:center">${cnt}</td></tr>`);
      });
    });
  });
  txtRows.push(['Grand Total', '', '', data.total].join('\t'));
  htmlRows.push(`<tr style="background:#dbeafe;font-weight:bold"><td style="border:1px solid #999">Grand Total</td><td style="border:1px solid #999"></td><td style="border:1px solid #999"></td><td style="border:1px solid #999;text-align:center">${data.total}</td></tr>`);
  const txt = txtRows.join('\n');
  const html = `<table style="border-collapse:collapse;font-family:Calibri,Arial;font-size:11pt">${htmlRows.join('')}</table>`;
  if (navigator.clipboard && window.ClipboardItem) {
    navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([txt], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })])
      .then(() => toast('FE pivot report copied (paste in Excel)'), () => copyText(txt, 'FE pivot report copied'));
  } else copyText(txt, 'FE pivot report copied');
}

function copyAll() {
  const parts = Array.from(document.querySelectorAll('#outputGrid textarea')).map(t => t.value);
  if (!parts.length) return toast('Nothing to copy yet.');
  copyText(parts.join('\n\n------------------------------\n\n'), `All ${parts.length} sections copied`);
}

function copyWWRow() {
  if (!latestPct.length) return toast('Nothing to copy yet.');
  const gap = '\t'.repeat(Math.max(1, parseInt($('wwGap').value, 10) || 9));
  copyText(latestPct.join(gap), 'WW row copied. Click the date cell under B2C AVTD SL and press Ctrl+V.');
}

// ---- Event wiring (no inline handlers, so the page runs under a strict CSP) ----
const ACTIONS = {
  pickFile: () => $('fileInput').click(),
  render: () => renderAll(), hubs: () => populateFacilities(),
  whatsapp: () => copyWhatsApp(), copyAll: () => copyAll(), copyWW: () => copyWWRow(), copyReport: () => copyReport(),
  feExpand: () => feExpandAll(), feCollapse: () => feCollapseAll(), feToggle: () => feToggleAll(),
  copyFe: () => copyFe(), copyNotes: () => copyNotes(), goFix: () => showTab('fix'),
  bulk: () => applyBulk(), clear: () => clearFixes(), saveFlags: () => saveFlags(), resetFlags: () => resetFlags()
};
document.querySelectorAll('[data-act]').forEach(e => {
  e.addEventListener(e.tagName === 'INPUT' || e.tagName === 'SELECT' ? 'change' : 'click', ACTIONS[e.dataset.act]);
});

// ---- Install / offline support ----
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}