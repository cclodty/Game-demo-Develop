#!/usr/bin/env bash
# Download the street-furniture extract used by build_streets.py (signals, crossings, bus stops, bollards, ...).
# Run from the repo root:  bash senado/scripts/fetch_osm_street.sh
set -euo pipefail
BBOX="22.1905,113.5360,22.1970,113.5435"   # S,W,N,E, same box as fetch_osm.sh
OUT="senado/data/osm_street.json"
read -r -d '' Q <<QUERY || true
[out:json][timeout:60];
(
  node["highway"~"crossing|traffic_signals|street_lamp|stop|give_way|bus_stop"](${BBOX});
  node["barrier"](${BBOX});
  node["amenity"~"bench|waste_basket|bicycle_parking|post_box|telephone|drinking_water|vending_machine|clock"](${BBOX});
  node["man_made"](${BBOX});
  node["tourism"~"information|artwork"](${BBOX});
  node["emergency"](${BBOX});
  node["natural"="tree"](${BBOX});
  node["advertising"](${BBOX});
  way["barrier"~"kerb|bollard|fence|planter"](${BBOX});
  way["footway"~"sidewalk|crossing"](${BBOX});
  way["area:highway"](${BBOX});
  way["natural"="tree_row"](${BBOX});
);
out geom;
QUERY
for i in 1 2 3 4 5 6; do
  for url in https://overpass-api.de/api/interpreter https://overpass.kumi.systems/api/interpreter; do
    if curl -fsS --max-time 120 -A "SenadoMassingStudy/0.1" --data-urlencode "data=${Q}" -o "${OUT}.tmp" "$url"; then
      mv "${OUT}.tmp" "${OUT}"; echo "wrote ${OUT}"; exit 0
    fi
  done
  sleep $((i * 10))
done
echo "Overpass request failed" >&2; exit 1
