/**
 * Scores out of ten on a regular lat/lng lattice, and the painting of them as a
 * smooth gradient. Shared by the 2D and 3D maps, which place the pixels
 * differently but colour them the same.
 */
export interface ScoreField {
  // The first row and column, which the rest are stepped from.
  south: number;
  west: number;
  latStep: number;
  lonStep: number;
  rows: number;
  cols: number;
  // Row by row from the south-west corner. Null where there is nothing to show.
  values: (number | null)[];
}

// The colours the forecast panel gives each label, placed at the middle of the
// label's range so the gradient passes through each where that label applies:
// grey for a dull evening, through amber and orange, to fuchsia for the best.
const STOPS: [number, [number, number, number]][] = [
  [0, [51, 65, 85]],
  [1.25, [51, 65, 85]],
  [3.5, [100, 116, 139]],
  [5.5, [245, 158, 11]],
  [7.25, [249, 115, 22]],
  [9, [217, 70, 239]],
  [10, [217, 70, 239]],
];

/** The same gradient as CSS, for a legend. */
export const SCORE_GRADIENT_CSS = `linear-gradient(to right, ${STOPS.map(
  ([score, [r, g, b]]) => `rgb(${r} ${g} ${b}) ${score * 10}%`,
).join(', ')})`;

// A dull evening is the usual one, and its grey laid at full strength over most
// of the map would bury the map. So the colour thins out toward the dull end and
// only the scores worth noticing are painted solidly.
const DULL_ALPHA = 0.4;
const SOLID_FROM_SCORE = 5.5;

// One colour per tenth of a point, worked out once.
const LUT_SIZE = 101;
const LUT = new Uint8ClampedArray(LUT_SIZE * 4);
for (let i = 0; i < LUT_SIZE; i++) {
  const score = i / 10;
  let stop = 1;
  while (stop < STOPS.length - 1 && score > STOPS[stop][0]) stop++;
  const [x0, from] = STOPS[stop - 1];
  const [x1, to] = STOPS[stop];
  const t = (score - x0) / (x1 - x0);
  for (let channel = 0; channel < 3; channel++) {
    LUT[i * 4 + channel] = from[channel] + (to[channel] - from[channel]) * t;
  }
  LUT[i * 4 + 3] = 255 * (DULL_ALPHA + (1 - DULL_ALPHA) * Math.min(score / SOLID_FROM_SCORE, 1));
}

/**
 * The score at a place, interpolated between the four lattice points around it.
 * Null outside the lattice, or where none of the four has a score. A corner
 * without one is left out rather than counted as zero.
 */
export function sampleField(field: ScoreField, lat: number, lng: number): number | null {
  // Brought round to the lattice's own turn of the globe, as a map scrolled past
  // the antimeridian reports longitudes beyond ±180.
  const lon = lng - 360 * Math.floor((lng - field.west) / 360);
  const row = (lat - field.south) / field.latStep;
  const col = (lon - field.west) / field.lonStep;
  if (row < 0 || col < 0 || row > field.rows - 1 || col > field.cols - 1) return null;

  const row0 = Math.min(Math.floor(row), field.rows - 2);
  const col0 = Math.min(Math.floor(col), field.cols - 2);
  const fRow = row - row0;
  const fCol = col - col0;

  let total = 0;
  let weight = 0;
  for (let dRow = 0; dRow <= 1; dRow++) {
    for (let dCol = 0; dCol <= 1; dCol++) {
      const value = field.values[(row0 + dRow) * field.cols + col0 + dCol];
      if (value === null || value === undefined) continue;
      const w = (dRow ? fRow : 1 - fRow) * (dCol ? fCol : 1 - fCol);
      total += value * w;
      weight += w;
    }
  }
  return weight > 0 ? total / weight : null;
}

// How many canvas pixels apart the places are worked out exactly. Between them
// they are interpolated, which is what keeps a reprojected map affordable:
// unprojecting every pixel of a British National Grid map is slow, and across
// this short a distance the difference cannot be seen.
const MESH = 16;

