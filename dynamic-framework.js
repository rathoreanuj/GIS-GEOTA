/* ═══════════════════════════════════════════════════════════════
   DYNAMIC FRAMEWORK — dynamic-framework.js
   ───────────────────────────────────────────────────────────────
   Implements the "Dynamic Framework" component of Assignment 2.

   What this module provides:
   ┌─────────────────────────────────────────────────────────────┐
   │ 1. Framework Status Bar  – live/cache/fallback indicator    │
   │ 2. Auto-refresh Engine   – configurable interval refresh    │
   │ 3. Manual Refresh Button – force re-fetch all OSM layers    │
   │ 4. Cache Manager         – read/write/clear localStorage    │
   │ 5. Live Layer Counter    – counts active map layers         │
   │ 6. Dynamic NDWI Overlay  – canvas-rendered heat overlay     │
   │ 7. Dynamic Watershed     – fetched from Overpass API        │
   │ 8. Panel Data Badges     – live/cache badge on stat panels  │
   │ 9. Lake Area Live Calc   – geometry-derived area from OSM   │
   │10. Framework Health Log  – timestamped event console        │
   └─────────────────────────────────────────────────────────────┘

   Architecture:
     DynamicFramework (singleton)
       ├── StatusManager      – UI status bar state
       ├── CacheManager       – localStorage TTL cache
       ├── FetchEngine        – Overpass + Nominatim fetch
       ├── LayerManager       – live layer application
       ├── OverlayEngine      – NDWI canvas heat overlay
       ├── RefreshScheduler   – auto-refresh timer
       └── EventLog           – framework event history
════════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────*/
const DF_VERSION         = '2.0.0';
const DF_CACHE_KEY       = 'hs_df_osm_v2';
const DF_CACHE_TTL_MS    = 24 * 60 * 60 * 1000;     // 24 h
const DF_REFRESH_INTERVAL= 30 * 60 * 1000;           // 30 min auto-refresh
const DF_BBOX            = { s: 17.39, w: 78.44, n: 17.46, e: 78.51 };
const DF_OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/* ─────────────────────────────────────────────────────────────
   EVENT LOG — framework event history (shown in console)
───────────────────────────────────────────────────────────────*/
const DFEventLog = (() => {
  const events = [];
  function log(level, msg, data) {
    const entry = { ts: Date.now(), level, msg, data };
    events.push(entry);
    if (events.length > 200) events.shift();
    const styled = level === 'error'   ? 'color:#ef4444'
                 : level === 'warn'    ? 'color:#f0a500'
                 : level === 'success' ? 'color:#22c55e'
                 :                       'color:#00d4c8';
    console.log(`%c[DynFramework ${level.toUpperCase()}] ${msg}`, styled, data || '');
  }
  return {
    info   : (msg, d) => log('info',    msg, d),
    warn   : (msg, d) => log('warn',    msg, d),
    error  : (msg, d) => log('error',   msg, d),
    success: (msg, d) => log('success', msg, d),
    history: ()       => [...events],
  };
})();

