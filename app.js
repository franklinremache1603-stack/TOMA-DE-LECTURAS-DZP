const $ = (id) => document.getElementById(id);

const els = {
  fileInput: $("fileInput"),
  routeName: $("routeName"),
  readerName: $("readerName"),
  continueBtn: $("continueBtn"),
  clearRouteBtn: $("clearRouteBtn"),
  totalCount: $("totalCount"),
  readCount: $("readCount"),
  pendingCount: $("pendingCount"),
  noveltyCount: $("noveltyCount"),
  searchInput: $("searchInput"),
  clearSearchBtn: $("clearSearchBtn"),
  results: $("results"),
  progressBar: $("progressBar"),
  progressLabel: $("progressLabel"),
  routeBadge: $("routeBadge"),
  readingCard: $("readingCard"),
  photoCard: $("photoCard"),
  recordStatus: $("recordStatus"),
  vSequence: $("vSequence"),
  vAccount: $("vAccount"),
  vMeter: $("vMeter"),
  vCustomer: $("vCustomer"),
  vAddress: $("vAddress"),
  vPrevious: $("vPrevious"),
  vConsumption: $("vConsumption"),
  currentReading: $("currentReading"),
  novelty: $("novelty"),
  observation: $("observation"),
  warningBox: $("warningBox"),
  prevBtn: $("prevBtn"),
  saveBtn: $("saveBtn"),
  nextBtn: $("nextBtn"),
  gpsBtn: $("gpsBtn"),
  photoInput: $("photoInput"),
  removePhotoBtn: $("removePhotoBtn"),
  vTimestamp: $("vTimestamp"),
  vGps: $("vGps"),
  vPhoto: $("vPhoto"),
  photoStatusBadge: $("photoStatusBadge"),
  photoGpsValue: $("photoGpsValue"),
  photoTimeValue: $("photoTimeValue"),
  photoPreview: $("photoPreview"),
  backupBtn: $("backupBtn"),
  restoreInput: $("restoreInput"),
  exportXlsxBtn: $("exportXlsxBtn"),
  exportCsvBtn: $("exportCsvBtn"),
  toast: $("toast"),
  installBtn: $("installBtn"),
  connectionStatus: $("connectionStatus"),
};

let state = {
  routeName: "",
  readerName: "",
  records: [],
  selectedId: null,
  filter: "all",
  sourceFileName: "",
};

let deferredInstallPrompt = null;

// -------------------------
// IndexedDB
// -------------------------
const DB_NAME = "lecturas-eeq-db";
const DB_VERSION = 1;
const STORE_NAME = "app";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function persist() {
  state.routeName = els.routeName.value.trim();
  state.readerName = els.readerName.value.trim();
  await idbSet("state", state);
}

// -------------------------
// Utilidades
// -------------------------
function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function canonicalHeader(value) {
  return normalizeText(value).replace(/[^A-Z0-9]/g, "");
}

function firstValue(row, aliases) {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const target = canonicalHeader(alias);
    const found = entries.find(([key]) => canonicalHeader(key) === target);
    if (found) return found[1];
  }
  return "";
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const cleaned = String(value).replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat("es-EC", { maximumFractionDigits: 2 }).format(n);
}

