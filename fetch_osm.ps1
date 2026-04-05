$ErrorActionPreference='Stop'
function Fetch-Overpass($query, $outfile){
  $endpoints=@('https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.openstreetmap.fr/api/interpreter')
  foreach($ep in $endpoints){
    try {
      $body = "data=" + [uri]::EscapeDataString($query)
      $resp = Invoke-RestMethod -Method Post -Uri $ep -ContentType 'application/x-www-form-urlencoded; charset=UTF-8' -Body $body
      $resp | ConvertTo-Json -Depth 100 | Set-Content -Path $outfile -Encoding UTF8
      Write-Output "ok $outfile via $ep"
      return $true
    } catch {
      Write-Output "fail $ep"
    }
  }
  return $false
}

$qAdmin='[out:json][timeout:90];relation["boundary"="administrative"]["admin_level"="8"](17.37,78.40,17.47,78.55);out body;>;out skel qt;'
$qRoads='[out:json][timeout:90];way["highway"~"motorway|trunk|primary|secondary|tertiary"](17.39,78.44,17.45,78.51);out geom;'
$qWater='[out:json][timeout:90];way["waterway"~"river|stream|canal|drain|ditch"](17.39,78.44,17.45,78.51);out geom;'
$qBuilt='[out:json][timeout:90];way["landuse"~"residential|commercial|industrial"](17.39,78.44,17.45,78.51);out geom;'

$r1=Fetch-Overpass $qAdmin 'osm_admin_raw.json'
$r2=Fetch-Overpass $qRoads 'osm_roads_raw.json'
$r3=Fetch-Overpass $qWater 'osm_water_raw.json'
$r4=Fetch-Overpass $qBuilt 'osm_built_raw.json'
Write-Output ("done admin=$r1 roads=$r2 water=$r3 built=$r4")
