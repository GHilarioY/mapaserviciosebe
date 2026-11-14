/* Mapa de Servicios EBE — lógica de aplicación (v2: capas de relieve, sin capa de aprobados) */
(function () {
  'use strict';

  // ---------- Config: servicio -> color + forma ----------
  var SERVICIO_META = {
    CEBE:   { label: 'CEBE',   full: 'Centro de Educación Básica Especial',                         color: '#2a78d6', dark: '#3987e5', shape: 'circle'   },
    PRITE:  { label: 'PRITE',  full: 'Programa de Intervención Temprana',                            color: '#eb6834', dark: '#d95926', shape: 'square'   },
    CREBE:  { label: 'CREBE',  full: 'Centro de Recursos de Educación Básica Especial',              color: '#1baf7a', dark: '#199e70', shape: 'triangle' },
    PANETS: { label: 'PANETS', full: 'Prog. de Atención no Escolarizada de Tratamiento y Estimulación', color: '#4a3aa7', dark: '#9085e9', shape: 'diamond' }
  };
  var SERVICIO_ORDER = ['CEBE', 'PRITE', 'CREBE', 'PANETS'];

  var GESTION_ORDER = ['Pública de gestión directa', 'Pública de gestión privada', 'Privada'];
  var GESTION_SHORT = {
    'Pública de gestión directa': 'Pública (directa)',
    'Pública de gestión privada': 'Pública (privada)',
    'Privada': 'Privada'
  };

  var AREA_ORDER = ['Urbana', 'Rural'];

  function isDark() {
    var stamp = document.documentElement.getAttribute('data-theme');
    if (stamp === 'dark') return true;
    if (stamp === 'light') return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function normalize(s) {
    return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function escapeHtml(s) {
    return (s || '').toString().replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- Data ----------
  var DATA = LOCALES_DATA.slice();
  var DPTOS = Array.from(new Set(DATA.map(function (d) { return d.dpto; }))).sort();
  var UGELS = Array.from(new Set(DATA.map(function (d) { return d.ugel; }))).sort();
  var TOTAL = DATA.length;

  var markerIndex = {}; // key -> L.Marker
  DATA.forEach(function (d) {
    d._key = d.id + '|' + d.srv;
    d._search = normalize(d.n + ' ' + d.dist + ' ' + d.prov + ' ' + d.dpto + ' ' + d.ugel);
  });
  var byKey = {};
  DATA.forEach(function (d) { byKey[d._key] = d; });

  // ---------- State: every set starts "full" (= no restriction) ----------
  var state = {
    servicio: new Set(SERVICIO_ORDER),
    gestion: new Set(GESTION_ORDER),
    area: new Set(AREA_ORDER),
    dpto: new Set(DPTOS),
    ugel: new Set(UGELS),
    query: ''
  };

  // ---------- Marker icon factory (SVG divIcon, color + shape) ----------
  function markerSvg(meta, dim) {
    var c = dim ? meta.dark : meta.color;
    var s = meta.shape;
    var body = '';
    if (s === 'circle') body = '<circle cx="12" cy="12" r="8.5" />';
    else if (s === 'square') body = '<rect x="4" y="4" width="16" height="16" rx="3" />';
    else if (s === 'triangle') body = '<polygon points="12,3 21,19.5 3,19.5" />';
    else body = '<polygon points="12,2.5 21.5,12 12,21.5 2.5,12" />';
    return '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<g fill="' + c + '" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round">' + body + '</g></svg>';
  }

  function iconFor(srv) {
    var meta = SERVICIO_META[srv];
    return L.divIcon({
      className: 'ebe-marker',
      html: markerSvg(meta, isDark()),
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -10]
    });
  }

  // ---------- Map init ----------
  var map = L.map('map', { zoomControl: false, minZoom: 5, maxZoom: 18, worldCopyJump: false });
  var PERU_BOUNDS = L.latLngBounds([-18.6, -81.6], [-0.0, -68.5]);
  map.fitBounds(PERU_BOUNDS, { padding: [16, 16] });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);

  // ---------- Capas base: relieve, color y satélite ----------
  var ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  var ESRI_ATTR = 'Teselas &copy; <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a> &mdash; Esri, HERE, Garmin, FAO, NOAA, USGS, &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
  var IMG_ATTR = 'Imágenes &copy; <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a> &mdash; Maxar, Earthstar Geographics y la comunidad GIS';
  var OTM_ATTR = 'Datos &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, SRTM &mdash; Estilo &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)';

  function esri(path, opts) {
    return L.tileLayer(ESRI + path + '/MapServer/tile/{z}/{y}/{x}', L.extend({ maxZoom: 19, attribution: ESRI_ATTR }, opts || {}));
  }

  var BASES = {
    topo: { name: 'Topográfico — relieve y color', layer: esri('World_Topo_Map', { maxNativeZoom: 18 }), dark: false },
    sat: { name: 'Satélite con nombres', dark: true, layer: L.layerGroup([
      esri('World_Imagery', { maxNativeZoom: 18, attribution: IMG_ATTR }),
      esri('Reference/World_Transportation', { maxNativeZoom: 18, attribution: '' }),
      esri('Reference/World_Boundaries_and_Places', { maxNativeZoom: 18, attribution: '' })
    ]) },
    otm: { name: 'Curvas de nivel (OpenTopoMap)', dark: false, layer: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      subdomains: 'abc', maxZoom: 19, maxNativeZoom: 17, attribution: OTM_ATTR
    }) },
    street: { name: 'Calles', layer: esri('World_Street_Map'), dark: false },
    dark: { name: 'Oscuro', dark: true, layer: L.layerGroup([
      esri('Canvas/World_Dark_Gray_Base', { maxNativeZoom: 16 }),
      esri('Canvas/World_Dark_Gray_Reference', { maxNativeZoom: 16, attribution: '' })
    ]) }
  };
  var BASE_ORDER = ['topo', 'sat', 'otm', 'street', 'dark'];

  // Sombreado de relieve: se mezcla (multiply) sobre la capa base para acentuar montañas y valles.
  map.createPane('relief');
  map.getPane('relief').style.zIndex = 250;
  map.getPane('relief').style.pointerEvents = 'none';
  var hillshade = esri('Elevation/World_Hillshade', { pane: 'relief', maxNativeZoom: 16, opacity: 0.4, attribution: '' });

  // Interruptor de límites administrativos (la lógica de dibujo está más abajo).
  var limitesToggle = L.layerGroup();

  var currentBase = isDark() ? 'dark' : 'topo';
  BASES[currentBase].layer.addTo(map);
  if (currentBase === 'topo') hillshade.addTo(map);
  limitesToggle.addTo(map);

  var baseControl = {};
  BASE_ORDER.forEach(function (k) { baseControl[BASES[k].name] = BASES[k].layer; });
  L.control.layers(baseControl, {
    'Sombreado de relieve': hillshade,
    'Límites (dpto. / prov. / distrito)': limitesToggle
  }, { position: 'topright', collapsed: true }).addTo(map);

  map.on('baselayerchange', function (e) {
    BASE_ORDER.forEach(function (k) { if (BASES[k].layer === e.layer) currentBase = k; });
    restyleBoundaries();
    document.getElementById('map').classList.toggle('on-dark-base', !!BASES[currentBase].dark);
  });
  document.getElementById('map').classList.toggle('on-dark-base', !!BASES[currentBase].dark);

  // Dedicated panes so admin boundaries always sit under the EBE markers/clusters
  map.createPane('boundaryLines');
  map.getPane('boundaryLines').style.zIndex = 410;
  map.createPane('boundaryLabels');
  map.getPane('boundaryLabels').style.zIndex = 420;
  map.getPane('boundaryLabels').style.pointerEvents = 'none';

  var clusterGroup = L.markerClusterGroup({
    maxClusterRadius: 46,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    iconCreateFunction: function (cluster) {
      var markers = cluster.getAllChildMarkers();
      var counts = {};
      markers.forEach(function (m) {
        var s = m.options.srv;
        counts[s] = (counts[s] || 0) + 1;
      });
      var top = SERVICIO_ORDER.reduce(function (best, s) {
        if (!counts[s]) return best;
        if (!best || counts[s] > counts[best]) return s;
        return best;
      }, null) || 'CEBE';
      var color = isDark() ? SERVICIO_META[top].dark : SERVICIO_META[top].color;
      var n = markers.length;
      var size = n < 10 ? 34 : n < 50 ? 40 : n < 150 ? 48 : 56;
      var mixed = Object.keys(counts).length > 1;
      return L.divIcon({
        html: '<div class="cluster-pin" style="width:' + size + 'px;height:' + size + 'px;background:' + color + ';' +
          (mixed ? 'border-style:dashed;' : '') + '"><span>' + n + '</span></div>',
        className: 'ebe-cluster',
        iconSize: [size, size]
      });
    }
  });
  map.addLayer(clusterGroup);

  function popupHtml(d) {
    var meta = SERVICIO_META[d.srv];
    var lines = [];
    function row(label, value, wide) {
      if (!value) return;
      lines.push('<div class="pf-row' + (wide ? ' pf-row--wide' : '') + '"><span class="pf-k">' + label + '</span><span class="pf-v">' + value + '</span></div>');
    }
    row('Servicio', meta.full, true);
    row('UGEL', escapeHtml(d.ugel));
    row('DRE', escapeHtml(d.dre));
    row('Departamento', escapeHtml(d.dpto));
    row('Provincia', escapeHtml(d.prov));
    row('Distrito', escapeHtml(d.dist));
    row('Dirección', escapeHtml(d.dir) + (d.pob ? ' — ' + escapeHtml(d.pob) : ''), true);
    row('Nivel / modalidad', escapeHtml(d.niv).replace(/ \| /g, '<br>'), true);
    row('Área', escapeHtml(d.area));
    row('Turno', escapeHtml(d.tur));
    row('Código de local', String(d.id));
    return '<div class="popup-card">' +
      '<div class="popup-head"><span class="chip" style="--chip-color:' + meta.color + '">' + meta.label + '</span>' +
      '<span class="popup-gestion">' + (GESTION_SHORT[d.g] || escapeHtml(d.g)) + '</span></div>' +
      '<h3 class="popup-title">' + escapeHtml(d.n) + '</h3>' +
      '<div class="popup-actions">' +
        '<a class="pa-btn pa-btn--primary" target="_blank" rel="noopener" href="https://www.google.com/maps/@?api=1&amp;map_action=pano&amp;viewpoint=' + d.lat + ',' + d.lon + '">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="2.5"/><path d="M9.5 21v-6.5L8 13v-3.5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2V13l-1.5 1.5V21"/></svg>' +
          'Ver en Street View</a>' +
        '<a class="pa-btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&amp;destination=' + d.lat + ',' + d.lon + '">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11 21 3l-8 18-2-8-8-2Z"/></svg>' +
          'Cómo llegar</a>' +
      '</div>' +
      '<div class="pf-list">' + lines.join('') + '</div>' +
      '<div class="pa-note">Abre Google Maps. Algunas zonas rurales no tienen imágenes de Street View.</div></div>';
  }

  // Tamaño de la ventanita según la pantalla: en celular ocupa casi todo el ancho y se desplaza por dentro.
  function popupOptions() {
    var w = window.innerWidth, h = window.innerHeight, small = w < 560;
    return {
      className: 'ebe-popup',
      maxWidth: small ? w - 32 : 340,
      minWidth: small ? Math.min(w - 32, 340) : 290,
      maxHeight: small ? Math.round(h * 0.55) : null,
      autoPanPaddingTopLeft: L.point(16, small ? 70 : 24),
      autoPanPaddingBottomRight: L.point(small ? 16 : 70, small ? 90 : 24)
    };
  }

  DATA.forEach(function (d) {
    var m = L.marker([d.lat, d.lon], { icon: iconFor(d.srv), srv: d.srv });
    m.bindPopup(popupHtml(d), popupOptions());
    markerIndex[d._key] = m;
  });

  // ---------- Filtering ----------
  function matches(d) {
    if (!state.servicio.has(d.srv)) return false;
    if (!state.gestion.has(d.g)) return false;
    if (!state.area.has(d.area)) return false;
    if (!state.dpto.has(d.dpto)) return false;
    if (!state.ugel.has(d.ugel)) return false;
    if (state.query && d._search.indexOf(state.query) === -1) return false;
    return true;
  }

  var countEl = document.getElementById('resultCount');
  var toggleCountEl = document.getElementById('toggleCount');

  function applyFilters() {
    var visible = [];
    DATA.forEach(function (d) { if (matches(d)) visible.push(markerIndex[d._key]); });
    clusterGroup.clearLayers();
    clusterGroup.addLayers(visible);
    countEl.textContent = visible.length === TOTAL
      ? ('Mostrando los ' + TOTAL + ' locales')
      : ('Mostrando ' + visible.length + ' de ' + TOTAL + ' locales');
    if (toggleCountEl) toggleCountEl.textContent = visible.length;
    updateServicioCounts();

  }

  function updateServicioCounts() {
    var counts = { CEBE: 0, PRITE: 0, CREBE: 0, PANETS: 0 };
    DATA.forEach(function (d) {
      var ok = state.gestion.has(d.g) && state.area.has(d.area) && state.dpto.has(d.dpto) && state.ugel.has(d.ugel) &&
        (!state.query || d._search.indexOf(state.query) !== -1);
      if (ok) counts[d.srv]++;
    });
    SERVICIO_ORDER.forEach(function (s) {
      var el = document.querySelector('.servicio-count[data-srv="' + s + '"]');
      if (el) el.textContent = counts[s];
    });
  }

  // ---------- UI: Servicio filter ----------
  function buildServicioFilter() {
    var wrap = document.getElementById('servicioFilter');
    SERVICIO_ORDER.forEach(function (s) {
      var meta = SERVICIO_META[s];
      var row = document.createElement('label');
      row.className = 'filter-row';
      row.innerHTML =
        '<input type="checkbox" checked />' +
        '<span class="swatch shape-' + meta.shape + '" style="--sw-color:' + meta.color + '"></span>' +
        '<span class="filter-label">' + meta.label + '<small>' + meta.full + '</small></span>' +
        '<span class="servicio-count" data-srv="' + s + '">0</span>';
      wrap.appendChild(row);
      row.querySelector('input').addEventListener('change', function (e) {
        if (e.target.checked) state.servicio.add(s); else state.servicio.delete(s);
        applyFilters();
      });
    });
  }

  // ---------- UI: Gestión filter ----------
  function buildGestionFilter() {
    var wrap = document.getElementById('gestionFilter');
    GESTION_ORDER.forEach(function (g) {
      var row = document.createElement('label');
      row.className = 'filter-row filter-row--simple';
      row.innerHTML = '<input type="checkbox" checked /><span class="filter-label">' + GESTION_SHORT[g] + '</span>';
      wrap.appendChild(row);
      row.querySelector('input').addEventListener('change', function (e) {
        if (e.target.checked) state.gestion.add(g); else state.gestion.delete(g);
        applyFilters();
      });
    });
  }

  // ---------- UI: Área (urbano / rural) filter ----------
  function buildAreaFilter() {
    var wrap = document.getElementById('areaFilter');
    AREA_ORDER.forEach(function (a) {
      var row = document.createElement('label');
      row.className = 'filter-row filter-row--simple';
      row.innerHTML = '<input type="checkbox" checked /><span class="filter-label">' + a + '</span>';
      wrap.appendChild(row);
      row.querySelector('input').addEventListener('change', function (e) {
        if (e.target.checked) state.area.add(a); else state.area.delete(a);
        applyFilters();
      });
    });
  }

  // ---------- UI: generic searchable multi-select (Departamento / UGEL) ----------
  var multiSelects = [];

  function buildMultiSelect(opts) {
    var root = document.getElementById(opts.rootId);
    var searchInput = root.querySelector('.ms-search');
    var listEl = root.querySelector('.ms-list');
    var summaryEl = root.querySelector('.ms-summary');
    var stateSet = opts.stateSet;

    function renderList(filterText) {
      listEl.innerHTML = '';
      var q = normalize(filterText || '');
      var frag = document.createDocumentFragment();
      var shown = 0;
      opts.options.forEach(function (val) {
        if (q && normalize(val).indexOf(q) === -1) return;
        shown++;
        var row = document.createElement('label');
        row.className = 'filter-row filter-row--simple';
        row.innerHTML = '<input type="checkbox" ' + (stateSet.has(val) ? 'checked' : '') + ' />' +
          '<span class="filter-label">' + escapeHtml(val) + '</span>';
        row.querySelector('input').addEventListener('change', function (e) {
          if (e.target.checked) stateSet.add(val); else stateSet.delete(val);
          updateSummary();
          applyFilters();
        });
        frag.appendChild(row);
      });
      if (!shown) {
        var empty = document.createElement('div');
        empty.className = 'ms-empty';
        empty.textContent = 'Sin resultados';
        frag.appendChild(empty);
      }
      listEl.appendChild(frag);
    }

    function updateSummary() {
      summaryEl.textContent = stateSet.size === opts.options.length
        ? ('Todas (' + opts.options.length + ')')
        : stateSet.size === 0
          ? 'Ninguna seleccionada'
          : (stateSet.size + ' de ' + opts.options.length + ' seleccionadas');
    }

    searchInput.addEventListener('input', function (e) { renderList(e.target.value); });
    root.querySelector('.ms-all').addEventListener('click', function () {
      opts.options.forEach(function (v) { stateSet.add(v); });
      renderList(searchInput.value); updateSummary(); applyFilters();
    });
    root.querySelector('.ms-none').addEventListener('click', function () {
      stateSet.clear();
      renderList(searchInput.value); updateSummary(); applyFilters();
    });

    var api = {
      reset: function () {
        stateSet.clear();
        opts.options.forEach(function (v) { stateSet.add(v); });
        searchInput.value = '';
        renderList('');
        updateSummary();
      }
    };
    multiSelects.push(api);
    renderList('');
    updateSummary();
  }

  // ---------- Search-as-you-type for IIEE name ----------
  var mainSearch = document.getElementById('mainSearch');
  var suggestBox = document.getElementById('suggestions');

  function renderSuggestions(term) {
    var q = normalize(term);
    if (!q) { suggestBox.hidden = true; suggestBox.innerHTML = ''; return; }
    var list = DATA.filter(function (d) { return d._search.indexOf(q) !== -1; }).slice(0, 8);
    if (!list.length) {
      suggestBox.innerHTML = '<div class="suggest-empty">Sin coincidencias</div>';
      suggestBox.hidden = false;
      return;
    }
    suggestBox.innerHTML = list.map(function (d) {
      var meta = SERVICIO_META[d.srv];
      return '<button type="button" class="suggest-item" data-key="' + d._key + '">' +
        '<span class="swatch shape-' + meta.shape + '" style="--sw-color:' + meta.color + '"></span>' +
        '<span class="suggest-text"><strong>' + escapeHtml(d.n) + '</strong><small>' + escapeHtml(d.dist) + ', ' + escapeHtml(d.dpto) + ' · ' + escapeHtml(d.ugel) + '</small></span>' +
        '</button>';
    }).join('');
    suggestBox.hidden = false;
  }

  mainSearch.addEventListener('input', function (e) {
    state.query = normalize(e.target.value);
    renderSuggestions(e.target.value);
    applyFilters();
  });
  mainSearch.addEventListener('focus', function (e) { if (e.target.value) renderSuggestions(e.target.value); });
  document.addEventListener('click', function (e) {
    if (!suggestBox.contains(e.target) && e.target !== mainSearch) suggestBox.hidden = true;
  });

  suggestBox.addEventListener('click', function (e) {
    var btn = e.target.closest('.suggest-item');
    if (!btn) return;
    var d = byKey[btn.getAttribute('data-key')];
    if (!d) return;
    suggestBox.hidden = true;
    mainSearch.value = d.n;
    state.query = '';
    mainSearch.blur();
    applyFilters();
    goToLocal(d);
  });

  function goToLocal(d) {
    var m = markerIndex[d._key];
    if (!m) return;
    var wasHidden = !clusterGroup.hasLayer(m);
    if (wasHidden) clusterGroup.addLayer(m);
    clusterGroup.zoomToShowLayer(m, function () { m.openPopup(); });
    closeMobilePanel();
  }

  // ---------- Clear all filters ----------
  document.getElementById('clearFilters').addEventListener('click', function () {
    state.servicio = new Set(SERVICIO_ORDER);
    state.gestion = new Set(GESTION_ORDER);
    state.area = new Set(AREA_ORDER);
    mainSearch.value = '';
    state.query = '';
    document.querySelectorAll('#servicioFilter input, #gestionFilter input, #areaFilter input').forEach(function (i) { i.checked = true; });
    multiSelects.forEach(function (ms) { ms.reset(); });
    applyFilters();
  });

  // ---------- Mobile panel toggle ----------
  var panel = document.getElementById('panel');
  var toggleBtn = document.getElementById('panelToggle');
  var closeBtn = document.getElementById('panelClose');
  var scrim = document.getElementById('scrim');
  function openMobilePanel() { panel.classList.add('open'); scrim.hidden = false; toggleBtn.hidden = true; }
  function closeMobilePanel() { panel.classList.remove('open'); scrim.hidden = true; toggleBtn.hidden = false; }
  toggleBtn.addEventListener('click', function () {
    panel.classList.contains('open') ? closeMobilePanel() : openMobilePanel();
  });
  scrim.addEventListener('click', closeMobilePanel);
  if (closeBtn) closeBtn.addEventListener('click', closeMobilePanel);

  // ---------- Administrative boundaries: revealed progressively by zoom ----------
  // departamento (national view) -> provincia (regional) -> distrito (local), like Google Maps.
  var BOUND_LEVELS = [
    { key: 'departamento', data: B_DEPARTAMENTO, min: 0, max: 7, maxZoom: 20, weight: 1.5, dash: null, labelClass: 'lbl-dep', always: true },
    { key: 'provincia', data: B_PROVINCIA, min: 8, max: 9, maxZoom: 20, weight: 1.1, dash: '5,4', labelClass: 'lbl-prov', always: false },
    { key: 'distrito', data: B_DISTRITO, min: 10, max: 20, maxZoom: 20, weight: 0.8, dash: '2,3', labelClass: 'lbl-dist', always: false }
  ];
  var boundaryState = {};
  BOUND_LEVELS.forEach(function (lvl) {
    boundaryState[lvl.key] = { geo: null, lineLayer: null, labelLayer: L.layerGroup([], { pane: 'boundaryLabels' }), loading: false };
  });

  function boundaryColor() {
    if (currentBase === 'sat') return 'rgba(255,255,255,0.8)';
    return (isDark() || currentBase === 'dark') ? 'rgba(195,194,183,0.55)' : 'rgba(60,59,56,0.6)';
  }

  function loadLevel(lvl, cb) {
    var st = boundaryState[lvl.key];
    if (st.geo) { cb(); return; }
    // Boundary data ships inline with the page (b_departamento.js / b_provincia.js / b_distrito.js),
    // so this is synchronous — no network fetch, which also means it works when the file is opened
    // directly from disk (file://), not just when served over http(s).
    st.geo = lvl.data;
    st.lineLayer = L.geoJSON(st.geo, {
      pane: 'boundaryLines',
      renderer: L.canvas({ padding: 0.4 }),
      interactive: false,
      style: function () { return { color: boundaryColor(), weight: lvl.weight, dashArray: lvl.dash, fill: false }; }
    });
    cb();
  }

  function bbOverlaps(bb, mb) {
    return !(bb[2] < mb.getWest() || bb[0] > mb.getEast() || bb[3] < mb.getSouth() || bb[1] > mb.getNorth());
  }

  function renderLabels(lvl) {
    var st = boundaryState[lvl.key];
    st.labelLayer.clearLayers();
    if (!st.geo) return;
    var mb = map.getBounds();
    st.geo.features.forEach(function (f) {
      if (!lvl.always && !bbOverlaps(f.properties.bb, mb)) return;
      var p = f.properties.lbl;
      st.labelLayer.addLayer(L.marker([p[0], p[1]], {
        pane: 'boundaryLabels', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'boundary-label ' + lvl.labelClass, html: escapeHtml(f.properties.n) })
      }));
    });
  }

  var activeLevelKey = null;
  function hideAllBoundaries() {
    BOUND_LEVELS.forEach(function (l) {
      var st = boundaryState[l.key];
      if (st.lineLayer && map.hasLayer(st.lineLayer)) map.removeLayer(st.lineLayer);
      if (map.hasLayer(st.labelLayer)) map.removeLayer(st.labelLayer);
    });
    activeLevelKey = null;
  }

  function updateBoundaries() {
    if (!map.hasLayer(limitesToggle)) { hideAllBoundaries(); return; }
    var z = map.getZoom();
    var lvl = BOUND_LEVELS.reduce(function (found, l) { return (z >= l.min && z <= l.max) ? l : found; }, BOUND_LEVELS[0]);
    if (lvl.key === activeLevelKey) {
      if (!lvl.always) renderLabels(lvl);
      return;
    }
    BOUND_LEVELS.forEach(function (l) {
      var st = boundaryState[l.key];
      if (st.lineLayer && map.hasLayer(st.lineLayer)) map.removeLayer(st.lineLayer);
      if (map.hasLayer(st.labelLayer)) map.removeLayer(st.labelLayer);
    });
    activeLevelKey = lvl.key;
    loadLevel(lvl, function () {
      if (activeLevelKey !== lvl.key) return;
      var st = boundaryState[lvl.key];
      st.lineLayer.addTo(map);
      renderLabels(lvl);
      st.labelLayer.addTo(map);
    });
  }

  function restyleBoundaries() {
    BOUND_LEVELS.forEach(function (l) {
      var st = boundaryState[l.key];
      if (st.lineLayer) st.lineLayer.setStyle({ color: boundaryColor() });
    });
  }

  map.on('zoomend', updateBoundaries);
  map.on('overlayadd overlayremove', function (e) { if (e.layer === limitesToggle) updateBoundaries(); });
  map.on('moveend', function () {
    var lvl = BOUND_LEVELS.filter(function (l) { return l.key === activeLevelKey; })[0];
    if (lvl && !lvl.always) renderLabels(lvl);
  });
  updateBoundaries();

  // ---------- Theme change: redraw marker icons, swap basemap, restyle boundaries ----------
  function refreshIcons() {
    DATA.forEach(function (d) { markerIndex[d._key].setIcon(iconFor(d.srv)); });
    if (clusterGroup.refreshClusters) clusterGroup.refreshClusters(); else applyFilters();
    // Solo cambia la capa base si el usuario sigue en la de su tema (topográfica u oscura).
    var want = isDark() ? 'dark' : 'topo';
    if ((currentBase === 'topo' || currentBase === 'dark') && currentBase !== want) {
      map.removeLayer(BASES[currentBase].layer);
      BASES[want].layer.addTo(map);
      map.fire('baselayerchange', { layer: BASES[want].layer, name: BASES[want].name });
    }
    restyleBoundaries();
  }
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refreshIcons);
  }

  // ---------- Collapsible sections ----------
  document.querySelectorAll('.section-head').forEach(function (h) {
    h.addEventListener('click', function () { h.parentElement.classList.toggle('collapsed'); });
  });

  // ---------- Init ----------
  buildServicioFilter();
  buildGestionFilter();
  buildAreaFilter();
  buildMultiSelect({ rootId: 'dptoFilter', options: DPTOS, stateSet: state.dpto });
  buildMultiSelect({ rootId: 'ugelFilter', options: UGELS, stateSet: state.ugel });
  applyFilters();
})();
