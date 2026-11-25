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
let rows = [], retRows = [], parseInfo = null, fileMsgs = [], hubMsgs = [], latestPct = [], latestSections = [], fixes = Object.create(null), fileKey = '';

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
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => {
  e.preventDefault(); dropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => { if (e.target.files.length) handleFile(e.target.files[0]); fileInput.value = ''; });

// Optional return report (same CSV layout assumed; shows which columns are missing if it differs).
$('retInput').addEventListener('change', e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  const rd = new FileReader();
  rd.onerror = () => toast('Could not read the return file.');
  rd.onload = evt => setTimeout(() => {
    const res = parseCSV(evt.target.result);
    fileMsgs = fileMsgs.filter(m => !m.m.startsWith('Return report'));
    if (res.missing.length) {
      retRows = []; $('retInfo').textContent = 'Return report not usable';
      fileMsgs.push({ t: 'err', m: `Return report: missing column(s) ${res.missing.join(', ')}. Columns found: ${res.headers.slice(0, 40).join(', ')}` });
      paintMsgs(); return;
    }
    retRows = res.rows;
    $('retInfo').textContent = `${file.name} (${retRows.length.toLocaleString()} Today AVTD rows)`;
    paintMsgs();
    if (rows.length) renderAll();
  }, 30);
  rd.readAsText(file);
});

function handleFile(file) {
  $('fileInfo').textContent = `Reading ${file.name}...`;
  fileMsgs = []; hubMsgs = []; paintMsgs();
  fileKey = 'avtdFix:' + file.name;
  try { fixes = Object.assign(Object.create(null), JSON.parse(store.get(fileKey, '{}'))); } catch (e) { fixes = Object.create(null); }
  if (file.size > 400 * 1024 * 1024) {
    fileMsgs.push({ t: 'err', m: 'This file is larger than 400 MB. Please use the daily AVTD export.' });
    $('fileInfo').textContent = 'No file loaded'; paintMsgs(); return;
  }
  $('controls').style.display = 'none'; $('recon').style.display = 'none'; $('outputGrid').innerHTML = '';
  if (!/\.csv$/i.test(file.name)) fileMsgs.push({ t: 'warn', m: `"${file.name}" does not end in .csv. Reading it anyway.` });
  const reader = new FileReader();
  reader.onerror = () => { $('fileInfo').textContent = 'No file loaded'; fileMsgs.push({ t: 'err', m: 'Could not read the file. Please try again.' }); paintMsgs(); };
  reader.onload = evt => setTimeout(() => {
    const t0 = performance.now();
    parseInfo = parseCSV(evt.target.result);
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
    $('controls').style.display = 'flex'; $('work').style.display = 'block';
    populateFacilities();
  }, 30);
  reader.readAsText(file);
}

