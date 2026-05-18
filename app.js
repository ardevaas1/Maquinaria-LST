// ============================================
// CONSTRUCTORA LST — Flota & Equipos
// ============================================

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

let allEquipos = [];
let currentEquipo = null;
let currentFilter = 'todos';
const today = new Date();

// ── Utilidades ────────────────────────────────────────────────
function parseEstado(raw) {
  if (!raw) return 'sin-dato';
  const r = raw.toLowerCase();
  if (r.includes('reparaci')) return 'rep';
  if (r.includes('observaci')) return 'obs';
  if (r.includes('operativ')) return 'op';
  if (r.includes('deteni')) return 'det';
  return 'otro';
}
const ESTADO_LABEL = { op:'Operativo', obs:'Con observaciones', det:'Detenido', rep:'En reparación', 'sin-dato':'Sin dato', otro:'Otro' };
const ESTADO_COLOR = { op:'green', obs:'amber', det:'red', rep:'blue', otro:'gray' };

function iconoEquipo(tipo) {
  const t = (tipo || '').toLowerCase();
  if (t.includes('camioneta'))     return '🚙';
  if (t.includes('camion') || t.includes('camión')) return '🚛';
  if (t.includes('furgon') || t.includes('furgón')) return '🚐';
  if (t.includes('retroexcavadora')) return '🚜';
  if (t.includes('excavadora'))    return '🏗️';
  if (t.includes('minicargador'))  return '🟡';
  if (t.includes('manipulador'))   return '🏗️';
  if (t.includes('grua') || t.includes('grúa')) return '🏗️';
  if (t.includes('rodillo'))       return '🛞';
  if (t.includes('mixer'))         return '🔄';
  if (t.includes('tractor'))       return '🚜';
  if (t.includes('generador'))     return '⚡';
  return '🔧';
}

function diasRestantes(fechaStr) {
  if (!fechaStr) return null;
  const s = fechaStr.toString().trim().toLowerCase();
  if (!s || s === '-' || s === 'falta' || s === 'foto' || s === 'sin dato') return null;
  const parts = s.split('/');
  if (parts.length === 3) {
    const d = new Date(+parts[2], +parts[1] - 1, +parts[0]);
    if (isNaN(d)) return null;
    return Math.round((d - today) / 86400000);
  }
  return null;
}

function docBadge(dias) {
  if (dias === null) return '<span class="badge gray">Sin dato</span>';
  if (dias < 0)   return `<span class="badge red">Vencido hace ${Math.abs(dias)}d</span>`;
  if (dias < 30)  return `<span class="badge amber">Vence en ${dias}d</span>`;
  if (dias < 60)  return `<span class="badge blue">Vence en ${dias}d</span>`;
  return `<span class="badge green">Vigente ${dias}d</span>`;
}

function formatNum(v) {
  const n = parseFloat((v || '').toString().replace(/\./g, '').replace(',', '.'));
  if (isNaN(n)) return v || '—';
  return n.toLocaleString('es-CL');
}

function field(label, value) {
  return `<div class="field-row"><span class="fl">${label}</span><span class="fv">${value || '—'}</span></div>`;
}

function toast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3000);
}

function splash(pct, hint) {
  document.getElementById('splash-progress').style.width = pct + '%';
  if (hint) document.getElementById('splash-hint').textContent = hint;
}

function hideSplash() {
  const el = document.getElementById('splash');
  el.style.opacity = '0';
  el.style.transition = 'opacity 0.4s';
  setTimeout(() => {
    el.classList.add('hidden');
    document.getElementById('main').classList.remove('hidden');
  }, 400);
}

// ── Google Sheets API ─────────────────────────────────────────
async function fetchSheet(range) {
  const url = `${SHEETS_BASE}/${CONFIG.SHEET_ID}/values/${encodeURIComponent(range)}?key=${CONFIG.API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Error ${res.status}: ${txt}`);
  }
  return (await res.json()).values || [];
}