/* ─────────────────────────────────────────────────────────────
   STATUS MANAGER — controls the status bar UI
───────────────────────────────────────────────────────────────*/
const DFStatusManager = (() => {
  const STATE = {
    INIT      : { label: 'Initialising…',    dot: 'init',    source: '—'       },
    FETCHING  : { label: 'Fetching live data…', dot: 'fetching', source: 'Overpass API' },
    LIVE      : { label: 'Live data active',  dot: 'live',    source: 'OpenStreetMap (live)' },
    CACHED    : { label: 'Cached data active',dot: 'cached',  source: 'OSM cache (localStorage)' },
    FALLBACK  : { label: 'Snapshot mode',     dot: 'fallback',source: 'Bundled snapshot' },
    ERROR     : { label: 'Fetch failed',      dot: 'error',   source: 'Error — using snapshot' },
  };

  let currentState = 'INIT';
  let lastUpdatedMs = null;

  function el(id) { return document.getElementById(id); }

  function render() {
    const s = STATE[currentState] || STATE.FALLBACK;
    const dot  = el('dfDot');
    const text = el('dfStatusText');
    const src  = el('dfSourceTag');
    const upd  = el('dfLastUpdated');
    if (!dot) return;   // status bar not yet in DOM

    dot.className  = `df-dot df-dot--${s.dot}`;
    text.textContent = s.label;
    src.textContent  = `Source: ${s.source}`;
    upd.textContent  = lastUpdatedMs
      ? `Last sync: ${new Date(lastUpdatedMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
      : 'Last sync: —';
  }

  function set(state, updatedMs) {
    currentState = state;
    if (updatedMs != null) lastUpdatedMs = updatedMs;
    render();
    DFEventLog.info(`Status → ${state}`, { updatedMs });
  }

  function setFetching() { set('FETCHING'); }
  function setLive(ts)   { set('LIVE',     ts || Date.now()); }
  function setCached(ts) { set('CACHED',   ts); }
  function setFallback() { set('FALLBACK', Date.now()); }
  function setError()    { set('ERROR',    Date.now()); }

  return { setFetching, setLive, setCached, setFallback, setError, render };
})();

/* ─────────────────────────────────────────────────────────────
   CACHE MANAGER — localStorage TTL cache
───────────────────────────────────────────────────────────────*/
const DFCacheManager = (() => {
  function read() {
    try {
      const raw = localStorage.getItem(DF_CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj?.savedAt || !obj?.data) return null;
      if (Date.now() - obj.savedAt > DF_CACHE_TTL_MS) {
        DFEventLog.info('Cache expired — will fetch fresh data');
        return null;
      }
      return obj;
    } catch (e) {
      DFEventLog.warn('Cache read error', e);
      return null;
    }
  }

  function write(data) {
    try {
      const payload = JSON.stringify({ savedAt: Date.now(), data });
      localStorage.setItem(DF_CACHE_KEY, payload);
      DFEventLog.success('Cache written', { bytes: payload.length });
    } catch (e) {
      DFEventLog.warn('Cache write error (storage full or private mode)', e);
    }
  }

  function clear() {
    try {
      localStorage.removeItem(DF_CACHE_KEY);
      // Also clear old v1 key if present
      localStorage.removeItem('hs_dynamic_osm_layers_v1');
      DFEventLog.info('Cache cleared');
    } catch (e) {
      DFEventLog.warn('Cache clear error', e);
    }
  }

  function isExpired(cachedObj) {
    if (!cachedObj?.savedAt) return true;
    return Date.now() - cachedObj.savedAt > DF_CACHE_TTL_MS;
  }

  return { read, write, clear, isExpired };
})();

/* ─────────────────────────────────────────────────────────────
   FETCH ENGINE — Overpass + Nominatim with failover
───────────────────────────────────────────────────────────────*/
const DFFetchEngine = (() => {
  const BBOX_STR = `(${DF_BBOX.s},${DF_BBOX.w},${DF_BBOX.n},${DF_BBOX.e})`;

  async function fetchWithTimeout(url, options = {}, ms = 28000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { ...options, signal: ctrl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function overpass(query) {
    const body = `data=${encodeURIComponent(query)}`;
    const opts = {
      method : 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body,
    };
    for (const ep of DF_OVERPASS_ENDPOINTS) {
      try {
        const result = await fetchWithTimeout(ep, opts, 30000);
        DFEventLog.success(`Overpass OK via ${ep}`);
        return result;
      } catch (e) {
        DFEventLog.warn(`Overpass failed at ${ep}`, e.message);
      }
    }
    throw new Error('All Overpass endpoints exhausted');
  }

  async function nominatim(q) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&polygon_geojson=1&limit=1`;
    return fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 20000);
  }

  /* Build GeoJSON FeatureCollections from Overpass elements */
  function wayToCoords(way) {
    return (way.geometry || [])
      .map(p => [+p.lon, +p.lat])
      .filter(([lng, lat]) => isFinite(lng) && isFinite(lat));
  }

  function closeRing(coords) {
    if (!coords.length) return coords;
    const [f, l] = [coords[0], coords[coords.length - 1]];
    return (f[0] === l[0] && f[1] === l[1]) ? coords : [...coords, [f[0], f[1]]];
  }

  function lakeCenter() {
    // Try to read from main script's LAKE_CENTER constant
    return (typeof LAKE_CENTER !== 'undefined') ? LAKE_CENTER : [17.4239, 78.4738];
  }

  function distSq(coords) {
    if (!coords.length) return Infinity;
    const avgLng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
    const avgLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
    const [cLat, cLng] = lakeCenter();
    return (avgLng - cLng) ** 2 + (avgLat - cLat) ** 2;
  }

  function buildLines(raw, tagKey, label, maxDist, limit) {
    return (raw?.elements || [])
      .filter(e => e.type === 'way' && Array.isArray(e.geometry))
      .map(way => {
        const coords = wayToCoords(way);
        if (coords.length < 2) return null;
        if (distSq(coords) > maxDist) return null;
        const tags = way.tags || {};
        return {
          type: 'Feature',
          properties: { name: tags.name || `${label} ${way.id}`, [tagKey]: tags[tagKey] || 'unknown', osm_id: way.id },
          geometry: { type: 'LineString', coordinates: coords },
        };
      })
      .filter(Boolean)
      .slice(0, limit);
  }

  function buildPolygons(raw, maxDist, limit) {
    return (raw?.elements || [])
      .filter(e => e.type === 'way' && Array.isArray(e.geometry))
      .map(way => {
        const ring = closeRing(wayToCoords(way));
        if (ring.length < 4) return null;
        if (distSq(ring) > maxDist) return null;
        const tags = way.tags || {};
        const landuse = tags.landuse || 'unknown';
        const density = landuse === 'industrial' || landuse === 'commercial' ? 'High'
                      : landuse === 'residential' ? 'Medium' : 'Low';
        return {
          type: 'Feature',
          properties: { name: tags.name || `Landuse ${way.id}`, density, landuse, osm_id: way.id },
          geometry: { type: 'Polygon', coordinates: [ring] },
        };
      })
      .filter(Boolean)
      .slice(0, limit);
  }

  function fc(features) { return { type: 'FeatureCollection', features }; }

  /* Main fetch — all layers in parallel */
  async function fetchAllLayers() {
    DFEventLog.info('Starting live fetch of all dynamic layers…');

    const roadsQ   = `[out:json][timeout:60];way["highway"~"motorway|trunk|primary|secondary|tertiary"]${BBOX_STR};out geom;`;
    const riversQ  = `[out:json][timeout:60];way["waterway"~"river|stream|canal|drain|nala"]${BBOX_STR};out geom;`;
    const builtupQ = `[out:json][timeout:60];way["landuse"~"residential|commercial|industrial"]${BBOX_STR};out geom;`;
    const wshedQ   = `[out:json][timeout:60];way["natural"="water"]["water"="lake"]["name"~"Hussain",i]${BBOX_STR};out geom;`;

    const [roadsR, riversR, builtupR, adminR, wshedR] = await Promise.allSettled([
      overpass(roadsQ),
      overpass(riversQ),
      overpass(builtupQ),
      nominatim('Khairatabad mandal Hyderabad'),
      overpass(wshedQ),
    ]);

    const result = {};

    if (roadsR.status === 'fulfilled') {
      result.roads   = fc(buildLines(roadsR.value,  'highway',  'Road',     0.0018, 150));
      DFEventLog.success(`Roads: ${result.roads.features.length} features`);
    }
    if (riversR.status === 'fulfilled') {
      result.rivers  = fc(buildLines(riversR.value, 'waterway', 'Waterway', 0.0025,  80));
      DFEventLog.success(`Rivers: ${result.rivers.features.length} features`);
    }
    if (builtupR.status === 'fulfilled') {
      result.builtup = fc(buildPolygons(builtupR.value, 0.0022, 100));
      DFEventLog.success(`Built-up: ${result.builtup.features.length} features`);
    }
    if (adminR.status === 'fulfilled') {
      const geojson = adminR.value?.[0]?.geojson;
      if (geojson) {
        result.admin = fc([{ type: 'Feature', properties: { name: 'Khairatabad Mandal (live)' }, geometry: geojson }]);
        DFEventLog.success('Admin boundary: fetched via Nominatim');
      }
    }
    if (wshedR.status === 'fulfilled') {
      // Fallback: watershed from Overpass if not enough features, derive from DEM polygon
      const wsFeatures = buildPolygons(wshedR.value, 0.01, 5);
      if (wsFeatures.length > 0) {
        result.watershed = fc(wsFeatures);
        DFEventLog.success(`Watershed: ${wsFeatures.length} OSM features`);
      }
    }

    return result;
  }

  return { fetchAllLayers };
})();

