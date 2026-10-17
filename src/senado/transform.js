// Where the Largo do Senado model sits in the game.
//
// The Senado data uses x = east, y = north in metres with the fountain at the
// origin. The square runs south-west -> north-east, so the game turns the
// model 38 degrees anticlockwise: the square then runs straight up the screen,
// Av. de Almeida Ribeiro across the bottom and Largo de S. Domingos at the top.
// The play area is a 52 x 148 m strip around the square.

export const SENADO = {
  rotDeg: 38,
  offsetZ: 38, // shifts the strip's centre to the game origin
  halfW: 26,
  halfD: 74,
  keep: 30, // metres of city kept around the play area for scenery
};

const TH = (SENADO.rotDeg * Math.PI) / 180;
const C = Math.cos(TH);
const S = Math.sin(TH);

/** Senado data (x east, y north) -> game [X, Z]. */
export function toGame(x, y) {
  const xr = x * C - y * S;
  const yr = x * S + y * C;
  return [xr, -yr + SENADO.offsetZ];
}

/** Game [X, Z] -> Senado data (x east, y north). */
export function toData(X, Z) {
  const xr = X;
  const yr = -(Z - SENADO.offsetZ);
  return [xr * C + yr * S, -xr * S + yr * C];
}
