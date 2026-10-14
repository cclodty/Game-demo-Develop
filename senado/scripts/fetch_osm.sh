#!/usr/bin/env bash
# Download the OSM extract used by build_data.py (buildings, streets, squares, small features).
# Run from the repo root:  bash senado/scripts/fetch_osm.sh
set -euo pipefail
BBOX="22.1905,113.5360,22.1970,113.5435"   # S,W,N,E around Largo do Senado
OUT="senado/data/osm_raw.json"
read -r -d '' Q <<QUERY || true
[out:json][timeout:60];
(
  way["building"](${BBOX}); relation["building"](${BBOX});
  way["building:part"](${BBOX}); relation["building:part"](${BBOX});
  way["highway"](${BBOX}); relation["highway"](${BBOX});
  way["place"](${BBOX}); way["leisure"](${BBOX}); way["landuse"](${BBOX});
  way["amenity"](${BBOX}); way["man_made"](${BBOX}); way["barrier"](${BBOX}); way["area:highway"](${BBOX});
  node["amenity"](${BBOX}); node["natural"](${BBOX}); node["historic"](${BBOX});
  node["tourism"](${BBOX}); node["man_made"](${BBOX}); node["highway"="street_lamp"](${BBOX});
);
out geom;
QUERY
for i in 1 2 3 4 5 6; do
  if curl -fsS --max-time 120 -A "SenadoMassingStudy/0.1" --data-urlencode "data=${Q}" -o "${OUT}.tmp" https://overpass-api.de/api/interpreter; then
    mv "${OUT}.tmp" "${OUT}"; echo "wrote ${OUT}"; exit 0
  fi
  sleep $((i * 10))
done
echo "Overpass request failed" >&2; exit 1