function safeFileName(value) {
  return String(value || "ruta")
    .trim()
    .replace(/[^\w\-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function nowIso() {
  return new Date().toISOString();
}

function localDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-EC", {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function toast(message, ms = 2500) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => els.toast.classList.add("hidden"), ms);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function generateId(index) {
  return `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRead(record) {
  return record.currentReading !== null && record.currentReading !== "" && Number.isFinite(Number(record.currentReading));
}

function isNovelty(record) {
  return Boolean(record.novelty);
}

function computeConsumption(record) {
  const prev = numberOrNull(record.previousReading);
  const current = numberOrNull(record.currentReading);
  if (prev === null || current === null) return null;
  return current - prev;
}

// -------------------------
// Importación
// -------------------------
async function readFileRows(file) {
  const ext = file.name.split(".").pop().toLowerCase();

  if (ext === "csv") {
    const text = await file.text();
    return parseCsv(text);
  }

  if (!window.XLSX) {
    throw new Error("No se pudo cargar el módulo Excel. Conéctese a internet una vez y vuelva a abrir la aplicación.");
  }

  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
}

function parseCsv(text) {
  // Parser CSV pequeño que admite coma o punto y coma y comillas dobles.
  const firstLine = text.split(/\r?\n/)[0] || "";
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const delimiter = semiCount > commaCount ? ";" : ",";

  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (quoted && next === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some(v => String(v).trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  row.push(cell);
  if (row.some(v => String(v).trim() !== "")) rows.push(row);

  if (!rows.length) return [];

  const headers = rows.shift().map(h => h.trim());
  return rows.map(cols => {
    const obj = {};
    headers.forEach((h, i) => obj[h || `COL_${i+1}`] = cols[i] ?? "");
    return obj;
  });
}

function mapImportedRow(row, index) {
  const sequence = firstValue(row, [
    "SECUENCIA", "SECU", "ORDEN", "ORD", "RUTA_SECUENCIA", "SEQ"
  ]);

  const account = firstValue(row, [
    "CUENTA", "CUENTA_CONTRATO", "CUENTACONTRATO", "CONTRATO", "CTA", "CUENTA CONTRATO"
  ]);

  const meter = firstValue(row, [
    "MEDIDOR", "NUMERO_MEDIDOR", "NUMMEDIDOR", "NRO_MEDIDOR", "EQUIPO", "SERIE", "N° MEDIDOR", "NO MEDIDOR"
  ]);

  const customer = firstValue(row, [
    "CLIENTE", "NOMBRE", "NOMBRE_CLIENTE", "CONSUMIDOR", "USUARIO", "ABONADO"
  ]);

  const address = firstValue(row, [
    "DIRECCION", "DIRECCIÓN", "DOMICILIO", "UBICACION", "UBICACIÓN", "SECTOR"
  ]);

  const previousReading = firstValue(row, [
    "LECTURA_ANTERIOR", "LECTURAANTERIOR", "LECT_ANT", "LECTURA ANTERIOR", "ANTERIOR", "ULTIMA_LECTURA"
  ]);

  return {
    id: generateId(index),
    original: row,
    sequence: String(sequence ?? "").trim(),
    account: String(account ?? "").trim(),
    meter: String(meter ?? "").trim(),
    customer: String(customer ?? "").trim(),
    address: String(address ?? "").trim(),
    previousReading: previousReading === "" ? null : numberOrNull(previousReading),
    currentReading: null,
    novelty: "",
    observation: "",
    timestamp: "",
    latitude: null,
    longitude: null,
    accuracy: null,
    photoDataUrl: "",
    readerName: "",
  };
}

async function importRoute(file) {
  const rows = await readFileRows(file);

  if (!rows.length) {
    throw new Error("El archivo no contiene registros.");
  }

  const records = rows.map(mapImportedRow).filter(r =>
    r.account || r.meter || r.customer || r.address || r.sequence
  );

  if (!records.length) {
    throw new Error("No se encontraron registros utilizables.");
  }

  state.records = records;
  state.selectedId = null;
  state.filter = "all";
  state.sourceFileName = file.name;

  if (!els.routeName.value.trim()) {
    els.routeName.value = file.name.replace(/\.[^.]+$/, "");
  }

  await persist();
  renderAll();
  toast(`Ruta cargada: ${records.length} registros`);
}

// -------------------------
// Renderizado
// -------------------------
function selectedRecord() {
  return state.records.find(r => r.id === state.selectedId) || null;
}

function recordTag(record) {
  if (isNovelty(record)) return `<span class="tag novelty">Novedad</span>`;
  if (isRead(record)) return `<span class="tag read">Leído</span>`;
  return `<span class="tag">Pendiente</span>`;
}

function filteredRecords() {
  const q = normalizeText(els.searchInput.value);

  return state.records.filter(record => {
    if (state.filter === "pending" && (isRead(record) || isNovelty(record))) return false;
    if (state.filter === "read" && !isRead(record)) return false;
    if (state.filter === "novelty" && !isNovelty(record)) return false;

    if (!q) return true;

    const haystack = normalizeText([
      record.sequence,
      record.account,
      record.meter,
      record.customer,
      record.address,
      record.novelty,
    ].join(" "));

    return haystack.includes(q);
  });
}

function renderStats() {
  const total = state.records.length;
  const read = state.records.filter(isRead).length;
  const novelty = state.records.filter(isNovelty).length;
  const completed = state.records.filter(r => isRead(r) || isNovelty(r)).length;
  const pending = Math.max(total - completed, 0);
  const pct = total ? Math.round((completed / total) * 1000) / 10 : 0;

  els.totalCount.textContent = total;
  els.readCount.textContent = read;
  els.pendingCount.textContent = pending;
  els.noveltyCount.textContent = novelty;
  els.progressBar.style.width = `${pct}%`;
  els.progressLabel.textContent = `${pct}% completado`;

  els.routeBadge.textContent = state.routeName
    ? `${state.routeName} · ${total} registros`
    : "Sin ruta";
}

function renderResults() {
  const list = filteredRecords().slice(0, 300);

  if (!state.records.length) {
    els.results.innerHTML = `<div class="empty">Cargue una ruta para comenzar.</div>`;
    return;
  }

  if (!list.length) {
    els.results.innerHTML = `<div class="empty">No hay coincidencias con el filtro actual.</div>`;
    return;
  }

  els.results.innerHTML = list.map(record => {
    const selected = record.id === state.selectedId ? "selected" : "";
    return `
      <button class="result-item ${selected}" data-id="${escapeHtml(record.id)}">
        <div class="result-line">
          <div>
            <strong>${escapeHtml(record.meter || "Sin medidor")}</strong>
            <small> · Cuenta ${escapeHtml(record.account || "—")}</small>
          </div>
          ${recordTag(record)}
        </div>
        <div><small>${escapeHtml(record.sequence || "—")} · ${escapeHtml(record.customer || "Sin nombre")}</small></div>
        <div><small>${escapeHtml(record.address || "Sin dirección")}</small></div>
      </button>
    `;
  }).join("");

  els.results.querySelectorAll(".result-item").forEach(btn => {
    btn.addEventListener("click", () => selectRecord(btn.dataset.id));
  });
}

function renderSelected() {
  const record = selectedRecord();

  if (!record) {
    els.readingCard.classList.add("hidden");
    if (els.photoCard) els.photoCard.classList.add("hidden");
    return;
  }

  els.readingCard.classList.remove("hidden");
  if (els.photoCard) els.photoCard.classList.remove("hidden");
  els.vSequence.textContent = record.sequence || "—";
  els.vAccount.textContent = record.account || "—";
  els.vMeter.textContent = record.meter || "—";
  els.vCustomer.textContent = record.customer || "—";
  els.vAddress.textContent = record.address || "—";
  els.vPrevious.textContent = formatNumber(record.previousReading);
  els.vConsumption.textContent = formatNumber(computeConsumption(record));

  els.currentReading.value = record.currentReading ?? "";
  els.novelty.value = record.novelty || "";
  els.observation.value = record.observation || "";

  els.vTimestamp.textContent = localDateTime(record.timestamp);

  if (record.latitude !== null && record.longitude !== null) {
    const acc = record.accuracy ? ` ±${Math.round(record.accuracy)} m` : "";
    els.vGps.textContent = `${record.latitude.toFixed(6)}, ${record.longitude.toFixed(6)}${acc}`;
  } else {
    els.vGps.textContent = "—";
  }

  if (record.photoDataUrl) {
    els.vPhoto.textContent = "Foto guardada";
    if (els.photoStatusBadge) {
      els.photoStatusBadge.textContent = "Foto + GPS";
      els.photoStatusBadge.className = "badge";
    }

    els.photoPreview.src = record.photoDataUrl;
    els.photoPreview.classList.remove("hidden");

    if (els.photoGpsValue) {
      if (record.latitude !== null && record.longitude !== null) {
        const acc = record.accuracy ? ` ±${Math.round(record.accuracy)} m` : "";
        els.photoGpsValue.textContent =
          `${record.latitude.toFixed(6)}, ${record.longitude.toFixed(6)}${acc}`;
      } else {
        els.photoGpsValue.textContent = "Foto guardada sin GPS";
      }
    }

    if (els.photoTimeValue) {
      els.photoTimeValue.textContent = localDateTime(record.photoTimestamp || record.timestamp);
    }
  } else {
    els.vPhoto.textContent = "Sin foto";

    if (els.photoStatusBadge) {
      els.photoStatusBadge.textContent = "Sin foto";
      els.photoStatusBadge.className = "badge muted";
    }

    if (els.photoGpsValue) els.photoGpsValue.textContent = "Sin ubicación";
    if (els.photoTimeValue) els.photoTimeValue.textContent = "—";

    els.photoPreview.removeAttribute("src");
    els.photoPreview.classList.add("hidden");
  }

  if (isNovelty(record)) {
    els.recordStatus.textContent = "Novedad";
    els.recordStatus.className = "badge";
  } else if (isRead(record)) {
    els.recordStatus.textContent = "Leído";
    els.recordStatus.className = "badge";
  } else {
    els.recordStatus.textContent = "Pendiente";
    els.recordStatus.className = "badge muted";
  }

  updateWarning();
}

function renderAll() {
  els.routeName.value = state.routeName || els.routeName.value;
  els.readerName.value = state.readerName || els.readerName.value;
  renderStats();
  renderResults();
  renderSelected();
}

function selectRecord(id) {
  state.selectedId = id;
  renderResults();
  renderSelected();
  setTimeout(() => {
    els.readingCard.scrollIntoView({ behavior: "smooth", block: "start" });
    els.currentReading.focus();
  }, 50);
}

function updateWarning() {
  const record = selectedRecord();
  if (!record) return;

  const prev = numberOrNull(record.previousReading);
  const curr = numberOrNull(els.currentReading.value);

  els.warningBox.classList.add("hidden");
  els.warningBox.textContent = "";

  if (prev !== null && curr !== null) {
    const diff = curr - prev;

    if (diff < 0) {
      els.warningBox.textContent =
        `⚠️ La lectura actual es menor que la anterior (${formatNumber(prev)}). Verifique el dato o registre la novedad correspondiente.`;
      els.warningBox.classList.remove("hidden");
    } else if (diff === 0) {
      els.warningBox.textContent =
        "⚠️ La lectura es igual a la lectura anterior. Verifique si corresponde.";
      els.warningBox.classList.remove("hidden");
    }
  }

  const live = { ...record, currentReading: curr };
  els.vConsumption.textContent = formatNumber(computeConsumption(live));
}

// -------------------------
// Guardar lectura
// -------------------------
async function saveCurrent() {
  const record = selectedRecord();
  if (!record) {
    toast("Seleccione un registro.");
    return;
  }

  const curr = numberOrNull(els.currentReading.value);
  const novelty = els.novelty.value;

  if (curr === null && !novelty) {
    toast("Ingrese una lectura o seleccione una novedad.");
    return;
  }

  const prev = numberOrNull(record.previousReading);
  if (prev !== null && curr !== null) {
    if (curr < prev && !novelty) {
      const ok = confirm("La lectura es menor que la anterior. ¿Desea guardarla de todas formas?");
      if (!ok) return;
    }
    if (curr === prev && !novelty) {
      const ok = confirm("La lectura es igual a la anterior. ¿Desea guardarla de todas formas?");
      if (!ok) return;
    }
  }

  record.currentReading = curr;
  record.novelty = novelty;
  record.observation = els.observation.value.trim();
  record.timestamp = nowIso();
  record.readerName = els.readerName.value.trim();

  await persist();
  renderAll();
  toast("Lectura guardada.");
}

function navigateRecord(direction) {
  if (!state.records.length) return;

  const filtered = filteredRecords();
  const base = filtered.length ? filtered : state.records;
  let idx = base.findIndex(r => r.id === state.selectedId);

  if (idx < 0) idx = 0;
  else idx = Math.min(Math.max(idx + direction, 0), base.length - 1);

  selectRecord(base[idx].id);
}

// -------------------------
// GPS y foto
// -------------------------
function captureGps() {
  const record = selectedRecord();
  if (!record) {
    toast("Seleccione un registro.");
    return;
  }

  if (!navigator.geolocation) {
    toast("Este dispositivo no permite geolocalización.");
    return;
  }

  els.gpsBtn.disabled = true;
  els.gpsBtn.textContent = "📍 Obteniendo GPS...";

  navigator.geolocation.getCurrentPosition(
    async pos => {
      record.latitude = pos.coords.latitude;
      record.longitude = pos.coords.longitude;
      record.accuracy = pos.coords.accuracy;
      record.timestamp = record.timestamp || nowIso();
      await persist();
      renderSelected();
      toast("Ubicación guardada.");
      els.gpsBtn.disabled = false;
      els.gpsBtn.textContent = "📍 Capturar GPS";
    },
    err => {
      toast(`No se pudo obtener GPS: ${err.message}`);
      els.gpsBtn.disabled = false;
      els.gpsBtn.textContent = "📍 Capturar GPS";
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
  );
}

function getCurrentGps() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Este dispositivo no permite geolocalización."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      err => reject(err),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  });
}

function resizeImage(file, maxSize = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo procesar la imagen."));
      img.onload = () => {
        let { width, height } = img;

        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function attachPhoto(file) {
  const record = selectedRecord();
  if (!record || !file) return;

  try {
    if (els.photoStatusBadge) {
      els.photoStatusBadge.textContent = "Guardando foto...";
      els.photoStatusBadge.className = "badge muted";
    }

    // Primero se procesa y guarda la fotografía.
    record.photoDataUrl = await resizeImage(file);
    record.photoTimestamp = nowIso();
    record.timestamp = record.photoTimestamp;

    // Luego se solicita automáticamente el GPS para asociarlo a esa foto.
    try {
      if (els.photoStatusBadge) {
        els.photoStatusBadge.textContent = "Obteniendo GPS...";
      }

      const gps = await getCurrentGps();
      record.latitude = gps.latitude;
      record.longitude = gps.longitude;
      record.accuracy = gps.accuracy;

      await persist();
      renderSelected();
      toast("Fotografía y ubicación GPS guardadas.");
    } catch (gpsErr) {
      // La foto se conserva aunque el usuario no autorice GPS.
      record.latitude = null;
      record.longitude = null;
      record.accuracy = null;

      await persist();
      renderSelected();

      const msg =
        gpsErr?.code === 1
          ? "Foto guardada. Para ligar el GPS, permita el acceso a ubicación en el navegador."
          : "Foto guardada, pero no se pudo obtener la ubicación GPS.";

      toast(msg, 4500);
    }
  } catch (err) {
    toast(err.message || "No se pudo guardar la foto.");
  }
}

async function removePhoto() {
  const record = selectedRecord();
  if (!record) return;

  record.photoDataUrl = "";
  record.photoTimestamp = "";
  record.latitude = null;
  record.longitude = null;
  record.accuracy = null;

  await persist();
  renderSelected();
  toast("Fotografía y GPS asociados eliminados.");
}

// -------------------------
// Respaldo y exportación
// -------------------------
function exportRows() {
  return state.records.map((r, index) => {
    const consumption = computeConsumption(r);

    return {
      RUTA: state.routeName,
      LECTOR: r.readerName || state.readerName,
      N: index + 1,
      SECUENCIA: r.sequence,
      CUENTA: r.account,
      MEDIDOR: r.meter,
      CLIENTE: r.customer,
      DIRECCION: r.address,
      LECTURA_ANTERIOR: r.previousReading ?? "",
      LECTURA_ACTUAL: r.currentReading ?? "",
      CONSUMO: consumption ?? "",
      NOVEDAD: r.novelty,
      OBSERVACION: r.observation,
      FECHA_HORA: r.timestamp ? localDateTime(r.timestamp) : "",
      FECHA_HORA_FOTO: r.photoTimestamp ? localDateTime(r.photoTimestamp) : "",
      LATITUD: r.latitude ?? "",
      LONGITUD: r.longitude ?? "",
      PRECISION_GPS_M: r.accuracy ?? "",
      FOTO: r.photoDataUrl ? "SI" : "NO",
    };
  });
}

async function createBackup() {
  await persist();

  const payload = {
    app: "Toma de Lecturas EEQ",
    version: 1,
    exportedAt: nowIso(),
    state,
  };

  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: "application/json;charset=utf-8" }
  );

  downloadBlob(blob, `respaldo_${safeFileName(state.routeName)}_${new Date().toISOString().slice(0,10)}.json`);
}

async function restoreBackup(file) {
  try {
    const text = await file.text();
    const payload = JSON.parse(text);

    if (!payload?.state?.records || !Array.isArray(payload.state.records)) {
      throw new Error("El archivo no parece ser un respaldo válido.");
    }

    state = {
      routeName: payload.state.routeName || "",
      readerName: payload.state.readerName || "",
      records: payload.state.records || [],
      selectedId: payload.state.selectedId || null,
      filter: "all",
      sourceFileName: payload.state.sourceFileName || "",
    };

    await persist();
    renderAll();
    toast(`Respaldo recuperado: ${state.records.length} registros.`);
  } catch (err) {
    toast(err.message || "No se pudo recuperar el respaldo.");
  }
}

function exportXlsx() {
  if (!state.records.length) {
    toast("No hay datos para exportar.");
    return;
  }

  if (!window.XLSX) {
    toast("El módulo Excel no está disponible. Use Exportar CSV.");
    return;
  }

  const rows = exportRows();
  const ws = XLSX.utils.json_to_sheet(rows);

  ws["!cols"] = [
    { wch: 14 }, { wch: 22 }, { wch: 6 }, { wch: 12 }, { wch: 18 },
    { wch: 18 }, { wch: 28 }, { wch: 36 }, { wch: 16 }, { wch: 16 },
    { wch: 14 }, { wch: 22 }, { wch: 40 }, { wch: 22 }, { wch: 15 },
    { wch: 15 }, { wch: 16 }, { wch: 8 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Lecturas");

  const summary = [
    ["RUTA", state.routeName],
    ["LECTOR", state.readerName],
    ["TOTAL", state.records.length],
    ["LEIDOS", state.records.filter(isRead).length],
    ["NOVEDADES", state.records.filter(isNovelty).length],
    ["PENDIENTES", state.records.filter(r => !isRead(r) && !isNovelty(r)).length],
    ["EXPORTADO", localDateTime(nowIso())],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen");

  XLSX.writeFile(wb, `lecturas_${safeFileName(state.routeName)}.xlsx`);
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[;"\r\n,]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function exportCsv() {
  if (!state.records.length) {
    toast("No hay datos para exportar.");
    return;
  }

  const rows = exportRows();
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(csvEscape).join(";"),
    ...rows.map(row => headers.map(h => csvEscape(row[h])).join(";"))
  ];

  const blob = new Blob(
    ["\ufeff" + lines.join("\r\n")],
    { type: "text/csv;charset=utf-8" }
  );

  downloadBlob(blob, `lecturas_${safeFileName(state.routeName)}.csv`);
}

// -------------------------
// Eventos
// -------------------------
els.fileInput.addEventListener("change", async e => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    // La ruta guardada NO se reemplaza al cerrar o recargar la aplicación.
    // Solo cambia cuando el usuario selecciona manualmente un archivo nuevo.
    if (state.records.length) {
      const ok = confirm(
        `Actualmente está cargada la ruta "${state.routeName || state.sourceFileName || "actual"}".\n\n` +
        `¿Desea reemplazarla por el archivo "${file.name}"?\n\n` +
        `Las lecturas de la ruta actual seguirán disponibles únicamente si antes creó un respaldo.`
      );

      if (!ok) {
        e.target.value = "";
        return;
      }
    }

    await importRoute(file);
  } catch (err) {
    console.error(err);
    toast(err.message || "No se pudo cargar el archivo.", 4500);
  } finally {
    e.target.value = "";
  }
});

els.continueBtn.addEventListener("click", async () => {
  const saved = await idbGet("state");

  if (!saved?.records?.length) {
    toast("No existe una ruta guardada en este dispositivo.");
    return;
  }

  state = { ...state, ...saved, filter: "all" };
  renderAll();
  toast(`Ruta guardada recargada: ${state.records.length} registros.`);
});

els.clearRouteBtn.addEventListener("click", async () => {
  if (!state.records.length) {
    await idbDelete("state");
    toast("No hay ruta cargada.");
    return;
  }

  const ok = confirm("Se eliminará la ruta y las lecturas guardadas en este dispositivo. ¿Continuar?");
  if (!ok) return;

  await idbDelete("state");
  state = {
    routeName: "",
    readerName: els.readerName.value.trim(),
    records: [],
    selectedId: null,
    filter: "all",
    sourceFileName: "",
  };
  els.routeName.value = "";
  els.searchInput.value = "";
  renderAll();
  toast("Ruta local eliminada.");
});

els.searchInput.addEventListener("input", renderResults);
els.clearSearchBtn.addEventListener("click", () => {
  els.searchInput.value = "";
  renderResults();
  els.searchInput.focus();
});

document.querySelectorAll(".filter").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.filter = btn.dataset.filter;
    renderResults();
  });
});

els.currentReading.addEventListener("input", updateWarning);
els.saveBtn.addEventListener("click", saveCurrent);
els.prevBtn.addEventListener("click", () => navigateRecord(-1));
els.nextBtn.addEventListener("click", () => navigateRecord(1));
els.gpsBtn.addEventListener("click", captureGps);
els.photoInput.addEventListener("change", e => attachPhoto(e.target.files?.[0]));
els.removePhotoBtn.addEventListener("click", removePhoto);
els.backupBtn.addEventListener("click", createBackup);
els.restoreInput.addEventListener("change", e => {
  const file = e.target.files?.[0];
  if (file) restoreBackup(file);
  e.target.value = "";
});
els.exportXlsxBtn.addEventListener("click", exportXlsx);
els.exportCsvBtn.addEventListener("click", exportCsv);

els.routeName.addEventListener("change", persist);
els.readerName.addEventListener("change", persist);

document.addEventListener("keydown", e => {
  if (e.key === "Enter" && document.activeElement === els.currentReading) {
    e.preventDefault();
    saveCurrent();
  }
});

// -------------------------
// Conexión / PWA
// -------------------------
function updateConnectionBadge() {
  if (navigator.onLine) {
    els.connectionStatus.textContent = "En línea";
    els.connectionStatus.className = "badge";
  } else {
    els.connectionStatus.textContent = "Sin internet";
    els.connectionStatus.className = "badge danger";
  }
}

window.addEventListener("online", updateConnectionBadge);
window.addEventListener("offline", updateConnectionBadge);
updateConnectionBadge();

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  els.installBtn.classList.remove("hidden");
});

els.installBtn.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  els.installBtn.classList.add("hidden");
});

window.addEventListener("appinstalled", () => {
  els.installBtn.classList.add("hidden");
  toast("Aplicación instalada.");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  });
}

// -------------------------
// Inicio
// -------------------------
(async function init() {
  try {
    const saved = await idbGet("state");

    if (saved?.records?.length) {
      // Restauración automática de la última ruta.
      // No es necesario volver a seleccionar el archivo después de cerrar,
      // actualizar la página o reiniciar el teléfono.
      state = {
        ...state,
        ...saved,
        filter: "all",
      };

      els.routeName.value = state.routeName || "";
      els.readerName.value = state.readerName || "";

      renderAll();

      toast(
        `Ruta recuperada automáticamente: ${state.routeName || state.sourceFileName || "ruta guardada"} · ${state.records.length} registros`,
        3800
      );

      return;
    }
  } catch (err) {
    console.error("No se pudo leer IndexedDB:", err);
  }

  renderAll();
})();