async function writeSheet(range, values) {
  const url = `${SHEETS_BASE}/${CONFIG.SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED&key=${CONFIG.API_KEY}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
  });
  if (!res.ok) throw new Error(`Error escritura: ${res.status} — ${await res.text()}`);
  return res.json();
}

async function appendSheet(range, values) {
  const url = `${SHEETS_BASE}/${CONFIG.SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS&key=${CONFIG.API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
  });
  if (!res.ok) throw new Error(`Error append: ${res.status} — ${await res.text()}`);
  return res.json();
}

// ── Cargar datos ──────────────────────────────────────────────
async function loadData() {
  document.getElementById('refresh-icon').style.opacity = '0.3';
  splash(10, 'Conectando con Google Sheets...');

  try {
    // Lee hoja MAQUINARIA desde fila 2 (fila 1 = headers)
    // Columnas esperadas (ajustar si el Sheet tiene otro orden):
    // A=N° B=EQUIPO C=CODIGO D=MARCA E=MODELO F=AÑO G=COLOR H=PATENTE
    // I=ESTADO J=UBICACION K=HOROMETRO L=PROX_MANT M=ULT_MANT
    // N=SOAP O=PERMISO P=REVISION Q=? R=? S=OBS T=MANT_CADA U=PROPIETARIO V=RUT W=LINK_PLANILLA
    const rows = await fetchSheet(`'${CONFIG.SHEET_MAQUINARIA}'!A4:W200`);
    splash(70, 'Procesando equipos...');

    allEquipos = rows
      .filter(r => r[1] && r[1].toString().trim())
      .map((r, i) => ({
        rowIndex:  i + 4,           // fila real en el Sheet (empieza en fila 4)
        equipo:    r[1]  || '',     // tipo (Camión, Excavadora, etc.)
        codigo:    r[2]  || '',
        marca:     r[3]  || '',
        modelo:    r[4]  || '',
        anio:      r[5]  || '',
        color:     r[6]  || '',
        patente:   r[7]  || '',
        estadoRaw: r[8]  || '',
        estado:    parseEstado(r[8]),
        ubicacion: r[9]  || '',
        horometro: r[10] || '',
        proxMant:  r[11] || '',
        ultMant:   r[12] || '',
        soap:      r[13] || '',
        permiso:   r[14] || '',
        revision:  r[15] || '',
        obs:       r[18] || '',
        mantCada:  r[19] || '',
        propietario: r[20] || '',
        rut:       r[21] || '',
        linkPlanilla: r[22] || '',  // columna W: link al Sheet individual por patente
      }));

    splash(100, '¡Listo!');
    renderDashboard();
    renderEquipos();
    renderAlertas();
    renderMantenciones();
    setTimeout(hideSplash, 300);
    toast('Datos actualizados ✓');
  } catch (e) {
    console.error(e);
    splash(100, 'Error: ' + e.message);
    toast('Error al cargar: ' + e.message, 'error');
    setTimeout(hideSplash, 1500);
  } finally {
    document.getElementById('refresh-icon').style.opacity = '1';
  }
}

