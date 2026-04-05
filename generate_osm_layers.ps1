$ErrorActionPreference='Stop'
$centerLat = 17.4239
$centerLon = 78.4738

function Dist2($lat,$lon){
  $dLat = $lat - $centerLat
  $dLon = $lon - $centerLon
  return ($dLat*$dLat + $dLon*$dLon)
}

function WayToCoords($w){
  $coords = @()
  foreach($p in $w.geometry){
    $lon = [double]$p.lon
    $lat = [double]$p.lat
    $coords += ,@($lon,$lat)
  }
  return $coords
}

function NormalizeCoordPair($coord){
  $candidate = $coord
  while($candidate -is [System.Array] -and $candidate.Count -gt 0 -and $candidate[0] -is [System.Array]){
    $candidate = $candidate[0]
  }
  if(-not ($candidate -is [System.Array]) -or $candidate.Count -lt 2){ return $null }
  return @([double]$candidate[0], [double]$candidate[1])
}

function ToScalarDouble($value){
  $candidate = $value
  while($candidate -is [System.Array] -and $candidate.Count -gt 0){
    $candidate = $candidate[0]
  }
  return [double]$candidate
}

function PolyAreaApprox($coords){
  if($coords.Count -lt 4){ return 0 }
  $sum = 0.0
  for($i=0; $i -lt $coords.Count-1; $i++){
    $a = NormalizeCoordPair $coords[$i]
    $b = NormalizeCoordPair $coords[$i+1]
    if(-not $a -or -not $b){ continue }
    $x1 = [double]$a[0]; $y1 = [double]$a[1]
    $x2 = [double]$b[0]; $y2 = [double]$b[1]
    $sum += ($x1*$y2 - $x2*$y1)
  }
  return [math]::Abs($sum/2.0)
}

function MeanLatLon($coords){
  $lat = [double]0.0
  $lon = [double]0.0
  $count = 0
  foreach($c in $coords){
    $pair = NormalizeCoordPair $c
    if(-not $pair){ continue }
    $lon = [double]$lon + (ToScalarDouble $pair[0])
    $lat = [double]$lat + (ToScalarDouble $pair[1])
    $count++
  }
  $n = [double][math]::Max(1,$count)
  return @([double]($lat / $n), [double]($lon / $n))
}

$roadsRaw = Get-Content 'osm_roads_raw.json' -Raw | ConvertFrom-Json
$roadsWays = @($roadsRaw.elements | Where-Object { $_.type -eq 'way' -and $_.geometry })
$roadFeatures = @()
foreach($w in $roadsWays){
  $coords = WayToCoords $w
  $m = MeanLatLon $coords
  if((Dist2 $m[0] $m[1]) -gt 0.0010){ continue }
  $name = if($w.tags.name){ [string]$w.tags.name } else { "Road $($w.id)" }
  $rtype = if($w.tags.highway){ [string]$w.tags.highway } else { 'road' }
  $roadFeatures += [pscustomobject]@{ type='Feature'; properties=@{ name=$name; type=$rtype; osm_id=$w.id }; geometry=@{ type='LineString'; coordinates=$coords } }
}
$roadFeatures = @($roadFeatures | Sort-Object { $_.properties.type }, { $_.properties.name } | Select-Object -First 80)

$waterRaw = Get-Content 'osm_water_raw.json' -Raw | ConvertFrom-Json
$waterWays = @($waterRaw.elements | Where-Object { $_.type -eq 'way' -and $_.geometry })
$waterFeatures = @()
foreach($w in $waterWays){
  $coords = WayToCoords $w
  $m = MeanLatLon $coords
  if((Dist2 $m[0] $m[1]) -gt 0.0014){ continue }
  $name = if($w.tags.name){ [string]$w.tags.name } else { "Waterway $($w.id)" }
  $ord = if($w.tags.waterway){ [string]$w.tags.waterway } else { 'waterway' }
  $waterFeatures += [pscustomobject]@{ type='Feature'; properties=@{ name=$name; order=$ord; osm_id=$w.id }; geometry=@{ type='LineString'; coordinates=$coords } }
}
$waterFeatures = @($waterFeatures | Sort-Object { $_.properties.name } | Select-Object -First 40)