/**
 * Paints the field over the whole canvas, transparent wherever it has no score.
 *
 * @param placeAt the [lat, lng] shown at a canvas pixel
 */
export function paintField(
  canvas: HTMLCanvasElement,
  field: ScoreField,
  placeAt: (x: number, y: number) => [number, number],
): void {
  const { width, height } = canvas;
  const context = canvas.getContext('2d');
  if (!context || width === 0 || height === 0 || field.rows < 2 || field.cols < 2) return;

  const meshCols = Math.ceil(width / MESH) + 1;
  const meshRows = Math.ceil(height / MESH) + 1;
  const lats = new Float64Array(meshCols * meshRows);
  const lngs = new Float64Array(meshCols * meshRows);
  for (let j = 0; j < meshRows; j++) {
    for (let i = 0; i < meshCols; i++) {
      const [lat, lng] = placeAt(i * MESH, j * MESH);
      lats[j * meshCols + i] = lat;
      lngs[j * meshCols + i] = lng;
    }
  }

  const image = context.createImageData(width, height);
  const pixels = image.data;
  for (let y = 0; y < height; y++) {
    const j = Math.floor(y / MESH);
    // Pixel centres, so the picture is not shifted half a pixel up and left.
    const fy = (y + 0.5 - j * MESH) / MESH;
    for (let x = 0; x < width; x++) {
      const i = Math.floor(x / MESH);
      const fx = (x + 0.5 - i * MESH) / MESH;
      const a = j * meshCols + i;
      const b = a + meshCols;
      const lat =
        (lats[a] * (1 - fx) + lats[a + 1] * fx) * (1 - fy) + (lats[b] * (1 - fx) + lats[b + 1] * fx) * fy;
      const lng =
        (lngs[a] * (1 - fx) + lngs[a + 1] * fx) * (1 - fy) + (lngs[b] * (1 - fx) + lngs[b + 1] * fx) * fy;

      const score = sampleField(field, lat, lng);
      if (score === null) continue;
      const colour = Math.round(Math.min(Math.max(score, 0), 10) * 10) * 4;
      const pixel = (y * width + x) * 4;
      pixels[pixel] = LUT[colour];
      pixels[pixel + 1] = LUT[colour + 1];
      pixels[pixel + 2] = LUT[colour + 2];
      pixels[pixel + 3] = LUT[colour + 3];
    }
  }
  context.putImageData(image, 0, 0);
}

// Web Mercator has no poles, and nothing draws a map this close to them.
const MERCATOR_MAX_LAT = 85;
const FIELD_IMAGE_CELL_PX = 16;
const FIELD_IMAGE_MAX_PX = 1024;

function mercatorY(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
}

/**
 * The whole field as a picture in Web Mercator, for a map that takes an image
 * pinned by its corners rather than something to draw on.
 *
 * @return the image as a data URL, and its corners as [lng, lat] clockwise from
 *         the north-west
 */
export function fieldImage(field: ScoreField): { url: string; coordinates: [[number, number], [number, number], [number, number], [number, number]] } {
  const east = field.west + (field.cols - 1) * field.lonStep;
  const south = Math.max(field.south, -MERCATOR_MAX_LAT);
  const north = Math.min(field.south + (field.rows - 1) * field.latStep, MERCATOR_MAX_LAT);
  const top = mercatorY(north);
  const bottom = mercatorY(south);

  const canvas = document.createElement('canvas');
  canvas.width = Math.min(field.cols * FIELD_IMAGE_CELL_PX, FIELD_IMAGE_MAX_PX);
  canvas.height = Math.min(field.rows * FIELD_IMAGE_CELL_PX, FIELD_IMAGE_MAX_PX);
  paintField(canvas, field, (x, y) => {
    const mercator = top + (bottom - top) * (y / canvas.height);
    const lat = (Math.atan(Math.exp(mercator)) * 360) / Math.PI - 90;
    return [lat, field.west + (east - field.west) * (x / canvas.width)];
  });

  return {
    url: canvas.toDataURL(),
    coordinates: [[field.west, north], [east, north], [east, south], [field.west, south]],
  };
}