// ── Dashboard ─────────────────────────────────────────────────
function renderDashboard() {
  document.getElementById('stat-op').textContent  = allEquipos.filter(e => e.estado === 'op').length;
  document.getElementById('stat-obs').textContent = allEquipos.filter(e => e.estado === 'obs').length;
  document.getElementById('stat-det').textContent = allEquipos.filter(e => e.estado === 'det' || e.estado === 'rep').length;

  let docsVenc = 0;
  allEquipos.forEach(e => {
    ['soap','permiso','revision'].forEach(k => {
      const d = diasRestantes(e[k]);
      if (d !== null && d < 0) docsVenc++;
    });
  });
  document.getElementById('stat-docs').textContent = docsVenc;
  document.getElementById('nav-dot').style.display = docsVenc > 0 ? 'block' : 'none';

  // Alertas urgentes: docs vencidos o próximos a vencer en 60 días
  const alertas = [];
  allEquipos.forEach(e => {
    [['soap','SOAP'],['permiso','Permiso Circ.'],['revision','Rev. Técnica']].forEach(([k,lbl]) => {
      const d = diasRestantes(e[k]);
      if (d !== null && d < CONFIG.DIAS_ALERTA) alertas.push({ e, lbl, d });
    });
  });
  alertas.sort((a, b) => a.d - b.d);

  document.getElementById('dash-alerts').innerHTML = alertas.slice(0, 6).map(({ e, lbl, d }) => {
    const cls = d < 0 ? 'red' : d < 30 ? 'amber' : 'blue';
    const txt = d < 0 ? `Vencido ${Math.abs(d)}d` : `Vence en ${d}d`;
    return `<div class="card" onclick="openFicha('${e.patente}')">
      <div class="card-icon">${iconoEquipo(e.equipo)}</div>
      <div class="card-body">
        <div class="card-title">${e.marca} ${e.modelo}</div>
        <div class="card-sub">${e.equipo} · ${e.patente} · ${e.ubicacion}</div>
      </div>
      <div class="card-right">
        <span class="badge ${cls}">${txt}</span>
        <span style="font-size:11px;color:#aaa">${lbl}</span>
      </div>
    </div>`;
  }).join('') || '<div class="empty">Sin alertas urgentes ✓</div>';

  // Mantenciones próximas
  const conHoro = allEquipos
    .filter(e => e.horometro && e.proxMant)
    .map(e => {
      const actual = parseFloat((e.horometro || '').toString().replace(/\./g, '').replace(',', '.')) || 0;
      const prox   = parseFloat((e.proxMant  || '').toString().replace(/\./g, '').replace(',', '.')) || 0;
      return { ...e, actual, prox, diff: prox - actual };
    })
    .filter(e => e.prox > 0)
    .sort((a, b) => a.diff - b.diff);

  document.getElementById('dash-mant').innerHTML = conHoro.slice(0, 5).map(e => {
    const cls = e.diff < 0 ? 'red' : e.diff < 500 ? 'amber' : 'green';
    const txt = e.diff >= 0 ? `Faltan ${formatNum(e.diff)}` : 'ATRASADA';
    return `<div class="card" onclick="openFicha('${e.patente}')">
      <div class="card-icon">${iconoEquipo(e.equipo)}</div>
      <div class="card-body">
        <div class="card-title">${e.marca} ${e.modelo}</div>
        <div class="card-sub">Actual: ${formatNum(e.actual)} · Próxima: ${formatNum(e.prox)}</div>
      </div>
      <span class="badge ${cls}">${txt}</span>
    </div>`;
  }).join('') || '<div class="empty">Sin datos de horómetro disponibles</div>';
}

// ── Equipos ───────────────────────────────────────────────────
function renderEquipos() {
  const txt = (document.getElementById('search-input').value || '').toLowerCase();

  const filtered = allEquipos.filter(e => {
    const matchF =
      currentFilter === 'todos' ||
      (currentFilter === 'op'  && e.estado === 'op')  ||
      (currentFilter === 'obs' && e.estado === 'obs') ||
      (currentFilter === 'det' && e.estado === 'det') ||
      (currentFilter === 'rep' && e.estado === 'rep');
    const matchT = !txt ||
      e.marca.toLowerCase().includes(txt)    ||
      e.modelo.toLowerCase().includes(txt)   ||
      e.equipo.toLowerCase().includes(txt)   ||
      e.patente.toLowerCase().includes(txt)  ||
      e.ubicacion.toLowerCase().includes(txt);
    return matchF && matchT;
  });

  document.getElementById('equipos-list').innerHTML = filtered.map(e => `
    <div class="card" onclick="openFicha('${e.patente}')">
      <div class="card-icon">${iconoEquipo(e.equipo)}</div>
      <div class="card-body">
        <div class="card-title">${e.marca} ${e.modelo}</div>
        <div class="card-sub">${e.equipo} · ${e.patente} · ${e.anio}</div>
        <span class="badge ${ESTADO_COLOR[e.estado] || 'gray'}" style="margin-top:4px;">${ESTADO_LABEL[e.estado] || e.estado}</span>
      </div>
      <div class="card-right">
        <span class="card-arrow">›</span>
        <span style="font-size:11px;color:#aaa">${e.ubicacion}</span>
      </div>
    </div>
  `).join('') || '<div class="empty">Sin resultados</div>';
}

function setFilter(f, btn) {
  currentFilter = f;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  renderEquipos();
}

