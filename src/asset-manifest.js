// Every model the game can swap in, keyed by id. Drop a matching file into
// assets/raw/ (see assets/README.md), run `npm run assets`, and the game uses
// it in place of the built-in block model; until then the block model stays.
//
//   kind      'character' (rigged, animated) or 'prop' (static)
//   zh        Chinese name, for the asset list
//   tris      triangle budget; bigger models are simplified down to it
//   texture   largest texture side in pixels after optimising
//   priority  1 = do first (many copies, always on screen)
//   uses      how many copies each map places (rooftop, club, docks, senado)
//   size      [width x, depth z, height y] in metres when the game has no box
//             to fit it to (barrels, pans); otherwise the map's box is used
//   offset    [x, z, y] shift of the box centre from the object's origin
//   fit       how a prop is fitted to its box:
//               'box'        stretch to exactly fill it (crates, barriers)
//               'footprint'  fill width and depth, keep proportions in height
//                            (things with parts above the box: stalls, cars)
//               'height'     uniform scale to the box height, centred
//                            (thin things whose box is only for collision)
//   prompt    English text for the generator (or for drawing a concept image);
//             STYLE is appended to every prop prompt, CHARACTER_STYLE to every
//             character prompt

export const STYLE = 'stylized semi-realistic game asset, low poly, clean painted PBR textures, slightly exaggerated readable shapes, single object, centered, no ground plane, no text';
export const CHARACTER_STYLE =
  'full body game character, A-pose with arms 45 degrees down, empty hands (no weapon), front view, 1.78 m adult, stylized semi-realistic, clean painted textures, plain background';