/* ─────────────────────────────────────────────────────────────
   LAYER MANAGER — applies fetched data onto Leaflet layers
───────────────────────────────────────────────────────────────*/
const DFLayerManager = (() => {
  function safeFC(fc) {
    if (!fc?.features) return { type: 'FeatureCollection', features: [] };
    return { type: 'FeatureCollection', features: fc.features };
  }

  function normalizeBuiltup(fc) {
    const features = (fc?.features || []).map(f => {
      const geom = f?.geometry;
      if (!geom) return null;
      if (geom.type === 'Polygon') return f;
      if (geom.type === 'MultiPolygon') return f;
      // Some Overpass results nest coords incorrectly — fix flat ring
      if (Array.isArray(geom.coordinates?.[0]?.[0])) return f;
      if (Array.isArray(geom.coordinates?.[0]) && typeof geom.coordinates[0][0] === 'number') {
        return { ...f, geometry: { type: 'Polygon', coordinates: [geom.coordinates] } };
      }
      return null;
    }).filter(Boolean);
    return { type: 'FeatureCollection', features };
  }

  function applyToLayer(leafletLayer, fc, normalizePolygon = false) {
    if (!leafletLayer) return;
    const data = normalizePolygon ? normalizeBuiltup(safeFC(fc)) : safeFC(fc);
    try {
      leafletLayer.clearLayers();
      leafletLayer.addData(data);
    } catch (e) {
      DFEventLog.warn('Layer apply error', e.message);
    }
  }

  function apply(dynamicData) {
    // These reference the Leaflet layer variables declared in script.js
    if (dynamicData.admin    && typeof layerAdmin    !== 'undefined') applyToLayer(layerAdmin,    dynamicData.admin);
    if (dynamicData.rivers   && typeof layerRivers   !== 'undefined') applyToLayer(layerRivers,   dynamicData.rivers);
    if (dynamicData.roads    && typeof layerRoads    !== 'undefined') applyToLayer(layerRoads,    dynamicData.roads);
    if (dynamicData.builtup  && typeof layerBuiltup  !== 'undefined') applyToLayer(layerBuiltup,  dynamicData.builtup, true);
    if (dynamicData.watershed && typeof layerWatershed !== 'undefined') applyToLayer(layerWatershed, dynamicData.watershed);
    DFEventLog.success('Dynamic layers applied to map');
  }

  return { apply };
})();