// ── Ficha equipo ──────────────────────────────────────────────
function openFicha(patente) {
  currentEquipo = allEquipos.find(e => e.patente === patente);
  if (!currentEquipo) return;
  const e = currentEquipo;

  document.getElementById('ficha-title').textContent = `${e.marca} ${e.modelo}`;

  // Construye link a la planilla individual (pestaña con nombre = patente)
  const linkPlanilla = e.linkPlanilla
    ? e.linkPlanilla
    : `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/edit#gid=0`;

  const sheetTabLink = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/edit#gid=0`;

  document.getElementById('ficha-body').innerHTML = `
    <div class="ficha-hero">
      <div class="ficha-hero-icon">${iconoEquipo(e.equipo)}</div>
      <div class="ficha-hero-info">
        <div class="ficha-hero-type">${e.equipo}</div>
        <div class="ficha-hero-name">${e.marca} ${e.modelo}</div>
        <div class="ficha-hero-plate">${e.patente} · ${e.anio} · ${e.color}</div>
        <span class="badge ${ESTADO_COLOR[e.estado] || 'gray'}" style="margin-top:6px;display:inline-block;">
          ${ESTADO_LABEL[e.estado] || e.estado}
        </span>
      </div>
    </div>

    <div class="ficha-section">
      <div class="ficha-sec-title">Información general</div>
      ${field('Ubicación', e.ubicacion)}
      ${field('Propietario', e.propietario)}
      ${field('Año', e.anio)}
      ${field('Color', e.color)}
    </div>

    <div class="ficha-section">
      <div class="ficha-sec-title">Horómetro / Odómetro</div>
      ${field('Actual', formatNum(e.horometro) + (e.mantCada ? ' · Mantención cada ' + e.mantCada : ''))}
      ${field('Próxima mantención', formatNum(e.proxMant))}
      ${field('Última mantención', formatNum(e.ultMant))}
      ${e.obs ? `<div class="ficha-obs">⚠️ ${e.obs}</div>` : ''}
      <button class="action-btn" onclick="openMantPanel('${e.patente}')">+ Registrar mantención</button>
    </div>

    <div class="ficha-section">
      <div class="ficha-sec-title">Documentos</div>
      <div class="doc-row">
        <div><div class="doc-name">SOAP</div><div class="doc-date">${e.soap || 'Sin dato'}</div></div>
        ${docBadge(diasRestantes(e.soap))}
      </div>
      <div class="doc-row">
        <div><div class="doc-name">Permiso de circulación</div><div class="doc-date">${e.permiso || 'Sin dato'}</div></div>
        ${docBadge(diasRestantes(e.permiso))}
      </div>
      <div class="doc-row">
        <div><div class="doc-name">Revisión técnica</div><div class="doc-date">${e.revision || 'Sin dato'}</div></div>
        ${docBadge(diasRestantes(e.revision))}
      </div>
    </div>

    <a class="ficha-link-btn" href="${linkPlanilla}" target="_blank" rel="noopener">
      📄 Abrir planilla de ${e.patente}
    </a>

    <button class="action-btn" onclick="openEditPanel()" style="margin-top:8px;">✏️ Editar información</button>
  `;

  openPanel('panel-ficha');
}

// ── Alertas ───────────────────────────────────────────────────
function renderAlertas() {
  const vencidos = [], pronto = [], ok = [];

  allEquipos.forEach(e => {
    const entries = [['soap','SOAP'],['permiso','Permiso Circ.'],['revision','Rev. Técnica']];
    let hasVenc = false, hasPront = false;
    const badges = entries.map(([k, lbl]) => {
      const d = diasRestantes(e[k]);
      if (d === null) return `<span class="badge gray">${lbl} sin dato</span>`;
      if (d < 0)              { hasVenc  = true; return `<span class="badge red">${lbl} vencido ${Math.abs(d)}d</span>`; }
      if (d < CONFIG.DIAS_ALERTA) { hasPront = true; return `<span class="badge ${d < 30 ? 'amber' : 'blue'}">${lbl} ${d}d</span>`; }
      return `<span class="badge green">${lbl} ✓ ${d}d</span>`;
    }).join('');

    const card = `<div class="card" onclick="openFicha('${e.patente}')">
      <div class="card-icon">${iconoEquipo(e.equipo)}</div>
      <div class="card-body">
        <div class="card-title">${e.marca} ${e.modelo}</div>
        <div class="card-sub">${e.equipo} · ${e.patente} · ${e.ubicacion}</div>
        <div class="badge-row">${badges}</div>
      </div>
    </div>`;

    if (hasVenc) vencidos.push(card);
    else if (hasPront) pronto.push(card);
    else ok.push(card);
  });

  document.getElementById('alertas-vencidos').innerHTML = vencidos.join('') || '<div class="empty">Sin documentos vencidos ✓</div>';
  document.getElementById('alertas-pronto').innerHTML   = pronto.join('')   || '<div class="empty">Sin vencimientos próximos ✓</div>';
  document.getElementById('alertas-ok').innerHTML       = ok.join('')       || '<div class="empty">Sin equipos con documentos</div>';
}

