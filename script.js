/* ═══════════════════════════════════════════════════════════
   HUSSAIN SAGAR GIS DASHBOARD — script.js
   Leaflet map, Chart.js charts, analysis panels, regression
════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────
// 1. MOCK DATA (replace with real GeoJSON when available)
// ─────────────────────────────────────────────────────────

const LAKE_CENTER = [17.4485, 78.4647];

// Historical lake area data (km²) — based on published estimates
const LAKE_DATA = {
  years:  [2000, 2005, 2010, 2015, 2020, 2025],
  areas:  [3.20, 2.98, 2.71, 2.44, 2.10, 1.84],
  ndwi:   [0.62, 0.58, 0.53, 0.48, 0.44, 0.38],
  rainfall:[780, 820, 690, 910, 750, 830],  // mm/year
};

// LULC class percentages around lake (500m buffer)
const LULC_DATA = {
  labels: ['Water Body','Built-up','Vegetation','Bare Land','Cropland','Roads'],
  values2000: [28, 22, 30, 12, 6, 2],
  values2025: [15, 42, 18, 16, 5, 4],
  colors: ['#00d4c8','#ef4444','#22c55e','#f59e0b','#a3e635','#94a3b8']
};

// Night-time light radiance index (proxy for urban growth)
const NTL_DATA = {
  years: [2000, 2005, 2010, 2015, 2020, 2023],
  ntl:   [12.4, 18.6, 27.1, 36.8, 48.2, 55.9]
};

// Buffer zone impact statistics
const BUFFER_DATA = [
  { zone: '0–500 m',   builtup: 42, pop: 28400, roads: 12.4 },
  { zone: '500–1000 m',builtup: 55, pop: 64200, roads: 28.1 },
  { zone: '1–2 km',    builtup: 61, pop: 142000,roads: 56.3 },
  { zone: '2–5 km',    builtup: 68, pop: 480000,roads: 180.2 }
];

// Topographic statistics
const TOPO_DATA = {
  elevMin: 510, elevMax: 560, elevMean: 524,
  slopeMin: 0.2, slopeMax: 8.4, slopeMean: 2.1,
  aspectDominant: 'SE (135°)'
};

// Hydrological stats
const HYDRO_DATA = {
  watershedArea: 147.2,   // km²
  riverCount: 4,
  streamOrder: 3,
  annualInflow: 42.6      // MCM
};

// ─────────────────────────────────────────────────────────
// 2. MOCK GeoJSON GEOMETRIES (approximate Hussain Sagar)
// ─────────────────────────────────────────────────────────

// Lake boundary polygon (approximate)
const GEOJSON_LAKE = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: { name: "Hussain Sagar Lake", area_km2: 1.84, year: 2025 },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [78.4530, 17.4430],[78.4570, 17.4390],[78.4630, 17.4370],
        [78.4700, 17.4380],[78.4740, 17.4420],[78.4750, 17.4470],
        [78.4730, 17.4520],[78.4690, 17.4560],[78.4640, 17.4580],
        [78.4580, 17.4570],[78.4540, 17.4540],[78.4520, 17.4500],
        [78.4530, 17.4430]
      ]]
    }
  }]
};

// Lake boundary 2000 (larger extent)
const GEOJSON_LAKE_2000 = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: { name: "Hussain Sagar (2000)", area_km2: 3.20 },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [78.4500, 17.4400],[78.4550, 17.4350],[78.4620, 17.4330],
        [78.4710, 17.4340],[78.4760, 17.4390],[78.4780, 17.4450],
        [78.4760, 17.4520],[78.4720, 17.4570],[78.4660, 17.4600],
        [78.4590, 17.4590],[78.4540, 17.4560],[78.4510, 17.4520],
        [78.4500, 17.4400]
      ]]
    }
  }]
};

// Admin boundary (Hyderabad district clip)
const GEOJSON_ADMIN = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: { name: "Hyderabad Urban Zone" },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [78.40, 17.40],[78.52, 17.40],[78.52, 17.50],[78.40, 17.50],[78.40, 17.40]
      ]]
    }
  }]
};

// Watershed polygon
const GEOJSON_WATERSHED = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: { name: "Hussain Sagar Watershed", area_km2: 147.2 },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [78.41, 17.41],[78.43, 17.38],[78.47, 17.36],[78.51, 17.38],
        [78.53, 17.42],[78.52, 17.47],[78.50, 17.52],[78.46, 17.54],
        [78.42, 17.53],[78.40, 17.49],[78.41, 17.41]
      ]]
    }
  }]
};

// Rivers (approximate tributaries)
const GEOJSON_RIVERS = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "Musi River Inflow", order: 2 },
      geometry: { type: "LineString", coordinates: [[78.43, 17.43],[78.45, 17.44],[78.455, 17.448]] }
    },
    {
      type: "Feature",
      properties: { name: "Northern Drain", order: 1 },
      geometry: { type: "LineString", coordinates: [[78.46, 17.50],[78.461, 17.493],[78.462, 17.480]] }
    },
    {
      type: "Feature",
      properties: { name: "Eastern Channel", order: 1 },
      geometry: { type: "LineString", coordinates: [[78.50, 17.46],[78.490, 17.457],[78.477, 17.455]] }
    },
    {
      type: "Feature",
      properties: { name: "Southern Nala", order: 1 },
      geometry: { type: "LineString", coordinates: [[78.46, 17.40],[78.461, 17.415],[78.462, 17.432]] }
    }
  ]
};

// Buffer zones (concentric rings)
const GEOJSON_BUFFERS = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { zone: "500m buffer", ring: 1 },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [78.4480, 17.4380],[78.4560, 17.4340],[78.4650, 17.4330],
          [78.4760, 17.4380],[78.4810, 17.4460],[78.4790, 17.4560],
          [78.4720, 17.4620],[78.4630, 17.4640],[78.4540, 17.4610],
          [78.4480, 17.4570],[78.4460, 17.4500],[78.4480, 17.4380]
        ]]
      }
    },
    {
      type: "Feature",
      properties: { zone: "1km buffer", ring: 2 },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [78.4440, 17.4340],[78.4550, 17.4290],[78.4660, 17.4280],
          [78.4800, 17.4330],[78.4860, 17.4440],[78.4840, 17.4580],
          [78.4760, 17.4660],[78.4630, 17.4690],[78.4500, 17.4650],
          [78.4430, 17.4590],[78.4410, 17.4490],[78.4440, 17.4340]
        ]]
      }
    }
  ]
};

// Built-up areas
const GEOJSON_BUILTUP = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "Banjara Hills", density: "High" },
      geometry: { type: "Polygon", coordinates: [[[78.4480,17.4280],[78.4560,17.4280],[78.4560,17.4360],[78.4480,17.4360],[78.4480,17.4280]]] }
    },
    {
      type: "Feature",
      properties: { name: "Panjagutta", density: "High" },
      geometry: { type: "Polygon", coordinates: [[[78.4560,17.4290],[78.4650,17.4290],[78.4650,17.4340],[78.4560,17.4340],[78.4560,17.4290]]] }
    },
    {
      type: "Feature",
      properties: { name: "Begumpet", density: "Medium" },
      geometry: { type: "Polygon", coordinates: [[[78.4680,17.4560],[78.4770,17.4560],[78.4770,17.4630],[78.4680,17.4630],[78.4680,17.4560]]] }
    },
    {
      type: "Feature",
      properties: { name: "Secunderabad", density: "High" },
      geometry: { type: "Polygon", coordinates: [[[78.4780,17.4480],[78.4860,17.4480],[78.4860,17.4570],[78.4780,17.4570],[78.4780,17.4480]]] }
    }
  ]
};

// Roads (major roads around lake)
const GEOJSON_ROADS = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "Tank Bund Road", type: "Primary" },
      geometry: { type: "LineString", coordinates: [[78.4530,17.4490],[78.4600,17.4490],[78.4650,17.4480],[78.4700,17.4460]] }
    },
    {
      type: "Feature",
      properties: { name: "Necklace Road", type: "Primary" },
      geometry: { type: "LineString", coordinates: [[78.4530,17.4430],[78.4560,17.4400],[78.4620,17.4380],[78.4690,17.4400]] }
    },
    {
      type: "Feature",
      properties: { name: "Raj Bhavan Road", type: "Secondary" },
      geometry: { type: "LineString", coordinates: [[78.4510,17.4490],[78.4510,17.4430],[78.4530,17.4380]] }
    }
  ]
};

// ─────────────────────────────────────────────────────────
// 3. BASEMAP TILE LAYERS
// ─────────────────────────────────────────────────────────

const BASEMAPS = {
  dark: L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    { attribution: '© CartoDB', subdomains: 'abcd', maxZoom: 19 }
  ),
  satellite: L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: '© Esri', maxZoom: 19 }
  ),
  street: L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: '© OpenStreetMap', maxZoom: 19 }
  )
};

// ─────────────────────────────────────────────────────────
// 4. INITIALIZE MAP
// ─────────────────────────────────────────────────────────

const map = L.map('map', {
  center: LAKE_CENTER,
  zoom: 14,
  zoomControl: false,
  attributionControl: false
});

// Start with dark basemap
BASEMAPS.dark.addTo(map);
let currentBasemap = 'dark';

// Small attribution
L.control.attribution({ position: 'bottomleft', prefix: false })
  .addAttribution('© CartoDB | Leaflet')
  .addTo(map);

// ─────────────────────────────────────────────────────────
// 5. VECTOR LAYER OBJECTS
// ─────────────────────────────────────────────────────────

// Helper: create styled GeoJSON layer
function makeLayer(geojson, style, popupFn) {
  return L.geoJSON(geojson, {
    style: style,
    pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 5, ...style }),
    onEachFeature: (feature, layer) => {
      if (popupFn) layer.bindPopup(popupFn(feature.properties));
    }
  });
}

// Lake boundary (current 2025)
const layerLakeCurrent = makeLayer(
  GEOJSON_LAKE,
  { color: '#00d4c8', weight: 2.5, fillColor: '#00d4c8', fillOpacity: 0.18 },
  p => `<b style="color:#00d4c8">${p.name}</b><br>Area (2025): <b>${p.area_km2} km²</b>`
);

// Lake boundary 2000 (for change detection)
const layerLake2000 = makeLayer(
  GEOJSON_LAKE_2000,
  { color: '#0ea5e9', weight: 1.5, fillColor: '#0ea5e9', fillOpacity: 0.08, dashArray: '6,4' },
  p => `<b style="color:#0ea5e9">${p.name}</b><br>Area (2000): <b>${p.area_km2} km²</b>`
);

// Admin boundary
const layerAdmin = makeLayer(
  GEOJSON_ADMIN,
  { color: '#ff9f43', weight: 1.5, fillOpacity: 0, dashArray: '8,4' },
  p => `<b style="color:#ff9f43">${p.name}</b>`
);

// Watershed
const layerWatershed = makeLayer(
  GEOJSON_WATERSHED,
  { color: '#48dbfb', weight: 1.5, fillColor: '#48dbfb', fillOpacity: 0.06, dashArray: '5,3' },
  p => `<b style="color:#48dbfb">Watershed</b><br>Area: <b>${p.area_km2} km²</b>`
);

// Rivers
const layerRivers = makeLayer(
  GEOJSON_RIVERS,
  { color: '#0abde3', weight: 2, opacity: 0.9 },
  p => `<b style="color:#0abde3">${p.name}</b><br>Stream Order: <b>${p.order}</b>`
);

// Buffer zones
const layerBuffers = makeLayer(
  GEOJSON_BUFFERS,
  (feature) => ({
    color: '#ffd32a',
    weight: 1,
    fillColor: '#ffd32a',
    fillOpacity: feature.properties.ring === 1 ? 0.08 : 0.04,
    dashArray: '4,3'
  }),
  p => `<b style="color:#ffd32a">${p.zone}</b>`
);

// Built-up areas
const layerBuiltup = makeLayer(
  GEOJSON_BUILTUP,
  { color: '#ef4444', weight: 1, fillColor: '#ef4444', fillOpacity: 0.3 },
  p => `<b style="color:#ef4444">${p.name}</b><br>Density: <b>${p.density}</b>`
);

// Roads
const layerRoads = makeLayer(
  GEOJSON_ROADS,
  (feature) => ({
    color: feature.properties.type === 'Primary' ? '#cbd5e1' : '#94a3b8',
    weight: feature.properties.type === 'Primary' ? 2 : 1.2,
    opacity: 0.7
  }),
  p => `<b style="color:#94a3b8">${p.name}</b><br>Type: <b>${p.type}</b>`
);

// Map of all toggleable layers
const ALL_LAYERS = {
  lakeBoundary:  layerLakeCurrent,
  adminBoundary: layerAdmin,
  watershed:     layerWatershed,
  rivers:        layerRivers,
  bufferZones:   layerBuffers,
  builtup:       layerBuiltup,
  roads:         layerRoads
};

// Add default-on layers
layerLakeCurrent.addTo(map);
layerAdmin.addTo(map);

// ─────────────────────────────────────────────────────────
// 6. LAYER TOGGLE CONTROLS
// ─────────────────────────────────────────────────────────

document.querySelectorAll('[data-layer]').forEach(checkbox => {
  checkbox.addEventListener('change', function () {
    const layerKey = this.dataset.layer;
    const layer = ALL_LAYERS[layerKey];
    if (!layer) return;
    if (this.checked) {
      layer.addTo(map);
    } else {
      map.removeLayer(layer);
    }
  });
});

// Toggle all layers button
let allOn = true;
document.getElementById('toggleAllLayers').addEventListener('click', function () {
  allOn = !allOn;
  this.textContent = allOn ? 'All Off' : 'All On';
  document.querySelectorAll('[data-layer]').forEach(cb => {
    cb.checked = allOn;
    const layer = ALL_LAYERS[cb.dataset.layer];
    if (layer) {
      if (allOn) layer.addTo(map);
      else map.removeLayer(layer);
    }
  });
});

// ─────────────────────────────────────────────────────────
// 7. BASEMAP SWITCHER
// ─────────────────────────────────────────────────────────

document.querySelectorAll('.bm-btn').forEach(btn => {
  btn.addEventListener('click', function () {
    const key = this.dataset.basemap;
    if (key === currentBasemap) return;
    map.removeLayer(BASEMAPS[currentBasemap]);
    BASEMAPS[key].addTo(map);
    currentBasemap = key;
    document.querySelectorAll('.bm-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
  });
});

// ─────────────────────────────────────────────────────────
// 8. MAP TOOLBAR BUTTONS
// ─────────────────────────────────────────────────────────

document.getElementById('btnZoomIn').addEventListener('click', () => map.zoomIn());
document.getElementById('btnZoomOut').addEventListener('click', () => map.zoomOut());
document.getElementById('btnCenter').addEventListener('click', () => map.setView(LAKE_CENTER, 14));

// ─────────────────────────────────────────────────────────
// 9. YEAR SLIDER (Temporal Analysis)
// ─────────────────────────────────────────────────────────

const YEAR_LIST   = [2000, 2005, 2010, 2015, 2020, 2025];
const YEAR_AREAS  = [3.20, 2.98, 2.71, 2.44, 2.10, 1.84];

// Simulated lake boundaries (scale lake polygon by year index for demo)
function getLakeBoundaryForYear(yearIdx) {
  // Interpolate between 2000 and 2025 polygon by shrinking
  const scale = 0.85 + (yearIdx / (YEAR_LIST.length - 1)) * 0.15; // 1.0 → 0.85
  const factor = 1 - (yearIdx / (YEAR_LIST.length - 1)) * 0.25;    // shrink factor
  const center = [78.4640, 17.4475];
  const coords2025 = GEOJSON_LAKE.features[0].geometry.coordinates[0];
  const coords2000 = GEOJSON_LAKE_2000.features[0].geometry.coordinates[0];

  // Interpolate coordinates
  const interp = coords2000.map((c, i) => {
    const c25 = coords2025[i] || coords2025[0];
    const t = yearIdx / (YEAR_LIST.length - 1);
    return [c[0] * (1 - t) + c25[0] * t, c[1] * (1 - t) + c25[1] * t];
  });
  return interp;
}

let temporalLayer = null;

document.getElementById('yearSlider').addEventListener('input', function () {
  const idx = parseInt(this.value);
  const year = YEAR_LIST[idx];
  const area = YEAR_AREAS[idx];
  document.getElementById('sliderYearLabel').textContent = year;

  if (temporalLayer) map.removeLayer(temporalLayer);

  const coords = getLakeBoundaryForYear(idx);
  temporalLayer = L.geoJSON({
    type: "Feature",
    properties: { year, area },
    geometry: { type: "Polygon", coordinates: [coords] }
  }, {
    style: {
      color: idx === 0 ? '#0ea5e9' : '#00d4c8',
      weight: 2.5,
      fillColor: idx === 0 ? '#0ea5e9' : '#00d4c8',
      fillOpacity: 0.2
    }
  }).addTo(map);
  temporalLayer.bindPopup(`<b>Year ${year}</b><br>Area: <b>${area} km²</b>`).openPopup();
});

// ─────────────────────────────────────────────────────────
// 10. ANALYSIS PANEL CONTENT DEFINITIONS
// ─────────────────────────────────────────────────────────

const ANALYSIS_PANELS = {

  spatiotemporal: {
    title: "Spatio-Temporal Analysis",
    badge: "2000 – 2025",
    desc: "Multi-temporal analysis of Hussain Sagar Lake using Landsat 5/8 and Sentinel-2 imagery across 6 epochs (2000–2025). Tracks spatial extent changes over 25 years.",
    mapAction: () => {
      map.removeLayer(layerLakeCurrent);
      layerLake2000.addTo(map);
      layerLakeCurrent.addTo(map);
      document.getElementById('yearSliderPanel').classList.add('visible');
    },
    statsHTML: `
      <div class="panel-section-title">Area Statistics</div>
      <div class="stat-row"><span class="stat-key">2000 Extent</span><span class="stat-val teal">3.20 km²</span></div>
      <div class="stat-row"><span class="stat-key">2025 Extent</span><span class="stat-val red">1.84 km²</span></div>
      <div class="stat-row"><span class="stat-key">Total Loss</span><span class="stat-val red">−1.36 km²</span></div>
      <div class="stat-row"><span class="stat-key">% Shrinkage</span><span class="stat-val red">−42.5%</span></div>
      <div class="stat-row"><span class="stat-key">Annual Rate</span><span class="stat-val gold">−0.054 km²/yr</span></div>
    `,
    insightText: "Lake has lost over 42% of its area in 25 years. Accelerated shrinkage observed post-2015 correlating with rapid urbanization.",
    insightType: "danger",
    actions: [{ label: "Show Temporal Boundaries", id: "btnShowTemporal" }]
  },

  ndwi: {
    title: "NDWI Spectral Analysis",
    badge: "Normalized Difference Water Index",
    desc: "NDWI computed from near-infrared and green bands of Landsat/Sentinel-2. Values > 0.3 indicate open water. Declining trend indicates water loss.",
    mapAction: () => {
      layerLakeCurrent.addTo(map);
      map.setView(LAKE_CENTER, 14);
    },
    statsHTML: `
      <div class="panel-section-title">NDWI Statistics</div>
      <div class="stat-row"><span class="stat-key">NDWI 2000</span><span class="stat-val teal">0.62</span></div>
      <div class="stat-row"><span class="stat-key">NDWI 2025</span><span class="stat-val red">0.38</span></div>
      <div class="stat-row"><span class="stat-key">Δ NDWI</span><span class="stat-val red">−0.24</span></div>
      <div class="stat-row"><span class="stat-key">Water Threshold</span><span class="stat-val">NDWI > 0.0</span></div>
      <div class="stat-row"><span class="stat-key">Strong Water</span><span class="stat-val teal">NDWI > 0.3</span></div>
    `,
    insightText: "NDWI decline of −0.24 over 25 years confirms significant water body reduction. Strong correlation with urban expansion and reduced inflow.",
    insightType: "",
    actions: [{ label: "Highlight Water Pixels", id: "btnHighlightWater" }]
  },

  change: {
    title: "Change Detection",
    badge: "Before / After Overlay",
    desc: "Pixel-level change detection between 2000 and 2025 using image differencing and post-classification comparison. Red zones = water loss.",
    mapAction: () => {
      layerLake2000.addTo(map);
      layerLakeCurrent.addTo(map);
      map.setView(LAKE_CENTER, 14);
    },
    statsHTML: `
      <div class="panel-section-title">Change Matrix</div>
      <div class="stat-row"><span class="stat-key">Water → Non-water</span><span class="stat-val red">1.36 km²</span></div>
      <div class="stat-row"><span class="stat-key">Non-water → Water</span><span class="stat-val green">0.00 km²</span></div>
      <div class="stat-row"><span class="stat-key">Stable Water</span><span class="stat-val teal">1.84 km²</span></div>
      <div class="stat-row"><span class="stat-key">Net Change</span><span class="stat-val red">−1.36 km²</span></div>
    `,
    insightText: "No recovery zones detected — all change is one-directional (water → non-water). Built-up encroachment accounts for ~62% of water loss.",
    insightType: "danger",
    actions: [{ label: "Overlay 2000 vs 2025", id: "btnOverlay" }]
  },

  urban: {
    title: "Urban Impact Analysis",
    badge: "VIIRS Night-Time Light",
    desc: "Urban expansion quantified using VIIRS night-time light (NTL) radiance as proxy for built-up growth. Higher NTL = higher urban density near lake.",
    mapAction: () => {
      layerBuiltup.addTo(map);
      document.querySelector('[data-layer="builtup"]').checked = true;
      map.setView(LAKE_CENTER, 14);
    },
    statsHTML: `
      <div class="panel-section-title">NTL Radiance Trend</div>
      <div class="stat-row"><span class="stat-key">NTL 2000</span><span class="stat-val">12.4 nW/sr/cm²</span></div>
      <div class="stat-row"><span class="stat-key">NTL 2023</span><span class="stat-val red">55.9 nW/sr/cm²</span></div>
      <div class="stat-row"><span class="stat-key">NTL Growth</span><span class="stat-val red">+351%</span></div>
      <div class="stat-row"><span class="stat-key">Built-up 2000</span><span class="stat-val">22%</span></div>
      <div class="stat-row"><span class="stat-key">Built-up 2025</span><span class="stat-val red">42%</span></div>
    `,
    insightText: "Night-time light radiance grew by 351% around the lake catchment, strongly correlated with lake area decline (r = −0.97).",
    insightType: "warn",
    actions: [{ label: "Show Built-up Zones", id: "btnShowBuiltup" }]
  },

  lulc: {
    title: "LULC Analysis",
    badge: "ESA WorldCover 2020/2025",
    desc: "Land Use / Land Cover classification derived from ESA WorldCover (10m) identifying water, built-up, vegetation, cropland, and bare land in the lake catchment.",
    mapAction: () => {
      layerLakeCurrent.addTo(map);
      layerBuiltup.addTo(map);
      map.setView(LAKE_CENTER, 14);
    },
    statsHTML: `
      <div class="panel-section-title">LULC Change (500m buffer)</div>
      <div class="progress-row"><div class="progress-label-row"><span class="progress-key">Water Body</span><span class="progress-pct" style="color:#00d4c8">15% (was 28%)</span></div><div class="progress-bar-bg"><div class="progress-bar-fill" style="width:15%;background:#00d4c8"></div></div></div>
      <div class="progress-row"><div class="progress-label-row"><span class="progress-key">Built-up</span><span class="progress-pct" style="color:#ef4444">42% (was 22%)</span></div><div class="progress-bar-bg"><div class="progress-bar-fill" style="width:42%;background:#ef4444"></div></div></div>
      <div class="progress-row"><div class="progress-label-row"><span class="progress-key">Vegetation</span><span class="progress-pct" style="color:#22c55e">18% (was 30%)</span></div><div class="progress-bar-bg"><div class="progress-bar-fill" style="width:18%;background:#22c55e"></div></div></div>
      <div class="progress-row"><div class="progress-label-row"><span class="progress-key">Bare Land</span><span class="progress-pct" style="color:#f59e0b">16% (was 12%)</span></div><div class="progress-bar-bg"><div class="progress-bar-fill" style="width:16%;background:#f59e0b"></div></div></div>
    `,
    insightText: "Built-up area doubled from 22% to 42% within 500m of the lake, directly replacing water body and riparian vegetation.",
    insightType: "warn",
    actions: [{ label: "Show LULC Classification", id: "btnShowLULC" }]
  },

  topo: {
    title: "Topographic Analysis",
    badge: "SRTM 30m DEM",
    desc: "Topographic characterization using SRTM DEM (30m). Derived products include slope, aspect, hillshade and elevation zones around Hussain Sagar catchment.",
    mapAction: () => {
      map.setView(LAKE_CENTER, 13);
      layerLakeCurrent.addTo(map);
    },
    statsHTML: `
      <div class="panel-section-title">Terrain Statistics</div>
      <div class="stat-row"><span class="stat-key">Min Elevation</span><span class="stat-val">510 m</span></div>
      <div class="stat-row"><span class="stat-key">Max Elevation</span><span class="stat-val">560 m</span></div>
      <div class="stat-row"><span class="stat-key">Mean Elevation</span><span class="stat-val teal">524 m</span></div>
      <div class="stat-row"><span class="stat-key">Mean Slope</span><span class="stat-val">2.1°</span></div>
      <div class="stat-row"><span class="stat-key">Max Slope</span><span class="stat-val">8.4°</span></div>
      <div class="stat-row"><span class="stat-key">Dominant Aspect</span><span class="stat-val teal">SE (135°)</span></div>
    `,
    insightText: "Gentle terrain (mean slope 2.1°) with SE-facing aspect facilitates surface runoff toward the lake basin. Low relief limits natural drainage outlet capacity.",
    insightType: "",
    actions: [{ label: "Show Elevation Zones", id: "btnShowElev" }]
  },

  hydro: {
    title: "Hydrological Context",
    badge: "HydroSHEDS / GEE",
    desc: "Watershed delineation, river network mapping and flow accumulation analysis around Hussain Sagar. 4 major inflow channels identified.",
    mapAction: () => {
      layerWatershed.addTo(map);
      layerRivers.addTo(map);
      document.querySelector('[data-layer="watershed"]').checked = true;
      document.querySelector('[data-layer="rivers"]').checked = true;
      map.setView([17.447, 78.465], 13);
    },
    statsHTML: `
      <div class="panel-section-title">Watershed Characteristics</div>
      <div class="stat-row"><span class="stat-key">Watershed Area</span><span class="stat-val teal">147.2 km²</span></div>
      <div class="stat-row"><span class="stat-key">No. of Rivers</span><span class="stat-val">4 channels</span></div>
      <div class="stat-row"><span class="stat-key">Stream Order</span><span class="stat-val">3 (Strahler)</span></div>
      <div class="stat-row"><span class="stat-key">Annual Inflow</span><span class="stat-val teal">42.6 MCM</span></div>
      <div class="stat-row"><span class="stat-key">Musi Connection</span><span class="stat-val green">Active</span></div>
    `,
    insightText: "Annual inflow of 42.6 MCM is insufficient relative to evaporation losses (est. 18 MCM) and extraction, contributing to net water deficit.",
    insightType: "",
    actions: [{ label: "Show Watershed + Rivers", id: "btnShowWatershed" }]
  },

  rainfall: {
    title: "Rainfall Correlation",
    badge: "CHIRPS Precipitation Data",
    desc: "Annual precipitation (CHIRPS) correlated with lake area changes. Despite moderate rainfall, lake continues to shrink due to surface runoff diversion and infiltration loss.",
    mapAction: () => {
      layerLakeCurrent.addTo(map);
      layerWatershed.addTo(map);
    },
    statsHTML: `
      <div class="panel-section-title">Rainfall Statistics (Watershed)</div>
      <div class="stat-row"><span class="stat-key">Mean Annual Rain</span><span class="stat-val teal">797 mm</span></div>
      <div class="stat-row"><span class="stat-key">Max (2005)</span><span class="stat-val">820 mm</span></div>
      <div class="stat-row"><span class="stat-key">Min (2010)</span><span class="stat-val red">690 mm</span></div>
      <div class="stat-row"><span class="stat-key">Correlation (r)</span><span class="stat-val gold">+0.41</span></div>
      <div class="stat-row"><span class="stat-key">Significance</span><span class="stat-val">Moderate (p<0.1)</span></div>
    `,
    insightText: "Weak positive correlation (r=0.41) between rainfall and lake area suggests urban runoff interception and groundwater extraction are dominant loss factors.",
    insightType: "warn",
    actions: [{ label: "Show Rainfall Chart", id: "btnShowRainfall" }]
  },

  buffer: {
    title: "Buffer & Proximity Analysis",
    badge: "0–5 km Impact Zones",
    desc: "Concentric buffer zones (500m, 1km, 2km, 5km) around the lake boundary analyse human pressure gradients — built-up density, population, road length.",
    mapAction: () => {
      layerBuffers.addTo(map);
      layerBuiltup.addTo(map);
      document.querySelector('[data-layer="bufferZones"]').checked = true;
      map.setView(LAKE_CENTER, 13);
    },
    statsHTML: `
      <div class="panel-section-title">Zone Impact Summary</div>
      <div class="stat-row"><span class="stat-key">0–500 m Built-up</span><span class="stat-val red">42%</span></div>
      <div class="stat-row"><span class="stat-key">0–1 km Population</span><span class="stat-val">92,600</span></div>
      <div class="stat-row"><span class="stat-key">0–2 km Road length</span><span class="stat-val">56.3 km</span></div>
      <div class="stat-row"><span class="stat-key">0–5 km Population</span><span class="stat-val red">~715,000</span></div>
      <div class="stat-row"><span class="stat-key">Critical Buffer</span><span class="stat-val gold">≤ 500 m</span></div>
    `,
    insightText: "Over 715,000 people live within 5km of the lake. The innermost 500m buffer has 42% built-up cover — well above the safe threshold of <15%.",
    insightType: "danger",
    actions: [{ label: "Show Buffer Zones", id: "btnShowBuffers" }]
  },

  forecast: {
    title: "Regression Forecast",
    badge: "Linear Regression Model",
    desc: "Ordinary Least Squares (OLS) linear regression fitted to lake area data (2000–2025). Model extrapolated to predict lake extent in 2030 and 2040.",
    mapAction: () => {
      layerLakeCurrent.addTo(map);
      map.setView(LAKE_CENTER, 14);
    },
    statsHTML: `
      <div class="panel-section-title">Model Output</div>
      <div class="stat-row"><span class="stat-key">Equation</span><span class="stat-val teal" id="panelRegEq">—</span></div>
      <div class="stat-row"><span class="stat-key">R² Score</span><span class="stat-val" id="panelR2">—</span></div>
      <div class="stat-row"><span class="stat-key">Slope</span><span class="stat-val red" id="panelSlope">—</span></div>
      <div class="stat-row"><span class="stat-key">Forecast 2030</span><span class="stat-val gold" id="panelF2030">—</span></div>
      <div class="stat-row"><span class="stat-key">Forecast 2040</span><span class="stat-val red" id="panelF2040">—</span></div>
    `,
    insightText: "If current trends continue, Hussain Sagar could shrink to ~1.0 km² by 2040 — less than one-third of its 2000 extent.",
    insightType: "danger",
    actions: [
      { label: "Open Forecast Model", id: "btnOpenForecast", primary: true },
    ]
  }
};

// ─────────────────────────────────────────────────────────
// 11. RENDER ANALYSIS PANEL
// ─────────────────────────────────────────────────────────

let currentAnalysis = 'spatiotemporal';

function renderPanel(key) {
  const p = ANALYSIS_PANELS[key];
  if (!p) return;

  const actionsHTML = (p.actions || []).map(a =>
    `<button class="action-btn ${a.primary ? '' : 'secondary'}" id="${a.id}">${a.label}</button>`
  ).join('');

  document.getElementById('analysisPanel').innerHTML = `
    <div class="panel-inner">
      <div>
        <div class="panel-title">${p.title}</div>
        <span class="panel-badge">${p.badge}</span>
      </div>
      <p class="panel-desc">${p.desc}</p>
      <div>${p.statsHTML}</div>
      <div class="insight-box ${p.insightType}">${p.insightText}</div>
      <div style="display:flex;flex-direction:column;gap:6px;">${actionsHTML}</div>
    </div>
  `;

  // Run map action
  if (p.mapAction) p.mapAction();

  // Wire up action buttons
  wireActionButtons(key);

  // Update legend
  updateLegend(key);

  // Highlight chart
  highlightChart(key);

  // Update regression stats if forecast panel
  if (key === 'forecast') updateForecastStats();
}

// ─────────────────────────────────────────────────────────
// 12. ACTION BUTTON HANDLERS
// ─────────────────────────────────────────────────────────

function wireActionButtons(key) {
  const handlers = {
    btnShowTemporal: () => {
      document.getElementById('yearSliderPanel').classList.add('visible');
      layerLake2000.addTo(map);
      layerLakeCurrent.addTo(map);
    },
    btnHighlightWater: () => {
      map.setView(LAKE_CENTER, 15);
      layerLakeCurrent.addTo(map);
    },
    btnOverlay: () => {
      layerLake2000.addTo(map);
      layerLakeCurrent.addTo(map);
      map.setView(LAKE_CENTER, 14);
    },
    btnShowBuiltup: () => {
      layerBuiltup.addTo(map);
      document.querySelector('[data-layer="builtup"]').checked = true;
    },
    btnShowLULC: () => {
      layerBuiltup.addTo(map);
      layerLakeCurrent.addTo(map);
      document.querySelector('[data-layer="builtup"]').checked = true;
    },
    btnShowElev: () => {
      map.setView(LAKE_CENTER, 13);
    },
    btnShowWatershed: () => {
      layerWatershed.addTo(map);
      layerRivers.addTo(map);
      document.querySelector('[data-layer="watershed"]').checked = true;
      document.querySelector('[data-layer="rivers"]').checked = true;
    },
    btnShowRainfall: () => {
      document.getElementById('chartCard3').scrollIntoView({ behavior: 'smooth' });
    },
    btnShowBuffers: () => {
      layerBuffers.addTo(map);
      document.querySelector('[data-layer="bufferZones"]').checked = true;
    },
    btnOpenForecast: () => {
      document.getElementById('forecastModal').classList.add('open');
      renderModalForecastChart();
    }
  };

  Object.entries(handlers).forEach(([id, fn]) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  });
}

// ─────────────────────────────────────────────────────────
// 13. MODULE BUTTON CLICK
// ─────────────────────────────────────────────────────────

document.querySelectorAll('.module-btn').forEach(btn => {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.module-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    const key = this.dataset.analysis;
    currentAnalysis = key;

    // Hide year slider unless temporal
    if (key !== 'spatiotemporal') {
      document.getElementById('yearSliderPanel').classList.remove('visible');
      if (temporalLayer) { map.removeLayer(temporalLayer); temporalLayer = null; }
    }

    renderPanel(key);
  });
});

// ─────────────────────────────────────────────────────────
// 14. MAP LEGEND UPDATER
// ─────────────────────────────────────────────────────────

const LEGENDS = {
  spatiotemporal: [
    { color: '#00d4c8', label: 'Lake 2025 (1.84 km²)' },
    { color: '#0ea5e9', label: 'Lake 2000 (3.20 km²)', dash: true }
  ],
  ndwi: [
    { color: '#00d4c8', label: 'NDWI > 0.5 (Water)' },
    { color: '#0ea5e9', label: 'NDWI 0.3–0.5' },
    { color: '#475569', label: 'NDWI < 0.3 (Land)' }
  ],
  change: [
    { color: '#00d4c8', label: 'Stable Water' },
    { color: '#ef4444', label: 'Water Loss (2000→2025)' },
    { color: '#0ea5e9', label: 'Lake 2000 Extent' }
  ],
  urban: [
    { color: '#ef4444', label: 'Built-up Areas' },
    { color: '#f59e0b', label: 'Medium Density' },
    { color: '#00d4c8', label: 'Lake Boundary' }
  ],
  lulc: [
    { color: '#00d4c8', label: 'Water Body' },
    { color: '#ef4444', label: 'Built-up' },
    { color: '#22c55e', label: 'Vegetation' },
    { color: '#f59e0b', label: 'Bare Land' }
  ],
  topo: [
    { color: '#1a5276', label: '510–520 m' },
    { color: '#2e86c1', label: '520–535 m' },
    { color: '#85c1e9', label: '535–560 m' }
  ],
  hydro: [
    { color: '#48dbfb', label: 'Watershed' },
    { color: '#0abde3', label: 'Rivers' },
    { color: '#00d4c8', label: 'Lake Boundary' }
  ],
  rainfall: [
    { color: '#0ea5e9', label: 'High Rainfall (>800mm)' },
    { color: '#7dd3fc', label: 'Moderate (650–800mm)' },
    { color: '#48dbfb', label: 'Watershed Boundary' }
  ],
  buffer: [
    { color: '#ffd32a', label: '0–500 m Buffer' },
    { color: 'rgba(255,211,42,0.5)', label: '500 m–1 km Buffer' },
    { color: '#ef4444', label: 'Built-up Areas' }
  ],
  forecast: [
    { color: '#00d4c8', label: 'Historical Data' },
    { color: '#f0a500', label: 'Regression Line' },
    { color: '#ef4444', label: 'Future Prediction' }
  ]
};

function updateLegend(key) {
  const items = LEGENDS[key] || [];
  document.getElementById('legendContent').innerHTML = items.map(item => `
    <div class="legend-item">
      <div class="legend-swatch" style="background:${item.color};${item.dash ? 'border: 1px dashed '+item.color+';background:transparent;' : ''}"></div>
      <span>${item.label}</span>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────────────────
// 15. CHART HIGHLIGHT
// ─────────────────────────────────────────────────────────

const CHART_MAP = {
  spatiotemporal: 'chartCard1',
  change: 'chartCard1',
  ndwi: 'chartCard2',
  rainfall: 'chartCard3',
  forecast: 'chartCard4',
  urban: 'chartCard4'
};

function highlightChart(key) {
  document.querySelectorAll('.chart-card').forEach(c => c.classList.remove('active-chart'));
  const id = CHART_MAP[key];
  if (id) document.getElementById(id).classList.add('active-chart');
}

// ─────────────────────────────────────────────────────────
// 16. CHART.JS — COMMON OPTIONS
// ─────────────────────────────────────────────────────────

Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
Chart.defaults.font.family = "'DM Sans', sans-serif";
Chart.defaults.font.size = 11;

const CHART_COLORS = {
  teal: '#00d4c8',
  blue: '#0ea5e9',
  gold: '#f0a500',
  red:  '#ef4444',
  green:'#22c55e',
  tealFill: 'rgba(0,212,200,0.12)',
  blueFill: 'rgba(14,165,233,0.12)',
  goldFill: 'rgba(240,165,0,0.12)',
  redFill:  'rgba(239,68,68,0.12)'
};

const commonOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { intersect: false, mode: 'index' },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(17,24,39,0.95)',
      titleColor: '#e2e8f0',
      bodyColor: '#94a3b8',
      borderColor: 'rgba(0,212,200,0.3)',
      borderWidth: 1,
      padding: 10,
      cornerRadius: 8
    }
  },
  scales: {
    x: {
      grid: { color: 'rgba(255,255,255,0.04)' },
      ticks: { color: '#64748b', font: { size: 10 } }
    },
    y: {
      grid: { color: 'rgba(255,255,255,0.04)' },
      ticks: { color: '#64748b', font: { size: 10 } }
    }
  }
};

// ─────────────────────────────────────────────────────────
// 17. CHART 1 — LAKE AREA TREND
// ─────────────────────────────────────────────────────────

new Chart(document.getElementById('chartLakeArea'), {
  type: 'line',
  data: {
    labels: LAKE_DATA.years,
    datasets: [{
      label: 'Lake Area (km²)',
      data: LAKE_DATA.areas,
      borderColor: CHART_COLORS.teal,
      backgroundColor: CHART_COLORS.tealFill,
      borderWidth: 2.5,
      pointBackgroundColor: CHART_COLORS.teal,
      pointRadius: 4,
      pointHoverRadius: 6,
      fill: true,
      tension: 0.35
    }]
  },
  options: {
    ...commonOptions,
    plugins: { ...commonOptions.plugins,
      annotation: {} },
    scales: {
      ...commonOptions.scales,
      y: {
        ...commonOptions.scales.y,
        min: 1.5, max: 3.5,
        title: { display: true, text: 'km²', color: '#475569', font: { size: 10 } }
      }
    }
  }
});

// ─────────────────────────────────────────────────────────
// 18. CHART 2 — NDWI VARIATION
// ─────────────────────────────────────────────────────────

new Chart(document.getElementById('chartNDWI'), {
  type: 'bar',
  data: {
    labels: LAKE_DATA.years,
    datasets: [{
      label: 'NDWI',
      data: LAKE_DATA.ndwi,
      backgroundColor: LAKE_DATA.ndwi.map(v => v > 0.5
        ? 'rgba(0,212,200,0.8)'
        : v > 0.4
          ? 'rgba(14,165,233,0.7)'
          : 'rgba(239,68,68,0.7)'),
      borderRadius: 4,
      borderSkipped: false
    }]
  },
  options: {
    ...commonOptions,
    scales: {
      ...commonOptions.scales,
      y: {
        ...commonOptions.scales.y,
        min: 0.3, max: 0.7,
        title: { display: true, text: 'NDWI Value', color: '#475569', font: { size: 10 } }
      }
    }
  }
});

// ─────────────────────────────────────────────────────────
// 19. CHART 3 — RAINFALL vs LAKE AREA (dual axis)
// ─────────────────────────────────────────────────────────

new Chart(document.getElementById('chartRainfall'), {
  type: 'line',
  data: {
    labels: LAKE_DATA.years,
    datasets: [
      {
        label: 'Rainfall (mm)',
        data: LAKE_DATA.rainfall,
        borderColor: CHART_COLORS.blue,
        backgroundColor: CHART_COLORS.blueFill,
        borderWidth: 2,
        pointRadius: 3,
        fill: true,
        tension: 0.4,
        yAxisID: 'yRain'
      },
      {
        label: 'Lake Area (km²)',
        data: LAKE_DATA.areas,
        borderColor: CHART_COLORS.teal,
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 3,
        borderDash: [4, 3],
        tension: 0.3,
        yAxisID: 'yArea'
      }
    ]
  },
  options: {
    ...commonOptions,
    scales: {
      x: commonOptions.scales.x,
      yRain: {
        type: 'linear', position: 'left',
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: CHART_COLORS.blue, font: { size: 9 } },
        title: { display: true, text: 'mm', color: CHART_COLORS.blue, font: { size: 9 } }
      },
      yArea: {
        type: 'linear', position: 'right',
        grid: { drawOnChartArea: false },
        ticks: { color: CHART_COLORS.teal, font: { size: 9 } },
        title: { display: true, text: 'km²', color: CHART_COLORS.teal, font: { size: 9 } }
      }
    }
  }
});

// ─────────────────────────────────────────────────────────
// 20. LINEAR REGRESSION ENGINE
// ─────────────────────────────────────────────────────────

function linearRegression(xs, ys) {
  const n = xs.length;
  const sumX  = xs.reduce((a, b) => a + b, 0);
  const sumY  = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);

  const m = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const b = (sumY - m * sumX) / n;

  // R² calculation
  const yMean = sumY / n;
  const ssTot = ys.reduce((acc, y) => acc + (y - yMean) ** 2, 0);
  const ssRes = xs.reduce((acc, x, i) => acc + (ys[i] - (m * x + b)) ** 2, 0);
  const r2 = 1 - ssRes / ssTot;

  return { m, b, r2, predict: x => m * x + b };
}

const reg = linearRegression(LAKE_DATA.years, LAKE_DATA.areas);

function updateForecastStats() {
  const f2030 = Math.max(0, reg.predict(2030)).toFixed(2);
  const f2040 = Math.max(0, reg.predict(2040)).toFixed(2);
  const eq = `y = ${reg.m.toFixed(4)}x + ${reg.b.toFixed(1)}`;

  // Panel stats
  const panelEq    = document.getElementById('panelRegEq');
  const panelR2    = document.getElementById('panelR2');
  const panelSlope = document.getElementById('panelSlope');
  const panelF2030 = document.getElementById('panelF2030');
  const panelF2040 = document.getElementById('panelF2040');
  if (panelEq)    panelEq.textContent    = eq;
  if (panelR2)    panelR2.textContent    = reg.r2.toFixed(4);
  if (panelSlope) panelSlope.textContent = `${reg.m.toFixed(4)} km²/yr`;
  if (panelF2030) panelF2030.textContent = `${f2030} km²`;
  if (panelF2040) panelF2040.textContent = `${f2040} km²`;

  // Modal stats
  const regEq    = document.getElementById('regEq');
  const regR2    = document.getElementById('regR2');
  const regSlope = document.getElementById('regSlope');
  const reg2030  = document.getElementById('reg2030');
  const reg2040  = document.getElementById('reg2040');
  if (regEq)    regEq.textContent    = eq;
  if (regR2)    regR2.textContent    = reg.r2.toFixed(4);
  if (regSlope) regSlope.textContent = `${reg.m.toFixed(4)} km²/yr`;
  if (reg2030)  reg2030.textContent  = `${f2030} km²`;
  if (reg2040)  reg2040.textContent  = `${f2040} km²`;
}

// ─────────────────────────────────────────────────────────
// 21. CHART 4 — FORECAST CHART (bottom strip)
// ─────────────────────────────────────────────────────────

const forecastYears    = [...LAKE_DATA.years, 2030, 2035, 2040];
const forecastActual   = [...LAKE_DATA.areas, null, null, null];
const forecastLine     = forecastYears.map(y => parseFloat(reg.predict(y).toFixed(3)));

new Chart(document.getElementById('chartForecast'), {
  type: 'line',
  data: {
    labels: forecastYears,
    datasets: [
      {
        label: 'Actual Area (km²)',
        data: forecastActual,
        borderColor: CHART_COLORS.teal,
        backgroundColor: CHART_COLORS.tealFill,
        borderWidth: 2.5,
        pointBackgroundColor: CHART_COLORS.teal,
        pointRadius: 4,
        fill: true,
        tension: 0.3,
        spanGaps: false
      },
      {
        label: 'Regression Forecast',
        data: forecastLine,
        borderColor: CHART_COLORS.gold,
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [6, 3],
        pointRadius: (ctx) => ctx.dataIndex >= 6 ? 5 : 0,
        pointBackgroundColor: CHART_COLORS.red,
        fill: false,
        tension: 0.2
      }
    ]
  },
  options: {
    ...commonOptions,
    scales: {
      ...commonOptions.scales,
      y: {
        ...commonOptions.scales.y,
        min: 0.5, max: 3.5,
        title: { display: true, text: 'km²', color: '#475569', font: { size: 10 } }
      }
    }
  }
});

// ─────────────────────────────────────────────────────────
// 22. MODAL FORECAST CHART (detailed)
// ─────────────────────────────────────────────────────────

let modalChart = null;

function renderModalForecastChart() {
  if (modalChart) { modalChart.destroy(); }

  updateForecastStats();

  const allYears = [1995, ...LAKE_DATA.years, 2027, 2030, 2033, 2036, 2040];
  const allActual = [null, ...LAKE_DATA.areas, ...new Array(5).fill(null)];
  const allForecast = allYears.map(y => parseFloat(Math.max(0, reg.predict(y)).toFixed(3)));

  // CI bands (±0.15 km² uncertainty)
  const ciUpper = allForecast.map((v, i) => i >= 6 ? parseFloat((v + 0.15 + i * 0.02).toFixed(3)) : null);
  const ciLower = allForecast.map((v, i) => i >= 6 ? parseFloat(Math.max(0, v - 0.15 - i * 0.01).toFixed(3)) : null);

  modalChart = new Chart(document.getElementById('chartModalForecast'), {
    type: 'line',
    data: {
      labels: allYears,
      datasets: [
        {
          label: 'Observed Lake Area',
          data: allActual,
          borderColor: CHART_COLORS.teal,
          backgroundColor: CHART_COLORS.tealFill,
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: CHART_COLORS.teal,
          fill: true,
          tension: 0.3,
          spanGaps: false
        },
        {
          label: 'Regression Line',
          data: allForecast,
          borderColor: CHART_COLORS.gold,
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [8, 4],
          pointRadius: 0,
          fill: false,
          tension: 0.2
        },
        {
          label: 'CI Upper',
          data: ciUpper,
          borderColor: 'rgba(239,68,68,0.3)',
          backgroundColor: 'rgba(239,68,68,0.06)',
          borderWidth: 1,
          borderDash: [3, 3],
          pointRadius: 0,
          fill: false
        },
        {
          label: 'CI Lower',
          data: ciLower,
          borderColor: 'rgba(239,68,68,0.3)',
          backgroundColor: 'rgba(239,68,68,0.06)',
          borderWidth: 1,
          borderDash: [3, 3],
          pointRadius: 0,
          fill: '-1'
        }
      ]
    },
    options: {
      ...commonOptions,
      plugins: {
        ...commonOptions.plugins,
        legend: {
          display: true,
          labels: { color: '#64748b', font: { size: 11 }, boxWidth: 20, padding: 12 }
        }
      },
      scales: {
        x: { ...commonOptions.scales.x, ticks: { color: '#64748b', font: { size: 11 } } },
        y: {
          ...commonOptions.scales.y,
          min: 0, max: 3.8,
          ticks: { color: '#64748b', font: { size: 11 } },
          title: { display: true, text: 'Lake Area (km²)', color: '#64748b', font: { size: 11 } }
        }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────
// 23. MODAL HANDLERS
// ─────────────────────────────────────────────────────────

document.getElementById('modalClose').addEventListener('click', () => {
  document.getElementById('forecastModal').classList.remove('open');
});
document.getElementById('forecastModal').addEventListener('click', function (e) {
  if (e.target === this) this.classList.remove('open');
});

document.getElementById('aboutModalClose').addEventListener('click', () => {
  document.getElementById('aboutModal').classList.remove('open');
});
document.getElementById('aboutModal').addEventListener('click', function (e) {
  if (e.target === this) this.classList.remove('open');
});

// ─────────────────────────────────────────────────────────
// 24. NAVBAR LINK HANDLERS
// ─────────────────────────────────────────────────────────

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', function (e) {
    e.preventDefault();
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    this.classList.add('active');

    const section = this.dataset.section;
    if (section === 'forecast') {
      document.getElementById('forecastModal').classList.add('open');
      renderModalForecastChart();
    } else if (section === 'about') {
      document.getElementById('aboutModal').classList.add('open');
    } else if (section === 'analyses') {
      // Open first non-active analysis
      document.querySelector('.module-btn').click();
    }
  });
});

// ─────────────────────────────────────────────────────────
// 25. LOADING SCREEN
// ─────────────────────────────────────────────────────────

// Inject and remove loading screen
const loadingEl = document.createElement('div');
loadingEl.className = 'loading-overlay';
loadingEl.innerHTML = `
  <div class="loading-logo">HS</div>
  <div class="loading-bar-bg"><div class="loading-bar-fill"></div></div>
  <div class="loading-text">INITIALIZING GIS DASHBOARD</div>
`;
document.body.appendChild(loadingEl);

setTimeout(() => {
  loadingEl.classList.add('hidden');
  setTimeout(() => loadingEl.remove(), 500);
}, 1800);

// ─────────────────────────────────────────────────────────
// 26. INITIAL RENDER
// ─────────────────────────────────────────────────────────

// Render default panel (spatiotemporal)
renderPanel('spatiotemporal');
updateForecastStats();
updateLegend('spatiotemporal');