$builtRaw = Get-Content 'osm_built_raw.json' -Raw | ConvertFrom-Json
$builtWays = @($builtRaw.elements | Where-Object { $_.type -eq 'way' -and $_.geometry -and $_.geometry.Count -ge 4 })
$builtFeatures = @()
foreach($w in $builtWays){
  $coords = WayToCoords $w
  if($coords[0][0] -ne $coords[$coords.Count-1][0] -or $coords[0][1] -ne $coords[$coords.Count-1][1]){ $coords += ,@($coords[0][0],$coords[0][1]) }
  $m = MeanLatLon $coords
  if((Dist2 $m[0] $m[1]) -gt 0.0012){ continue }
  $area = PolyAreaApprox $coords
  if($area -lt 0.0000008){ continue }
  $name = if($w.tags.name){ [string]$w.tags.name } else { "Landuse $($w.id)" }
  $density = if($w.tags.landuse -eq 'commercial' -or $w.tags.landuse -eq 'industrial'){ 'High' } elseif($w.tags.landuse -eq 'residential'){ 'Medium' } else { 'Low' }
  $builtFeatures += [pscustomobject]@{ type='Feature'; properties=@{ name=$name; density=$density; landuse=$w.tags.landuse; osm_id=$w.id; approx_area=$area }; geometry=@{ type='Polygon'; coordinates=, $coords } }
}
$builtFeatures = @($builtFeatures | Sort-Object { -1.0 * $_.properties.approx_area } | Select-Object -First 30)
foreach($f in $builtFeatures){ $null = $f.properties.Remove('approx_area') }

# Admin polygon from OSM Nominatim
$adminGeo = $null
try {
  $adminRes = Invoke-RestMethod -Uri 'https://nominatim.openstreetmap.org/search?q=Khairatabad%20mandal%20Hyderabad&format=jsonv2&polygon_geojson=1&limit=1' -Headers @{ 'User-Agent'='copilot-local' }
  if($adminRes -and $adminRes.Count -gt 0){ $adminGeo = $adminRes[0].geojson }
} catch {}
if(-not $adminGeo){
  $adminGeo = @{ type='Polygon'; coordinates=@(@(@(78.4550,17.4090),@(78.4680,17.4060),@(78.4850,17.4090),@(78.4940,17.4180),@(78.4950,17.4310),@(78.4880,17.4400),@(78.4720,17.4420),@(78.4590,17.4370),@(78.4520,17.4250),@(78.4550,17.4090))) }
}

$adminFC = [pscustomobject]@{ type='FeatureCollection'; features=@([pscustomobject]@{ type='Feature'; properties=@{ name='Khairatabad Mandal (OSM)'; source='OpenStreetMap' }; geometry=$adminGeo }) }
$roadsFC = [pscustomobject]@{ type='FeatureCollection'; features=$roadFeatures }
$riversFC = [pscustomobject]@{ type='FeatureCollection'; features=$waterFeatures }
$builtFC = [pscustomobject]@{ type='FeatureCollection'; features=$builtFeatures }

$payload = [pscustomobject]@{
  OSM_ADMIN_BOUNDARY = $adminFC
  OSM_RIVERS = $riversFC
  OSM_BUILTUP = $builtFC
  OSM_ROADS = $roadsFC
}
$json = $payload | ConvertTo-Json -Depth 100 -Compress
Set-Content -Path 'osm-layer-data.js' -Value ("const OSM_LAYER_DATA = " + $json + ";") -Encoding UTF8
Get-Item 'osm-layer-data.js' | Select-Object Name,Length