export const ASSETS = {
  // ------------------------------------------------------------ characters
  hero: {
    kind: 'character',
    zh: '主角',
    tris: 10000,
    texture: 1024,
    priority: 1,
    prompt: 'young agent in a teal bomber jacket, dark navy slim trousers, white sneakers, short black hair, fingerless gloves',
  },
  grunt: {
    kind: 'character',
    zh: '打手 THUG',
    tris: 6000,
    texture: 1024,
    priority: 2,
    prompt: 'street thug in a charcoal hoodie, dark jeans, red bandana around the neck, short dyed dark-red hair',
  },
  shotgun: {
    kind: 'character',
    zh: '散彈手 SHOTGUNNER',
    tris: 6000,
    texture: 1024,
    priority: 2,
    prompt: 'stocky gangster in a worn brown leather jacket, dark brown trousers, orange cap, broad shoulders',
  },
  rifle: {
    kind: 'character',
    zh: '步槍手 RIFLEMAN',
    tris: 6000,
    texture: 1024,
    priority: 2,
    prompt: 'mercenary in a dark purple-grey tactical jacket, cargo trousers, violet armband, beret',
  },
  rusher: {
    kind: 'character',
    zh: '刀手 BLADE',
    tris: 6000,
    texture: 1024,
    priority: 2,
    prompt: 'lean agile assassin in fitted black clothes, magenta scarf covering the lower face, light shoes',
  },
  brute: {
    kind: 'character',
    zh: '大隻佬 BRUTE',
    tris: 8000,
    texture: 1024,
    priority: 2,
    prompt: 'huge heavy enforcer in a grey armoured vest over a black shirt, thick arms, buzz cut, red shoulder patches (modelled at normal 1.78 m height, the game scales it up)',
  },

  // -------------------------------------------------- props: every map
  crate: {
    kind: 'prop',
    zh: '木箱',
    fit: 'box',
    tris: 800,
    texture: 512,
    priority: 1,
    uses: { rooftop: 7, docks: 5, senado: 6 },
    prompt: 'weathered wooden shipping crate with dark metal corner brackets, cube',
  },
  barrel: {
    kind: 'prop',
    zh: '紅色油桶（會爆）',
    size: [0.9, 0.9, 1.23],
    fit: 'box',
    tris: 800,
    texture: 512,
    priority: 1,
    uses: { rooftop: 7, club: 3, docks: 5, senado: 2 },
    prompt: 'bright red 200 litre steel oil drum with a yellow hazard stripe and flammable symbol, must read as explosive',
  },
  gas: {
    kind: 'prop',
    zh: '大氣罐（會爆）',
    size: [1.16, 1.16, 1.8],
    fit: 'box',
    tris: 1000,
    texture: 512,
    priority: 1,
    uses: { club: 2, docks: 4, senado: 2 },
    prompt: 'large white industrial compressed gas tank, wide cylinder with a red band and a valve on top',
  },
  pan: {
    kind: 'prop',
    zh: '平底鑊（反彈子彈）',
    size: [0.82, 1.31, 0.1],
    offset: [0, 0, 0.245], // the handle sticks out in +z
    fit: 'box',
    tris: 600,
    texture: 512,
    priority: 1,
    uses: { rooftop: 6, docks: 5, senado: 8 },
    prompt: 'black cast iron frying pan with a long straight handle lying flat, seen from above, handle pointing forward',
  },
  concrete: {
    kind: 'prop',
    zh: '混凝土路障',
    fit: 'box',
    tris: 500,
    texture: 512,
    priority: 1,
    uses: { rooftop: 3, senado: 2 },
    prompt: 'long grey concrete road barrier (jersey barrier) with chipped edges, 4 m long',
  },
  unit: {
    kind: 'prop',
    zh: '天台冷氣機',
    fit: 'box',
    tris: 1000,
    texture: 512,
    priority: 2,
    uses: { rooftop: 4 },
    prompt: 'rooftop air conditioning condenser unit, metal box with a large round fan grill on top',
  },
  hut: {
    kind: 'prop',
    zh: '天台樓梯屋／碼頭小屋',
    fit: 'box',
    tris: 1200,
    texture: 512,
    priority: 3,
    uses: { rooftop: 2, docks: 1 },
    prompt: 'small rooftop stairwell hut, painted concrete walls, metal door, flat roof with an overhang',
  },

  // -------------------------------------------------------- props: club
  tray: {
    kind: 'prop',
    zh: '酒吧托盤（反彈子彈）',
    size: [0.82, 0.82, 0.1],
    fit: 'box',
    tris: 300,
    texture: 512,
    priority: 2,
    uses: { club: 6 },
    prompt: 'round polished stainless steel bar serving tray lying flat',
  },
  speaker: {
    kind: 'prop',
    zh: '夜店喇叭',
    fit: 'box',
    tris: 800,
    texture: 512,
    priority: 2,
    uses: { club: 4 },
    prompt: 'tall black nightclub speaker cabinet with two large woofers and a tweeter',
  },
  bar: {
    kind: 'prop',
    zh: '吧枱',
    fit: 'box',
    tris: 1200,
    texture: 512,
    priority: 3,
    uses: { club: 3 },
    prompt: 'straight nightclub bar counter section, dark wood with a metal top and a pink neon strip, 4 m long',
  },
  sofa: {
    kind: 'prop',
    zh: '卡位沙發',
    fit: 'box',
    tris: 1000,
    texture: 512,
    priority: 3,
    uses: { club: 3 },
    prompt: 'long nightclub booth sofa, purple leather, low backrest, 4.5 m long',
  },
  table: {
    kind: 'prop',
    zh: '酒枱',
    fit: 'box',
    tris: 500,
    texture: 512,
    priority: 3,
    uses: { club: 3 },
    prompt: 'small square nightclub cocktail table with bottles and glasses on top',
  },
  dj: {
    kind: 'prop',
    zh: 'DJ 台',
    fit: 'box',
    tris: 1500,
    texture: 512,
    priority: 3,
    uses: { club: 1 },
    prompt: 'nightclub DJ booth with two turntables, a mixer and glowing cyan front panel',
  },

  // ------------------------------------------------------- props: docks
  container: {
    kind: 'prop',
    zh: '貨櫃（一個模型、四種顏色）',
    fit: 'box',
    tris: 1200,
    texture: 512,
    priority: 1,
    uses: { docks: 7 },
    prompt: '20 foot steel shipping container, corrugated walls, doors at one end, plain light grey paint (the game tints it)',
  },
  forklift: {
    kind: 'prop',
    zh: '叉車',
    fit: 'footprint',
    tris: 2500,
    texture: 512,
    priority: 3,
    uses: { docks: 1 },
    prompt: 'yellow warehouse forklift truck with the forks lowered',
  },

  // ------------------------------------------------------ props: Senado
  lpg: {
    kind: 'prop',
    zh: '石油氣罐（會爆）',
    size: [0.6, 0.6, 1.2],
    fit: 'box',
    tris: 600,
    texture: 512,
    priority: 1,
    uses: { senado: 5 },
    prompt: 'orange LPG gas cylinder like the ones beside Macau street food stalls, rounded body with a valve collar',
  },
  streetlamp: {
    kind: 'prop',
    zh: '葡式路燈',
    fit: 'height',
    tris: 1200,
    texture: 512,
    priority: 1,
    uses: { senado: 8 },
    prompt: 'Portuguese colonial cast iron street lamp of Macau, black, slender fluted post, two lanterns on a curved arm, 4 m tall',
  },
  stall: {
    kind: 'prop',
    zh: '熟食檔',
    fit: 'footprint',
    tris: 2500,
    texture: 1024,
    priority: 1,
    uses: { senado: 5 },
    prompt: 'Macau street food stall cart: stainless steel counter with pots and skewers, striped canopy on four poles, 2.8 m wide',
  },
  planter: {
    kind: 'prop',
    zh: '花槽',
    fit: 'footprint',
    tris: 1200,
    texture: 512,
    priority: 2,
    uses: { senado: 3 },
    prompt: 'square cream-coloured stone planter box with a small rounded shrub, Portuguese style',
  },
  car: {
    kind: 'prop',
    zh: '的士',
    fit: 'footprint',
    tris: 3000,
    texture: 1024,
    priority: 2,
    uses: { senado: 2 },
    prompt: 'compact black Macau taxi sedan with a roof sign, doors closed',
  },
  kiosk: {
    kind: 'prop',
    zh: '報紙亭',
    fit: 'footprint',
    tris: 1500,
    texture: 512,
    priority: 2,
    uses: { senado: 1 },
    prompt: 'small dark green metal newspaper kiosk with magazines on display and an overhanging roof',
  },
  utilitybox: {
    kind: 'prop',
    zh: '電箱',
    fit: 'box',
    tris: 400,
    texture: 512,
    priority: 3,
    uses: { senado: 1 },
    prompt: 'grey metal street utility cabinet with two doors and warning sticker',
  },
};

/** Map materials that reuse another model, optionally tinted (hex colour). */
export const ALIASES = {
  containerRed: ['container', 0xb8432f],
  containerBlue: ['container', 0x2f5f9e],
  containerGreen: ['container', 0x3d7a45],
  containerOrange: ['container', 0xd7832b],
};

/** Per-map exceptions: Senado's "unit" is a utility box, not an air conditioner. */
export const MAP_ALIASES = {
  senado: { unit: 'utilitybox' },
};