// ── Mantenciones ──────────────────────────────────────────────
function renderMantenciones() {
  // Poblar selector de equipos
  document.getElementById('mant-equipo').innerHTML = allEquipos.map(e =>
    `<option value="${e.patente}">${e.marca} ${e.modelo} (${e.patente})</option>`
  ).join('');

  // Próximas
  const conHoro = allEquipos
    .filter(e => e.horometro && e.proxMant)
    .map(e => {
      const actual = parseFloat((e.horometro || '').toString().replace(/\./g,'')) || 0;
      const prox   = parseFloat((e.proxMant  || '').toString().replace(/\./g,'')) || 0;
      return { ...e, actual, prox, diff: prox - actual };
    })
    .filter(e => e.prox > 0)
    .sort((a, b) => a.diff - b.diff);

  document.getElementById('mant-proximas').innerHTML = conHoro.slice(0, 8).map(e => {
    const cls = e.diff < 0 ? 'red' : e.diff < 500 ? 'amber' : 'green';
    return `<div class="mant-card" onclick="openFicha('${e.patente}')">
      <div class="mant-icon">${iconoEquipo(e.equipo)}</div>
      <div class="mant-body">
        <div class="mant-title">${e.marca} ${e.modelo}</div>
        <div class="mant-meta">${e.equipo} · Actual: ${formatNum(e.actual)} · Próxima: ${formatNum(e.prox)} · Cada: ${e.mantCada || '—'}</div>
      </div>
      <span class="badge ${cls}">${e.diff >= 0 ? formatNum(e.diff) + ' restante' : 'ATRASADA'}</span>
    </div>`;
  }).join('') || '<div class="empty">Sin datos de horómetro disponibles</div>';

  // Historial (últimas mantenciones registradas)
  document.getElementById('mant-historial').innerHTML = allEquipos
    .filter(e => e.ultMant && !['-','falta',''].includes(e.ultMant.toString().toLowerCase()))
    .slice(0, 8)
    .map(e => `<div class="mant-card" onclick="openFicha('${e.patente}')">
      <div class="mant-icon">${iconoEquipo(e.equipo)}</div>
      <div class="mant-body">
        <div class="mant-title">${e.marca} ${e.modelo}</div>
        <div class="mant-meta">${e.equipo} · Última: ${formatNum(e.ultMant)} · ${e.ubicacion}</div>
      </div>
    </div>`).join('') || '<div class="empty">Sin historial registrado</div>';
}

// ── Panel mantención ──────────────────────────────────────────
function openMantPanel(patente) {
  if (patente) {
    const sel = document.getElementById('mant-equipo');
    for (const opt of sel.options) {
      if (opt.value === patente) { sel.value = patente; break; }
    }
  }
  document.getElementById('mant-fecha').value = new Date().toISOString().slice(0, 10);
  openPanel('panel-mant');
}