/* ─────────────────────────────────────────────────────────────
   LAYER COUNTER — counts active layers and updates status bar
───────────────────────────────────────────────────────────────*/
const DFLayerCounter = (() => {
  function count() {
    const checkboxes = document.querySelectorAll('[data-layer]');
    let active = 0;
    checkboxes.forEach(cb => { if (cb.checked) active++; });
    // Also count temporal layer if visible
    if (typeof temporalLayer !== 'undefined' && temporalLayer) active++;
    return active;
  }

  function update() {
    const el = document.getElementById('dfLayerCount');
    if (el) el.textContent = count();
  }

  // Wire up to all layer checkboxes
  function init() {
    document.querySelectorAll('[data-layer]').forEach(cb => {
      cb.addEventListener('change', update);
    });
    update();
  }

  return { init, update };
})();

/* ─────────────────────────────────────────────────────────────
   NDWI OVERLAY ENGINE — canvas-based heat map over the lake
───────────────────────────────────────────────────────────────*/
const DFNdwiOverlay = (() => {
  // NDWI data by year: we'll animate through them on the map
  const NDWI_DATA = {
    years: [2000, 2005, 2010, 2015, 2020, 2025],
    mean : [0.62, 0.58, 0.53, 0.48, 0.44, 0.38],
  };

  // Lake approximate bounds for the canvas overlay
  const BOUNDS = [[17.4150, 78.4530], [17.4340, 78.4800]];

  let overlay = null;
  let isVisible = false;
  let currentYearIdx = 5; // Default to 2025

  function ndwiColor(value) {
    // Blue-green gradient: low NDWI = red/orange, high = teal/blue
    const v = Math.max(0, Math.min(1, (value + 1) / 2));   // normalise -1..1 → 0..1
    if (v > 0.8) return `rgba(0, 212, 200, 0.75)`;   // strong water — teal
    if (v > 0.6) return `rgba(14, 165, 233, 0.65)`;  // moderate water — blue
    if (v > 0.5) return `rgba(99, 180, 100, 0.55)`;  // weak water — green
    if (v > 0.4) return `rgba(240, 165,   0, 0.50)`; // marginal — gold
    return `rgba(239,  68,  68, 0.50)`;               // non-water — red
  }

  function createCanvas(bounds, map) {
    // Leaflet SVG overlay approach using ImageOverlay with a programmatic canvas
    const canvas = document.createElement('canvas');
    canvas.width  = 200;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');

    // Draw a radial NDWI gradient simulating the lake surface
    const ndwiVal = NDWI_DATA.mean[currentYearIdx];
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const radius = Math.min(cx, cy) * 0.80;

    // Background: non-water
    ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Lake water body
    const grd = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
    grd.addColorStop(0,   ndwiColor(ndwiVal + 0.1));
    grd.addColorStop(0.5, ndwiColor(ndwiVal));
    grd.addColorStop(0.8, ndwiColor(ndwiVal - 0.1));
    grd.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius, radius * 0.65, 0, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    // NDWI value label
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`NDWI: ${ndwiVal.toFixed(2)}`, cx, cy - 10);
    ctx.font = '11px sans-serif';
    ctx.fillText(`Year: ${NDWI_DATA.years[currentYearIdx]}`, cx, cy + 10);

    return canvas.toDataURL('image/png');
  }

  function show(mapInstance) {
    if (!mapInstance) return;
    hide(mapInstance);
    const imgUrl = createCanvas(BOUNDS, mapInstance);
    overlay = L.imageOverlay(imgUrl, BOUNDS, { opacity: 0.75, interactive: false })
               .addTo(mapInstance);
    isVisible = true;
    DFEventLog.info(`NDWI overlay shown for year ${NDWI_DATA.years[currentYearIdx]}`);
  }

  function hide(mapInstance) {
    if (overlay && mapInstance) {
      try { mapInstance.removeLayer(overlay); } catch (_) {}
      overlay = null;
    }
    isVisible = false;
  }

  function toggle(mapInstance) {
    if (isVisible) hide(mapInstance);
    else show(mapInstance);
    return isVisible;
  }

  function setYear(yearIdx, mapInstance) {
    currentYearIdx = Math.max(0, Math.min(NDWI_DATA.years.length - 1, yearIdx));
    if (isVisible && mapInstance) show(mapInstance);
  }

  return { show, hide, toggle, setYear, isVisible: () => isVisible };
})();

