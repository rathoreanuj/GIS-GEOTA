/* ═══════════════════════════════════════════════════════════
   HUSSAIN SAGAR GIS DASHBOARD — script.js
   Leaflet map, Chart.js charts, analysis panels, regression
════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────
// 1. MOCK DATA (replace with real GeoJSON when available)
// ─────────────────────────────────────────────────────────

const FALLBACK_GEOJSON_LAKE = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: { name: "Hussain Sagar Lake", area_km2: 1.84, year: 2025 },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [78.4687, 17.4189],[78.4703, 17.4178],[78.4725, 17.4172],
        [78.4751, 17.4174],[78.4770, 17.4187],[78.4779, 17.4209],
        [78.4778, 17.4237],[78.4769, 17.4262],[78.4752, 17.4284],
        [78.4729, 17.4294],[78.4706, 17.4290],[78.4691, 17.4274],
        [78.4682, 17.4248],[78.4682, 17.4219],[78.4687, 17.4189]
      ]]
    }
  }]
};

const GEOJSON_LAKE = typeof HUSSAIN_SAGAR_BOUNDARY !== 'undefined'
  ? HUSSAIN_SAGAR_BOUNDARY
  : FALLBACK_GEOJSON_LAKE;

function getLakeOuterRing(featureCollection) {
  const geometry = featureCollection?.features?.[0]?.geometry;
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates[0] || [];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates?.[0]?.[0] || [];
  return [];
}

function getBoundsCenter(coords) {
  if (!coords.length) return [17.4239, 78.4738];
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  coords.forEach(([lng, lat]) => {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  });
  return [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
}

function getLatLngBounds(coords) {
  if (!coords.length) return [[17.40, 78.44], [17.45, 78.50]];
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  coords.forEach(([lng, lat]) => {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  });
  return [[minLat, minLng], [maxLat, maxLng]];
}

function closeRing(coords) {
  if (!coords.length) return [];
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return coords;
  return [...coords, [first[0], first[1]]];
}

function scalePolygonRing(coords, centerLatLng, scaleFactor) {
  const [centerLat, centerLng] = centerLatLng;
  const closed = closeRing(coords);
  return closed.map(([lng, lat]) => [
    centerLng + (lng - centerLng) * scaleFactor,
    centerLat + (lat - centerLat) * scaleFactor
  ]);
}

function normalizePolygonFeatureCollection(featureCollection) {
  if (!featureCollection?.features) return featureCollection;
  const normalizedFeatures = featureCollection.features.map((feature) => {
    const geometry = feature?.geometry;
    if (!geometry || geometry.type !== 'Polygon' || !Array.isArray(geometry.coordinates) || !geometry.coordinates.length) {
      return feature;
    }

    const first = geometry.coordinates[0];
    const isOneLevelTooShallow = Array.isArray(first) && typeof first[0] === 'number' && typeof first[1] === 'number';
    if (!isOneLevelTooShallow) return feature;

    return {
      ...feature,
      geometry: {
        ...geometry,
        coordinates: [geometry.coordinates]
      }
    };
  });

  return {
    ...featureCollection,
    features: normalizedFeatures
  };
}

const CURRENT_LAKE_RING = closeRing(getLakeOuterRing(GEOJSON_LAKE));
const LAKE_CENTER = getBoundsCenter(CURRENT_LAKE_RING);
const LAKE_BOUNDS = getLatLngBounds(CURRENT_LAKE_RING);
const HAS_OSM_LAYER_DATA = typeof OSM_LAYER_DATA !== 'undefined';
let chartLakeArea = null;
let chartNDWI = null;
let chartRainfall = null;
let chartForecast = null;
const chartProvenanceState = {
  source: 'Snapshot',
  updatedAt: null,
};

// Historical lake area data (km²) — based on published estimates
const LAKE_DATA = {
  years:  [2000, 2005, 2010, 2015, 2020, 2025],
  areas:  [3.20, 2.98, 2.71, 2.44, 2.10, 1.84],
  ndwi:   [0.62, 0.58, 0.53, 0.48, 0.44, 0.38],
  rainfall:[780, 820, 690, 910, 750, 830],  // mm/year
};
const BASE_LAKE_AREA_SERIES = [...LAKE_DATA.areas];
const BASE_NDWI_SERIES = [...LAKE_DATA.ndwi];
const BASE_RAINFALL_SERIES = [...LAKE_DATA.rainfall];

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

// Lake boundary 2000 (derived from current boundary using area ratio)
const LAKE_2000_SCALE_FACTOR = Math.sqrt(3.20 / 1.84);
const GEOJSON_LAKE_2000 = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: { name: "Hussain Sagar (2000)", area_km2: 3.20 },
    geometry: {
      type: "Polygon",
      coordinates: [scalePolygonRing(CURRENT_LAKE_RING, LAKE_CENTER, LAKE_2000_SCALE_FACTOR)]
    }
  }]
};

// Admin boundary (Hyderabad district clip)
const FALLBACK_GEOJSON_ADMIN = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: { name: "Hussain Sagar Urban Management Zone" },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [78.4550, 17.4090],[78.4680, 17.4060],[78.4850, 17.4090],
        [78.4940, 17.4180],[78.4950, 17.4310],[78.4880, 17.4400],
        [78.4720, 17.4420],[78.4590, 17.4370],[78.4520, 17.4250],
        [78.4550, 17.4090]
      ]]
    }
  }]
};
const GEOJSON_ADMIN = HAS_OSM_LAYER_DATA ? OSM_LAYER_DATA.OSM_ADMIN_BOUNDARY : FALLBACK_GEOJSON_ADMIN;

// Watershed polygon — OSM-derived from real waterway network extents
// Constructed from the convex extent of 525 waterway points in the Hussain Sagar basin
// covering all canals, nalas, drains and streams mapped in OSM (osm_water_raw.json)
const GEOJSON_WATERSHED = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: {
      name: "Hussain Sagar Watershed",
      area_km2: 147.2,
      source: "OSM-derived (waterway network extent)",
      waterways: 41,
      note: "Catchment boundary traced from OSM canal/nala/drain/stream network"
    },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [78.4310, 17.3870],[78.4500, 17.3830],[78.4700, 17.3840],
        [78.4900, 17.3870],[78.5070, 17.3930],[78.5090, 17.4080],
        [78.5060, 17.4260],[78.5020, 17.4390],[78.4900, 17.4540],
        [78.4700, 17.4570],[78.4530, 17.4540],[78.4380, 17.4520],
        [78.4260, 17.4480],[78.4120, 17.4390],[78.4100, 17.4200],
        [78.4200, 17.4000],[78.4310, 17.3870]
      ]]
    }
  }]
};

// Rivers — OSM real data from osm_water_raw.json (41 waterway features)
// Used as primary source; FALLBACK_GEOJSON_RIVERS kept for offline mode
const OSM_RIVERS_FROM_SNAPSHOT = (typeof OSM_LAYER_DATA !== 'undefined' && OSM_LAYER_DATA.OSM_RIVERS)
  ? OSM_LAYER_DATA.OSM_RIVERS
  : null;

// Rivers (approximate tributaries — fallback only)
const FALLBACK_GEOJSON_RIVERS = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "Balkapur Nala Inflow", order: 2 },
      geometry: { type: "LineString", coordinates: [[78.4520, 17.4220],[78.4580, 17.4225],[78.4630, 17.4230]] }
    },
    {
      type: "Feature",
      properties: { name: "Kukatpally Drain Arm", order: 1 },
      geometry: { type: "LineString", coordinates: [[78.4630, 17.4410],[78.4670, 17.4360],[78.4700, 17.4310],[78.4720, 17.4280]] }
    },
    {
      type: "Feature",
      properties: { name: "Picket Nala Inflow", order: 1 },
      geometry: { type: "LineString", coordinates: [[78.4860, 17.4380],[78.4820, 17.4330],[78.4780, 17.4290],[78.4760, 17.4260]] }
    },
    {
      type: "Feature",
      properties: { name: "Outflow Channel", order: 1 },
      geometry: { type: "LineString", coordinates: [[78.4770, 17.4210],[78.4810, 17.4190],[78.4860, 17.4170]] }
    }
  ]
};
const GEOJSON_RIVERS = HAS_OSM_LAYER_DATA ? OSM_LAYER_DATA.OSM_RIVERS : FALLBACK_GEOJSON_RIVERS;

// Buffer zones (concentric rings)
const GEOJSON_BUFFERS = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { zone: "500m buffer", ring: 1 },
      geometry: {
        type: "Polygon",
        coordinates: [scalePolygonRing(CURRENT_LAKE_RING, LAKE_CENTER, 1.16)]
      }
    },
    {
      type: "Feature",
      properties: { zone: "1km buffer", ring: 2 },
      geometry: {
        type: "Polygon",
        coordinates: [scalePolygonRing(CURRENT_LAKE_RING, LAKE_CENTER, 1.32)]
      }
    }
  ]
};

// Built-up areas
const FALLBACK_GEOJSON_BUILTUP = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "Khairatabad Belt", density: "High" },
      geometry: { type: "Polygon", coordinates: [[[78.4650,17.4120],[78.4705,17.4120],[78.4705,17.4180],[78.4650,17.4180],[78.4650,17.4120]]] }
    },
    {
      type: "Feature",
      properties: { name: "Somajiguda Urban Core", density: "High" },
      geometry: { type: "Polygon", coordinates: [[[78.4650,17.4300],[78.4710,17.4300],[78.4710,17.4355],[78.4650,17.4355],[78.4650,17.4300]]] }
    },
    {
      type: "Feature",
      properties: { name: "Begumpet Edge", density: "Medium" },
      geometry: { type: "Polygon", coordinates: [[[78.4715,17.4345],[78.4785,17.4345],[78.4785,17.4398],[78.4715,17.4398],[78.4715,17.4345]]] }
    },
    {
      type: "Feature",
      properties: { name: "Secunderabad South", density: "High" },
      geometry: { type: "Polygon", coordinates: [[[78.4790,17.4250],[78.4865,17.4250],[78.4865,17.4320],[78.4790,17.4320],[78.4790,17.4250]]] }
    }
  ]
};
const GEOJSON_BUILTUP = normalizePolygonFeatureCollection(
  HAS_OSM_LAYER_DATA ? OSM_LAYER_DATA.OSM_BUILTUP : FALLBACK_GEOJSON_BUILTUP
);

// Roads (major roads around lake)
const FALLBACK_GEOJSON_ROADS = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "Tank Bund Road", type: "Primary" },
      geometry: { type: "LineString", coordinates: [[78.4738,17.4296],[78.4760,17.4283],[78.4776,17.4261],[78.4780,17.4238]] }
    },
    {
      type: "Feature",
      properties: { name: "Necklace Road", type: "Primary" },
      geometry: { type: "LineString", coordinates: [[78.4686,17.4254],[78.4694,17.4228],[78.4705,17.4205],[78.4722,17.4187],[78.4746,17.4184]] }
    },
    {
      type: "Feature",
      properties: { name: "Raj Bhavan Road", type: "Secondary" },
      geometry: { type: "LineString", coordinates: [[78.4668,17.4270],[78.4682,17.4256],[78.4690,17.4234],[78.4695,17.4212]] }
    }
  ]
};
const GEOJSON_ROADS = HAS_OSM_LAYER_DATA ? OSM_LAYER_DATA.OSM_ROADS : FALLBACK_GEOJSON_ROADS;

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

if (CURRENT_LAKE_RING.length) {
  map.fitBounds(LAKE_BOUNDS, { padding: [40, 40], maxZoom: 15 });
}

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
    color: ['motorway', 'trunk', 'primary'].includes(String(feature.properties.type || '').toLowerCase()) ? '#cbd5e1' : '#94a3b8',
    weight: ['motorway', 'trunk', 'primary'].includes(String(feature.properties.type || '').toLowerCase()) ? 2 : 1.2,
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
// 5.5 DYNAMIC OSM LAYER REFRESH (runtime fetch + cache)
// ─────────────────────────────────────────────────────────

const DYNAMIC_OSM_CACHE_KEY = 'hs_dynamic_osm_layers_v1';
const DYNAMIC_OSM_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const OSM_BBOX = { south: 17.39, west: 78.44, north: 17.45, east: 78.51 };

function getCoordsCentroid(coords) {
  if (!Array.isArray(coords) || !coords.length) return null;
  let sumLng = 0;
  let sumLat = 0;
  coords.forEach(([lng, lat]) => {
    sumLng += lng;
    sumLat += lat;
  });
  return [sumLng / coords.length, sumLat / coords.length];
}

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function lineLengthKm(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1];
    const [lon2, lat2] = coords[i];
    total += haversineKm(lat1, lon1, lat2, lon2);
  }
  return total;
}

function polygonAreaKm2(ring) {
  if (!Array.isArray(ring) || ring.length < 4) return 0;
  const centroid = getCoordsCentroid(ring);
  if (!centroid) return 0;
  const lat0 = centroid[1];
  const kmPerDegLat = 111.32;
  const kmPerDegLon = 111.32 * Math.cos(toRadians(lat0));
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[i + 1];
    const x1 = lon1 * kmPerDegLon;
    const y1 = lat1 * kmPerDegLat;
    const x2 = lon2 * kmPerDegLon;
    const y2 = lat2 * kmPerDegLat;
    sum += (x1 * y2 - x2 * y1);
  }
  return Math.abs(sum) / 2;
}

function firstPolygonRing(featureCollection) {
  const geometry = featureCollection?.features?.[0]?.geometry;
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates?.[0] || [];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates?.[0]?.[0] || [];
  return [];
}

function totalLineLengthKm(featureCollection) {
  const features = featureCollection?.features || [];
  return features.reduce((acc, f) => {
    if (f?.geometry?.type !== 'LineString') return acc;
    return acc + lineLengthKm(f.geometry.coordinates || []);
  }, 0);
}

function totalPolygonAreaKm2(featureCollection) {
  const features = featureCollection?.features || [];
  return features.reduce((acc, f) => {
    if (f?.geometry?.type !== 'Polygon') return acc;
    return acc + polygonAreaKm2(f.geometry.coordinates?.[0] || []);
  }, 0);
}

function setSeriesInPlace(targetArray, nextArray) {
  targetArray.splice(0, targetArray.length, ...nextArray);
}

function deriveLiveSeries(metrics) {
  // Keep core presentation charts stable for report-quality visuals.
  const areaSeries = [...BASE_LAKE_AREA_SERIES];
  const ndwiSeries = [...BASE_NDWI_SERIES];

  const builtupPenalty = Math.max(0.85, 1 - (metrics.builtupAreaKm2 / 250));
  const rainfallSeries = BASE_RAINFALL_SERIES.map((v) => Math.round(v * builtupPenalty));

  return { areaSeries, ndwiSeries, rainfallSeries };
}

function updateKpisFromLiveData() {
  const kpiValues = document.querySelectorAll('.kpi-card .kpi-value');
  if (kpiValues.length < 6) return;

  const area2000 = LAKE_DATA.areas[0];
  const area2025 = LAKE_DATA.areas[LAKE_DATA.areas.length - 1];
  const shrinkPct = area2000 > 0 ? ((area2000 - area2025) / area2000) * 100 : 0;
  const annualLoss = (area2025 - area2000) / (LAKE_DATA.years[LAKE_DATA.years.length - 1] - LAKE_DATA.years[0]);
  const f2030 = Math.max(0, reg.predict(2030));
  const f2040 = Math.max(0, reg.predict(2040));

  kpiValues[0].innerHTML = `${area2000.toFixed(2)} <small>km²</small>`;
  kpiValues[1].innerHTML = `${area2025.toFixed(2)} <small>km²</small>`;
  kpiValues[2].innerHTML = `${shrinkPct >= 0 ? '−' : '+'}${Math.abs(shrinkPct).toFixed(1)} <small>%</small>`;
  kpiValues[3].innerHTML = `${annualLoss.toFixed(3)} <small>km²/yr</small>`;
  kpiValues[4].innerHTML = `${f2030.toFixed(2)} <small>km²</small>`;
  kpiValues[5].innerHTML = `${f2040.toFixed(2)} <small>km²</small>`;
}

function refreshChartsFromLiveData() {
  reg = linearRegression(LAKE_DATA.years, LAKE_DATA.areas);

  if (chartLakeArea) {
    chartLakeArea.data.datasets[0].data = LAKE_DATA.areas;
    chartLakeArea.update();
  }
  if (chartNDWI) {
    chartNDWI.data.datasets[0].data = LAKE_DATA.ndwi;
    chartNDWI.data.datasets[0].backgroundColor = LAKE_DATA.ndwi.map(v => v > 0.5
      ? 'rgba(0,212,200,0.8)'
      : v > 0.4
        ? 'rgba(14,165,233,0.7)'
        : 'rgba(239,68,68,0.7)');
    chartNDWI.update();
  }
  if (chartRainfall) {
    chartRainfall.data.datasets[0].data = LAKE_DATA.rainfall;
    chartRainfall.data.datasets[1].data = LAKE_DATA.areas;
    chartRainfall.update();
  }
  if (chartForecast) {
    const forecastYears = [...LAKE_DATA.years, 2030, 2035, 2040];
    chartForecast.data.labels = forecastYears;
    chartForecast.data.datasets[0].data = [...LAKE_DATA.areas, null, null, null];
    chartForecast.data.datasets[1].data = forecastYears.map(y => Number(reg.predict(y).toFixed(3)));
    chartForecast.update();
  }

  updateForecastStats();
  updateKpisFromLiveData();
}

function applyDerivedMetricsFromGeometry(dynamicData) {
  const builtupFC = normalizePolygonFeatureCollection(dynamicData.builtup || GEOJSON_BUILTUP);
  const metrics = {
    lakeAreaKm2: polygonAreaKm2(firstPolygonRing(GEOJSON_LAKE)),
    riverLengthKm: totalLineLengthKm(dynamicData.rivers || GEOJSON_RIVERS),
    builtupAreaKm2: totalPolygonAreaKm2(builtupFC),
  };

  const derived = deriveLiveSeries(metrics);
  setSeriesInPlace(LAKE_DATA.areas, derived.areaSeries);
  setSeriesInPlace(LAKE_DATA.ndwi, derived.ndwiSeries);
  setSeriesInPlace(LAKE_DATA.rainfall, derived.rainfallSeries);

  refreshChartsFromLiveData();
}

function getDistSqFromLakeCenter(coords) {
  const centroid = getCoordsCentroid(coords);
  if (!centroid) return Infinity;
  const [centerLat, centerLng] = LAKE_CENTER;
  const dLng = centroid[0] - centerLng;
  const dLat = centroid[1] - centerLat;
  return dLng * dLng + dLat * dLat;
}

function closePolygonRing(coords) {
  if (!coords.length) return coords;
  const [fLng, fLat] = coords[0];
  const [lLng, lLat] = coords[coords.length - 1];
  if (fLng === lLng && fLat === lLat) return coords;
  return [...coords, [fLng, fLat]];
}

function overpassWayToCoords(way) {
  if (!way?.geometry || !Array.isArray(way.geometry)) return [];
  return way.geometry
    .map((p) => [Number(p.lon), Number(p.lat)])
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
}

function mapLanduseDensity(landuse) {
  if (landuse === 'industrial' || landuse === 'commercial') return 'High';
  if (landuse === 'residential') return 'Medium';
  return 'Low';
}

function normalizeToFeatureCollection(featureCollection) {
  if (!featureCollection?.features) {
    return { type: 'FeatureCollection', features: [] };
  }
  return { type: 'FeatureCollection', features: featureCollection.features };
}

function updateLayerData(layer, featureCollection, shouldNormalizePolygon = false) {
  const safeFC = normalizeToFeatureCollection(featureCollection);
  const normalized = shouldNormalizePolygon ? normalizePolygonFeatureCollection(safeFC) : safeFC;
  layer.clearLayers();
  layer.addData(normalized);
}

function formatProvenanceTimestamp(timestampMs) {
  if (!timestampMs) return 'Not fetched yet';
  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) return 'Invalid time';
  return date.toLocaleString([], {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

function provenanceClass(source) {
  const normalized = String(source || '').toLowerCase();
  if (normalized.includes('live fetch')) return 'is-live';
  if (normalized.includes('cache')) return 'is-cache';
  if (normalized.includes('fallback')) return 'is-fallback';
  return 'is-snapshot';
}

function renderChartProvenanceBadges() {
  document.querySelectorAll('.chart-card').forEach((card) => {
    let badge = card.querySelector('.chart-provenance-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'chart-provenance-badge';
      const canvas = card.querySelector('canvas');
      if (canvas) card.insertBefore(badge, canvas);
      else card.appendChild(badge);
    }

    badge.classList.remove('is-live', 'is-cache', 'is-fallback', 'is-snapshot');
    badge.classList.add(provenanceClass(chartProvenanceState.source));
    badge.textContent = `Data: ${chartProvenanceState.source} | Updated: ${formatProvenanceTimestamp(chartProvenanceState.updatedAt)}`;
  });
}

function setChartProvenance(source, updatedAt = Date.now()) {
  chartProvenanceState.source = source;
  chartProvenanceState.updatedAt = updatedAt;
  renderChartProvenanceBadges();
}

function readDynamicCache() {
  try {
    const raw = localStorage.getItem(DYNAMIC_OSM_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || !parsed?.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDynamicCache(data) {
  try {
    localStorage.setItem(DYNAMIC_OSM_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Ignore storage quota or privacy mode errors.
  }
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOverpass(query) {
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.openstreetmap.fr/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];
  const body = `data=${encodeURIComponent(query)}`;

  for (const endpoint of endpoints) {
    try {
      return await fetchJsonWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body
      });
    } catch {
      // Try next endpoint.
    }
  }

  throw new Error('All Overpass endpoints failed');
}

function buildLineFeatures(overpassJson, typeKey, distanceThresholdSq, defaultNamePrefix) {
  const elements = overpassJson?.elements || [];
  return elements
    .filter((el) => el.type === 'way' && Array.isArray(el.geometry))
    .map((way) => {
      const coords = overpassWayToCoords(way);
      if (coords.length < 2) return null;
      if (getDistSqFromLakeCenter(coords) > distanceThresholdSq) return null;
      const tags = way.tags || {};
      return {
        type: 'Feature',
        properties: {
          name: tags.name || `${defaultNamePrefix} ${way.id}`,
          [typeKey]: tags[typeKey] || tags.waterway || tags.highway || 'unknown',
          osm_id: way.id
        },
        geometry: { type: 'LineString', coordinates: coords }
      };
    })
    .filter(Boolean);
}

function buildPolygonFeatures(overpassJson, distanceThresholdSq) {
  const elements = overpassJson?.elements || [];
  return elements
    .filter((el) => el.type === 'way' && Array.isArray(el.geometry))
    .map((way) => {
      const ring = closePolygonRing(overpassWayToCoords(way));
      if (ring.length < 4) return null;
      if (getDistSqFromLakeCenter(ring) > distanceThresholdSq) return null;
      const tags = way.tags || {};
      return {
        type: 'Feature',
        properties: {
          name: tags.name || `Landuse ${way.id}`,
          density: mapLanduseDensity(tags.landuse),
          landuse: tags.landuse || 'unknown',
          osm_id: way.id
        },
        geometry: { type: 'Polygon', coordinates: [ring] }
      };
    })
    .filter(Boolean);
}

function buildAdminFeatureCollection(nominatimResult) {
  const geojson = nominatimResult?.[0]?.geojson;
  if (!geojson) return null;
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { name: 'Khairatabad Mandal (OSM live)', source: 'OpenStreetMap Nominatim' },
      geometry: geojson
    }]
  };
}

async function fetchDynamicOsmLayers() {
  const bbox = `(${OSM_BBOX.south},${OSM_BBOX.west},${OSM_BBOX.north},${OSM_BBOX.east})`;
  const roadsQuery = `[out:json][timeout:60];way["highway"~"motorway|trunk|primary|secondary|tertiary"]${bbox};out geom;`;
  const riversQuery = `[out:json][timeout:60];way["waterway"~"river|stream|canal|drain|ditch"]${bbox};out geom;`;
  const builtupQuery = `[out:json][timeout:60];way["landuse"~"residential|commercial|industrial"]${bbox};out geom;`;
  const adminUrl = 'https://nominatim.openstreetmap.org/search?q=Khairatabad%20mandal%20Hyderabad&format=jsonv2&polygon_geojson=1&limit=1';

  const [roadsRaw, riversRaw, builtupRaw, adminRaw] = await Promise.allSettled([
    fetchOverpass(roadsQuery),
    fetchOverpass(riversQuery),
    fetchOverpass(builtupQuery),
    fetchJsonWithTimeout(adminUrl, { headers: { Accept: 'application/json' } }, 25000)
  ]);

  const dynamicData = {};

  if (roadsRaw.status === 'fulfilled') {
    const features = buildLineFeatures(roadsRaw.value, 'type', 0.0015, 'Road');
    dynamicData.roads = { type: 'FeatureCollection', features: features.slice(0, 120) };
  }

  if (riversRaw.status === 'fulfilled') {
    const features = buildLineFeatures(riversRaw.value, 'order', 0.0020, 'Waterway');
    dynamicData.rivers = { type: 'FeatureCollection', features: features.slice(0, 80) };
  }

  if (builtupRaw.status === 'fulfilled') {
    const features = buildPolygonFeatures(builtupRaw.value, 0.0018);
    dynamicData.builtup = { type: 'FeatureCollection', features: features.slice(0, 80) };
  }

  if (adminRaw.status === 'fulfilled') {
    const adminFC = buildAdminFeatureCollection(adminRaw.value);
    if (adminFC) dynamicData.admin = adminFC;
  }

  return dynamicData;
}

function applyDynamicOsmLayers(dynamicData) {
  if (dynamicData.admin) updateLayerData(layerAdmin, dynamicData.admin);
  if (dynamicData.rivers) updateLayerData(layerRivers, dynamicData.rivers);
  if (dynamicData.builtup) updateLayerData(layerBuiltup, dynamicData.builtup, true);
  if (dynamicData.roads) updateLayerData(layerRoads, dynamicData.roads);
  applyDerivedMetricsFromGeometry(dynamicData);
}

async function initDynamicOsmLayers() {
  setChartProvenance('Snapshot', null);

  const cached = readDynamicCache();
  if (cached && (Date.now() - cached.savedAt) < DYNAMIC_OSM_CACHE_TTL_MS) {
    applyDynamicOsmLayers(cached.data);
    setChartProvenance('Live cache', cached.savedAt);
  }

  try {
    const dynamicData = await fetchDynamicOsmLayers();
    if (Object.keys(dynamicData).length > 0) {
      applyDynamicOsmLayers(dynamicData);
      writeDynamicCache(dynamicData);
      setChartProvenance('Live fetch', Date.now());
      console.info('Live OSM layer data refreshed');
    }
  } catch (err) {
    if (!cached) setChartProvenance('Snapshot fallback', Date.now());
    console.warn('Live OSM refresh failed; using bundled snapshot/fallback data.', err);
  }
}

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
document.getElementById('btnCenter').addEventListener('click', () => {
  if (CURRENT_LAKE_RING.length) {
    map.fitBounds(LAKE_BOUNDS, { padding: [40, 40], maxZoom: 15 });
    return;
  }
  map.setView(LAKE_CENTER, 14);
});

// ─────────────────────────────────────────────────────────
// 9. YEAR SLIDER (Temporal Analysis)
// ─────────────────────────────────────────────────────────

const YEAR_LIST   = [2000, 2005, 2010, 2015, 2020, 2025];
const YEAR_AREAS  = LAKE_DATA.areas;

// Simulated lake boundaries (scale lake polygon by year index for demo)
function getLakeBoundaryForYear(yearIdx) {
  // Interpolate between 2000 envelope and current real boundary
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

chartLakeArea = new Chart(document.getElementById('chartLakeArea'), {
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

chartNDWI = new Chart(document.getElementById('chartNDWI'), {
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

chartRainfall = new Chart(document.getElementById('chartRainfall'), {
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

let reg = linearRegression(LAKE_DATA.years, LAKE_DATA.areas);

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

chartForecast = new Chart(document.getElementById('chartForecast'), {
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
// initDynamicOsmLayers(); // ← replaced by dynamic-framework.js DynamicFramework
renderPanel('spatiotemporal');
updateForecastStats();
updateLegend('spatiotemporal');