async function saveMant() {
  const patente   = document.getElementById('mant-equipo').value;
  const horometro = document.getElementById('mant-horometro').value;
  const fecha     = document.getElementById('mant-fecha').value;
  const tipo      = document.getElementById('mant-tipo').value;
  const obs       = document.getElementById('mant-obs').value;

  if (!patente || !fecha) { toast('Completa los campos obligatorios', 'error'); return; }

  try {
    const e = allEquipos.find(x => x.patente === patente);
    const nombreEquipo = e ? `${e.marca} ${e.modelo}` : patente;

    // Agrega fila en hoja MANTENCIONES
    await appendSheet(`'${CONFIG.SHEET_MANTENCIONES}'!A:G`, [[
      new Date().toLocaleDateString('es-CL'), patente, nombreEquipo, horometro, tipo, obs, fecha
    ]]);

    // Actualiza horómetro en hoja principal si se ingresó
    if (horometro && e) {
      await writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!K${e.rowIndex}`, [[horometro]]);
      e.horometro = horometro;
    }

    toast('Mantención registrada ✓');
    closePanel('panel-mant');
    renderMantenciones();
    renderDashboard();
  } catch (err) {
    toast('Error al guardar: ' + err.message, 'error');
  }
}

// ── Panel editar equipo ───────────────────────────────────────
function openEditPanel() {
  const e = currentEquipo;
  if (!e) return;
  document.getElementById('edit-row').value      = e.rowIndex;
  document.getElementById('edit-patente').value  = e.patente;
  document.getElementById('edit-estado').value   = e.estadoRaw || 'OPERATIVO';
  document.getElementById('edit-ubicacion').value = e.ubicacion;
  document.getElementById('edit-horometro').value = e.horometro;
  document.getElementById('edit-proxima').value   = e.proxMant;
  document.getElementById('edit-ultima').value    = e.ultMant;
  document.getElementById('edit-soap').value      = e.soap;
  document.getElementById('edit-permiso').value   = e.permiso;
  document.getElementById('edit-revision').value  = e.revision;
  document.getElementById('edit-obs').value       = e.obs;
  openPanel('panel-edit');
}

async function saveEquipo() {
  const row      = document.getElementById('edit-row').value;
  const estado   = document.getElementById('edit-estado').value;
  const ubicacion = document.getElementById('edit-ubicacion').value;
  const horometro = document.getElementById('edit-horometro').value;
  const proxima  = document.getElementById('edit-proxima').value;
  const ultima   = document.getElementById('edit-ultima').value;
  const soap     = document.getElementById('edit-soap').value;
  const permiso  = document.getElementById('edit-permiso').value;
  const revision = document.getElementById('edit-revision').value;
  const obs      = document.getElementById('edit-obs').value;

  if (!row) return;

  try {
    // Escribe en columnas I→S de la fila del equipo:
    // I=ESTADO, J=UBICACION, K=HOROMETRO, L=PROX_MANT, M=ULT_MANT,
    // N=SOAP, O=PERMISO, P=REVISION, Q='', R='', S=OBS
    await writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!I${row}:S${row}`, [[
      estado, ubicacion, horometro, proxima, ultima,
      soap, permiso, revision, '', '', obs
    ]]);

    toast('Guardado en Google Sheets ✓');
    closePanel('panel-edit');

    // Recarga datos para reflejar cambios
    await loadData();
    // Vuelve a abrir la ficha actualizada
    const patente = document.getElementById('edit-patente').value;
    if (patente) openFicha(patente);
  } catch (err) {
    toast('Error al guardar: ' + err.message, 'error');
  }
}

// ── Navegación ────────────────────────────────────────────────
function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  btn.classList.add('active');
  const titles = { dashboard: 'Inicio', equipos: 'Equipos', alertas: 'Alertas', mantenciones: 'Mantención' };
  document.getElementById('page-title').textContent = titles[id] || id;
}

function goEquipos(filter) {
  const btn = document.querySelector(`.nav-item:nth-child(2)`);
  showPage('equipos', btn);
  currentFilter = filter;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  const chipMap = { op: 1, obs: 2, det: 3, rep: 4 };
  const chips = document.querySelectorAll('.chip');
  if (chipMap[filter] !== undefined) chips[chipMap[filter]].classList.add('active');
  renderEquipos();
}

function openPanel(id) {
  const el = document.getElementById(id);
  el.classList.remove('hidden');
  requestAnimationFrame(() => el.style.transform = 'translateX(0)');
}

function closePanel(id) {
  const el = document.getElementById(id);
  el.style.transform = 'translateX(100%)';
  setTimeout(() => el.classList.add('hidden'), 280);
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', loadData);