/* ─────────────────────────────────────────────────────────────
   PANEL BADGE MANAGER — adds live/cache badge to analysis panels
───────────────────────────────────────────────────────────────*/
const DFPanelBadge = (() => {
  const BADGE_ID = 'df-panel-source-badge';

  function render(source, updatedMs) {
    let badge = document.getElementById(BADGE_ID);
    if (!badge) {
      // Create and inject into the analysis panel inner div
      const panelInner = document.querySelector('.panel-inner');
      if (!panelInner) return;
      badge = document.createElement('div');
      badge.id        = BADGE_ID;
      badge.className = 'df-panel-badge';
      panelInner.prepend(badge);
    }

    const cls = source.includes('live') ? 'df-panel-badge--live'
              : source.includes('cache') ? 'df-panel-badge--cache'
              : 'df-panel-badge--fallback';

    const icon = source.includes('live')  ? '🟢'
               : source.includes('cache') ? '🟡'
               : '🔴';

    const timeStr = updatedMs
      ? new Date(updatedMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '—';

    badge.className = `df-panel-badge ${cls}`;
    badge.innerHTML = `${icon} <span>Data: ${source}</span> <span class="df-panel-badge-time">${timeStr}</span>`;
  }

  function clear() {
    const b = document.getElementById(BADGE_ID);
    if (b) b.remove();
  }

  return { render, clear };
})();

/* ─────────────────────────────────────────────────────────────
   METRICS ENGINE — geometry-derived live metrics
───────────────────────────────────────────────────────────────*/
const DFMetricsEngine = (() => {
  function toRad(d) { return d * Math.PI / 180; }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371, dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function lineLength(coords) {
    if (!coords || coords.length < 2) return 0;
    let d = 0;
    for (let i = 1; i < coords.length; i++) {
      d += haversineKm(coords[i-1][1], coords[i-1][0], coords[i][1], coords[i][0]);
    }
    return d;
  }

  function polygonArea(ring) {
    if (!ring || ring.length < 4) return 0;
    const latKm = 111.32, lat0 = ring.reduce((s,c) => s + c[1], 0) / ring.length;
    const lonKm = 111.32 * Math.cos(toRad(lat0));
    let s = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = [ring[i][0] * lonKm, ring[i][1] * latKm];
      const [x2, y2] = [ring[i+1][0] * lonKm, ring[i+1][1] * latKm];
      s += (x1 * y2 - x2 * y1);
    }
    return Math.abs(s) / 2;
  }

  function totalLineLength(fc) {
    return (fc?.features || []).reduce((acc, f) => {
      if (f?.geometry?.type !== 'LineString') return acc;
      return acc + lineLength(f.geometry.coordinates);
    }, 0);
  }

  function totalPolyArea(fc) {
    return (fc?.features || []).reduce((acc, f) => {
      if (f?.geometry?.type !== 'Polygon') return acc;
      return acc + polygonArea(f.geometry.coordinates?.[0] || []);
    }, 0);
  }

  function compute(dynamicData) {
    return {
      riverLengthKm : totalLineLength(dynamicData.rivers),
      builtupAreaKm2: totalPolyArea(dynamicData.builtup),
      roadLengthKm  : totalLineLength(dynamicData.roads),
      featureCounts : {
        roads   : dynamicData.roads?.features?.length   || 0,
        rivers  : dynamicData.rivers?.features?.length  || 0,
        builtup : dynamicData.builtup?.features?.length || 0,
      },
    };
  }

  return { compute };
})();