function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const out = { rows: [], total: 0, flags: Object.create(null), missing: [], headers: [] };
  let headers = null, stop = false;
  const idx = {};
  const get = (row, k) => idx[k] < 0 ? '' : (row[idx[k]] || '').trim();

  function onRow(row) {
    if (row.length === 1 && !row[0]) return;
    if (!headers) {
      out.headers = row.map(h => h.trim());
      headers = row.map(norm);
      NEEDED.forEach(k => idx[k] = headers.indexOf(norm(k)));
      out.missing = NEEDED.filter(k => idx[k] < 0);
      if (out.missing.length) stop = true;
      return;
    }
    if (row.length <= 5) return;
    out.total++;
    const flag = get(row, 'AVTD_Cut_off_flag');
    if (flag in out.flags || Object.keys(out.flags).length < 20) out.flags[flag] = (out.flags[flag] || 0) + 1;
    if (norm(flag) !== 'todayavtd') return;
    const pdt = get(row, 'pdt'), pt = get(row, 'pt'), cat = get(row, 'AVTD_Cat'), rem = get(row, 'Main_Remarks'), ss = get(row, 'ss'), st = get(row, 'st');
    out.rows.push({
      mwn: get(row, 'mwn').replace(/^`+/, '').trim(),
      cl: get(row, 'cl') || 'Unknown',
      cn: get(row, 'cn'),
      pdt, pdtN: norm(pdt), pt, ptN: norm(pt), cat, catN: norm(cat),
      rem, remN: norm(rem), ss, ssN: norm(ss), st, stN: norm(st),
      nsl: get(row, 'NSL_REMARKS') || 'No Remark',
      nslN: norm(get(row, 'NSL_REMARKS'))
    });
  }

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
  return out;
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
const reasonOf = r => fixes[r.mwn] || r.nsl;   // typed reason wins over the system remark
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
  const todo = pend.filter(r => isFlagged(r) && !fixes[r.mwn]), done = pend.filter(r => fixes[r.mwn]);
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
    inp.setAttribute('list', 'reasonList'); inp.placeholder = 'Actual reason'; inp.value = fixes[r.mwn] || '';
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') applyFix(r.mwn, inp.value); });
    const b = el('button', 'copy-btn', fixes[r.mwn] ? 'Undo' : 'Apply');
    b.onclick = () => fixes[r.mwn] ? revertFix(r.mwn) : applyFix(r.mwn, inp.value);
    const ti = el('td'), tbtn = el('td'); ti.appendChild(inp); tbtn.appendChild(b);
    const chips = el('div', 'chips');
    TOP_REASONS.forEach(t => { const c = el('button', 'chip' + (fixes[r.mwn] === t ? ' on' : ''), t); c.type = 'button'; c.onclick = () => applyFix(r.mwn, t, true); chips.appendChild(c); });
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
  hubPend(rows.filter(r => r.cn === $('facilitySelect').value)).forEach(r => { if (isFlagged(r) && r.nsl === rem && !fixes[r.mwn]) { fixes[r.mwn] = reason; n++; } });
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
  ['cards', 'fix', 'summary'].forEach(k => { $('p-' + k).style.display = k === t ? 'block' : 'none'; });
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
    String(hubPend(h).filter(r => isFlagged(r) && !fixes[r.mwn]).length)];
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
    ret: retRows.length ? buildAVTDSection('B2B Return AVTD SL (% Dispatched)', retRows.filter(r => r.cn === cn && r.pdtN === 'b2b'), gbc, showEx) : null,
    dB2b: buildDelSection('% Delivered of Dispatch (B2B)', b2b, false, gbc),
    dHvy: buildDelSection('% Closed of Dispatch (Heavy)', heavy, false, gbc),
    dPre: buildDelSection('% Delivered of Dispatch (Pre-paid B2C)', b2c.filter(r => r.ptN === 'prepaid'), false, gbc),
    dCod: buildDelSection('% Delivered of Dispatch (COD B2C)', b2c.filter(r => r.ptN === 'cod'), false, gbc),
    dRvp: buildRvpDelSection(rvp, gbc)
  };
  // Cards follow the order of your LM sheet.
  const sections = [S.b2c, S.b2b, S.hvy, S.hapci, S.rvp, S.ret, S.dB2b, S.dHvy, S.dPre, S.dCod, S.dRvp].filter(Boolean);
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
  pickFile: () => $('fileInput').click(), pickReturn: () => $('retInput').click(),
  render: () => renderAll(), hubs: () => populateFacilities(),
  whatsapp: () => copyWhatsApp(), copyAll: () => copyAll(), copyWW: () => copyWWRow(), goFix: () => showTab('fix'),
  bulk: () => applyBulk(), clear: () => clearFixes(), saveFlags: () => saveFlags(), resetFlags: () => resetFlags()
};
document.querySelectorAll('[data-act]').forEach(e => {
  e.addEventListener(e.tagName === 'INPUT' || e.tagName === 'SELECT' ? 'change' : 'click', ACTIONS[e.dataset.act]);
});

// ---- Install / offline support ----
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
