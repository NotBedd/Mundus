// Unit tests for the v0.8.64 marker libs — src/lib/markerStyle.ts and
// src/lib/markerIconLibrary.ts (settings toggle + shared icon image library).
// Run: npx tsx scripts/test_marker_features.ts

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, cond: boolean) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(name);
    console.error(`  FAIL: ${name}`);
  }
}

// Minimal localStorage stub (the libs are browser-oriented)
class LocalStorageStub {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, String(v)); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}
(globalThis as any).localStorage = new LocalStorageStub();

import {
  getMapMarkerStyle,
  setMapMarkerStyle,
} from '../src/lib/markerStyle';
import {
  getMarkerIconLibrary,
  saveMarkerIconLibrary,
  addMarkerIconImage,
  removeMarkerIconImage,
  getMarkerIconImageUrl,
  MAX_MARKER_ICON_IMAGES,
} from '../src/lib/markerIconLibrary';

console.log('— markerStyle —');

// defaults
assert('default style is pin', getMapMarkerStyle() === 'pin');
assert('garbage value falls back to pin', (localStorage.setItem('mundus_map_marker_style', 'nonsense'), getMapMarkerStyle() === 'pin'));

// toggle round-trip
setMapMarkerStyle('icon');
assert('icon style persists', getMapMarkerStyle() === 'icon');
setMapMarkerStyle('pin');
assert('pin style persists', getMapMarkerStyle() === 'pin');

// storage key correctness
assert('uses the documented storage key', localStorage.getItem('mundus_map_marker_style') === 'pin');

console.log('— markerIconLibrary —');

// empty library
assert('library starts empty', getMarkerIconLibrary().length === 0);
assert('lookup of missing id is undefined', getMarkerIconImageUrl('nope') === undefined);
assert('lookup of undefined id is undefined', getMarkerIconImageUrl(undefined) === undefined);

// add
const add1 = addMarkerIconImage('data:image/png;base64,AAAA', 'castle.png');
assert('add succeeds', add1.ok === true && !!add1.item);
assert('added item is in library', getMarkerIconLibrary().length === 1);
assert('lookup by id returns url', getMarkerIconImageUrl(add1.item!.id) === 'data:image/png;base64,AAAA');
assert('id prefix is mkico_', add1.item!.id.startsWith('mkico_'));

const add2 = addMarkerIconImage('https://i.ibb.co/real/x.jpg', 'tower.jpg');
assert('second add succeeds', add2.ok === true);
assert('library is newest-first', getMarkerIconLibrary()[0].name === 'tower.jpg');

// ids are unique
assert('ids unique', add1.item!.id !== add2.item!.id);

// remove
const afterRemove = removeMarkerIconImage(add1.item!.id);
assert('remove returns remaining list', afterRemove.length === 1 && afterRemove[0].id === add2.item!.id);
assert('removed id no longer resolves', getMarkerIconImageUrl(add1.item!.id) === undefined);
assert('survivor still resolves', getMarkerIconImageUrl(add2.item!.id) === 'https://i.ibb.co/real/x.jpg');

// name sanitization / long names truncated
const longName = 'x'.repeat(300);
const add3 = addMarkerIconImage('data:image/png;base64,BBBB', longName);
assert('very long name truncated to 80 chars', add3.ok && add3.item!.name.length <= 80);
removeMarkerIconImage(add3.item!.id);

// too-large data URL rejected
const hugeDataUrl = 'data:image/png;base64,' + 'A'.repeat(400 * 1024 + 10);
const addBig = addMarkerIconImage(hugeDataUrl, 'huge.png');
assert('oversized data URL rejected as too-large', addBig.ok === false && addBig.error === 'too-large');

// hosted URLs are never size-rejected
const addHosted = addMarkerIconImage('https://i.ibb.co/real/big.jpg', 'big.jpg');
assert('hosted URL accepted regardless of size rules', addHosted.ok === true);
removeMarkerIconImage(addHosted.item!.id);

// fill to cap
saveMarkerIconLibrary([]);
let fullHit = false;
for (let i = 0; i < MAX_MARKER_ICON_IMAGES; i++) {
  const r = addMarkerIconImage(`https://i.ibb.co/real/${i}.jpg`, `i${i}`);
  if (!r.ok) { fullHit = true; break; }
}
assert(`library accepts exactly ${MAX_MARKER_ICON_IMAGES} images`, !fullHit && getMarkerIconLibrary().length === MAX_MARKER_ICON_IMAGES);
const overflow = addMarkerIconImage('https://i.ibb.co/real/overflow.jpg', 'overflow');
assert('overflow rejected as full', overflow.ok === false && overflow.error === 'full');

// corrupted storage recovers gracefully
localStorage.setItem('mundus_marker_icon_library_v1', '{not json');
assert('corrupt storage -> empty library, no throw', getMarkerIconLibrary().length === 0);
const afterCorrupt = addMarkerIconImage('https://i.ibb.co/real/recover.jpg', 'recover');
assert('recovers after corruption', afterCorrupt.ok === true && getMarkerIconLibrary().length === 1);

// non-array payload
localStorage.setItem('mundus_marker_icon_library_v1', JSON.stringify({ hello: 1 }));
assert('non-array payload -> empty library', getMarkerIconLibrary().length === 0);

// malformed entries filtered out
localStorage.setItem('mundus_marker_icon_library_v1', JSON.stringify([
  { id: 'ok1', url: 'https://x/1.jpg' },
  null,
  { url: 'https://x/2.jpg' }, // missing id
  { id: 'ok2', url: 42 },     // url not a string -> filtered (then defaults)
]));
const filtered = getMarkerIconLibrary();
assert('malformed entries filtered', filtered.length >= 1 && filtered[0].id === 'ok1');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('Failures:', failures.join(' | '));
  process.exit(1);
}