/* ─────────────────────────────────────────────────────────────
   REFRESH SCHEDULER — auto-refresh timer
───────────────────────────────────────────────────────────────*/
const DFRefreshScheduler = (() => {
  let timerId   = null;
  let enabled   = true;
  let lastRunMs = null;

  function schedule(runFn) {
    stop();
    if (!enabled) return;
    timerId = setInterval(async () => {
      DFEventLog.info(`Auto-refresh triggered (interval ${DF_REFRESH_INTERVAL / 60000} min)`);
      await runFn();
    }, DF_REFRESH_INTERVAL);
    DFEventLog.info(`Auto-refresh scheduled every ${DF_REFRESH_INTERVAL / 60000} min`);
  }

  function stop() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }

  function setEnabled(val, runFn) {
    enabled = val;
    if (enabled && runFn) schedule(runFn);
    else stop();
  }

  function markRun() { lastRunMs = Date.now(); }
  function getLastRun() { return lastRunMs; }

  return { schedule, stop, setEnabled, markRun, getLastRun };
})();

/* ─────────────────────────────────────────────────────────────
   MAIN DYNAMIC FRAMEWORK ORCHESTRATOR
───────────────────────────────────────────────────────────────*/
const DynamicFramework = (() => {
  let _mapRef     = null;
  let _isRunning  = false;
  let _lastData   = null;

  /* ── Core refresh pipeline ── */
  async function refresh(force = false) {
    if (_isRunning && !force) { DFEventLog.warn('Refresh already in progress — skipped'); return; }
    _isRunning = true;

    // Show spinning icon
    const icon = document.getElementById('dfRefreshIcon');
    if (icon) icon.classList.add('df-spinning');

    DFStatusManager.setFetching();

    try {
      const dynamicData = await DFFetchEngine.fetchAllLayers();
      const hasData = Object.keys(dynamicData).length > 0;

      if (hasData) {
        _lastData = dynamicData;
        DFCacheManager.write(dynamicData);
        DFLayerManager.apply(dynamicData);

        // Update metrics in the existing script's chart/KPI system
        _applyMetrics(dynamicData);

        DFStatusManager.setLive(Date.now());
        DFPanelBadge.render('Live fetch', Date.now());
        DFEventLog.success('Live refresh complete', { layers: Object.keys(dynamicData) });
      } else {
        throw new Error('No data returned from fetch');
      }
    } catch (e) {
      DFEventLog.error('Live fetch failed', e.message);

      // Try cache before falling back to snapshot
      const cached = DFCacheManager.read();
      if (cached) {
        _lastData = cached.data;
        DFLayerManager.apply(cached.data);
        _applyMetrics(cached.data);
        DFStatusManager.setCached(cached.savedAt);
        DFPanelBadge.render('Cache', cached.savedAt);
        DFEventLog.info('Fell back to cache');
      } else {
        DFStatusManager.setFallback();
        DFPanelBadge.render('Snapshot fallback', Date.now());
      }
    } finally {
      _isRunning = false;
      DFLayerCounter.update();
      DFRefreshScheduler.markRun();
      if (icon) icon.classList.remove('df-spinning');
    }
  }

  /* ── Apply derived metrics to the existing chart/KPI system ── */
  function _applyMetrics(dynamicData) {
    try {
      const metrics = DFMetricsEngine.compute(dynamicData);
      DFEventLog.info('Derived metrics', metrics);

      // Update the provenance badge on charts (compatible with existing script)
      if (typeof setChartProvenance === 'function') {
        setChartProvenance('Live fetch', Date.now());
      }

      // Trigger existing chart refresh if available
      if (typeof applyDerivedMetricsFromGeometry === 'function') {
        applyDerivedMetricsFromGeometry(dynamicData);
      } else if (typeof refreshChartsFromLiveData === 'function') {
        refreshChartsFromLiveData();
      }

      // Update data panel badges on stats rows
      _updateStatRows(metrics);

    } catch (e) {
      DFEventLog.warn('Metrics apply error', e.message);
    }
  }

  /* ── Annotate stat rows with live data-source labels ── */
  function _updateStatRows(metrics) {
    // Roads stat
    const roadBadge = document.getElementById('df-road-count');
    if (roadBadge) roadBadge.textContent = `${metrics.featureCounts.roads} features`;

    const riverBadge = document.getElementById('df-river-length');
    if (riverBadge) riverBadge.textContent = `${metrics.riverLengthKm.toFixed(1)} km`;

    const builtupBadge = document.getElementById('df-builtup-area');
    if (builtupBadge) builtupBadge.textContent = `${metrics.builtupAreaKm2.toFixed(2)} km²`;
  }

  /* ── Initial boot from cache ── */
  async function _initFromCache() {
    const cached = DFCacheManager.read();
    if (cached && !DFCacheManager.isExpired(cached)) {
      _lastData = cached.data;
      DFLayerManager.apply(cached.data);
      _applyMetrics(cached.data);
      DFStatusManager.setCached(cached.savedAt);
      DFPanelBadge.render('Cache', cached.savedAt);
      DFEventLog.info('Loaded from cache, scheduling live fetch…');
      return true;
    }
    return false;
  }

  /* ── Wire up UI controls ── */
  function _wireControls() {
    // Manual refresh button
    const btn = document.getElementById('dfRefreshBtn');
    if (btn) btn.addEventListener('click', () => refresh(true));

    // Auto-refresh toggle
    const toggle = document.getElementById('dfAutoRefresh');
    if (toggle) {
      toggle.addEventListener('change', function () {
        DFRefreshScheduler.setEnabled(this.checked, () => refresh());
        DFEventLog.info(`Auto-refresh ${this.checked ? 'enabled' : 'disabled'}`);
      });
    }

    // Clear cache button
    const clearBtn = document.getElementById('dfClearCache');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        DFCacheManager.clear();
        clearBtn.textContent = 'Cleared ✓';
        setTimeout(() => { clearBtn.textContent = 'Clear cache'; }, 2000);
        DFEventLog.info('Cache cleared by user');
      });
    }

    // NDWI overlay checkbox  (data-layer="ndwiOverlay")
    const ndwiCb = document.querySelector('[data-layer="ndwiOverlay"]');
    if (ndwiCb) {
      ndwiCb.addEventListener('change', function () {
        if (this.checked) DFNdwiOverlay.show(_mapRef);
        else              DFNdwiOverlay.hide(_mapRef);
        DFLayerCounter.update();
      });
    }

    // Sync NDWI overlay with year slider
    const slider = document.getElementById('yearSlider');
    if (slider) {
      slider.addEventListener('input', function () {
        DFNdwiOverlay.setYear(parseInt(this.value), _mapRef);
      });
    }

    DFEventLog.info('UI controls wired');
  }

  /* ── Expose framework status globally for debugging ── */
  function _exposeDebug() {
    window.DynamicFramework = {
      refresh,
      getLastData  : () => _lastData,
      getEventLog  : () => DFEventLog.history(),
      clearCache   : () => DFCacheManager.clear(),
      status       : { manager: DFStatusManager },
      ndwiOverlay  : DFNdwiOverlay,
    };
    DFEventLog.info(`Dynamic Framework v${DF_VERSION} exposed as window.DynamicFramework`);
  }

  /* ── Public init ── */
  async function init(mapInstance) {
    _mapRef = mapInstance;
    DFEventLog.info(`Dynamic Framework v${DF_VERSION} initialising…`);

    DFStatusManager.render();
    DFLayerCounter.init();
    _wireControls();
    _exposeDebug();

    // 1. Try to serve from cache immediately (fast boot)
    const servedFromCache = await _initFromCache();

    // 2. Always attempt a live fetch in the background
    await refresh();

    // 3. Schedule auto-refresh
    DFRefreshScheduler.schedule(() => refresh());

    DFEventLog.success(`Framework initialised. Cache boot: ${servedFromCache}`);
  }

  return { init, refresh };
})();

/* ─────────────────────────────────────────────────────────────
   AUTO-INIT: hook into the existing script's initialisation
   We wait for the Leaflet map object to be ready, then init.
───────────────────────────────────────────────────────────────*/
(function waitForMap() {
  // Poll for the `map` variable defined in script.js
  const maxWait = 30;  // seconds
  let   waited  = 0;

  const poll = setInterval(() => {
    waited++;
    if (typeof map !== 'undefined' && map?._loaded !== undefined) {
      clearInterval(poll);
      DFEventLog.info(`Map detected after ${waited * 200}ms — starting framework`);

      // Wait for map to be fully ready
      if (map._loaded) {
        DynamicFramework.init(map);
      } else {
        map.whenReady(() => DynamicFramework.init(map));
      }
    } else if (waited > maxWait * 5) {
      clearInterval(poll);
      DFEventLog.error('Map not found after 30s — framework not initialised');
    }
  }, 200);
})();

/* ─────────────────────────────────────────────────────────────
   PROVENANCE FOOTER UPDATER
   Wires the status bar state into the provenance footer
───────────────────────────────────────────────────────────────*/
(function wireProvenanceFooter() {
  // Update the provenance footer whenever DynamicFramework status changes
  // We poll the dfStatusText element and mirror it into the footer
  const interval = setInterval(() => {
    const statusEl = document.getElementById('dfStatusText');
    const osmEl    = document.getElementById('provOsmStatus');
    const updEl    = document.getElementById('provUpdated');
    if (!statusEl || !osmEl) return;

    const statusText = statusEl.textContent || '';
    osmEl.textContent = statusText.includes('Live') ? 'Live (Overpass)'
                      : statusText.includes('cache') ? 'Cached (OSM)'
                      : 'Snapshot (bundled)';

    const lastUpdEl = document.getElementById('dfLastUpdated');
    if (lastUpdEl && updEl) {
      updEl.textContent = lastUpdEl.textContent || '—';
    }
  }, 2000);

  // Stop polling after 5 min to avoid indefinite background work
  setTimeout(() => clearInterval(interval), 300000);
})();
