// Unit tests for the v0.8.64 round-2 sync layer:
//   - src/lib/markerStyle.ts        (map marker style prefs merge)
//   - src/lib/markerIconLibrary.ts  (icon library union merge + tombstones)
//   - src/lib/dictionaryManager.ts  (autocorrect device-specific default)
//   - src/lib/platform.ts           (iOS / mobile detection)
// Run: npx tsx scripts/test_marker_sync.ts

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
  collectLocalMarkerStylePrefs,
  stampLocalMarkerStylePrefs,
  applyMarkerStylePrefsToLocalStorage,
  mergeMapMarkerStylePrefs,
  setMapMarkerStyle,
  getMapMarkerStyle,
  MAP_MARKER_PREFS_LOCAL_KEYS,
  type MapMarkerStylePrefs,
} from '../src/lib/markerStyle';
import {
  getMarkerIconLibrary,
  addMarkerIconImage,
  removeMarkerIconImage,
  collectLocalMarkerIconLibrary,
  applyMarkerIconLibrarySnapshot,
  mergeMarkerIconLibraries,
  hasMarkerIconTombstone,
  pruneMarkerIconTombstones,
  MARKER_ICON_TOMBSTONE_TTL_MS,
  type MarkerIconImage,
  type MarkerIconLibrarySnapshot,
} from '../src/lib/markerIconLibrary';

console.log('— markerStyle sync prefs —');

// Fresh device: collect returns default pin, empty stamp
localStorage.clear();
let collected = collectLocalMarkerStylePrefs();
assert('fresh collect: pin default', collected.markerStyle === 'pin');
assert('fresh collect: empty updatedAt', collected.updatedAt === '');

// stamp writes the local key
const t1 = stampLocalMarkerStylePrefs();
assert('stamp writes ISO time', localStorage.getItem(MAP_MARKER_PREFS_LOCAL_KEYS.updated) === t1);
assert('collect after stamp picks it up', collectLocalMarkerStylePrefs().updatedAt === t1);

// merge: no cloud -> push-local (stamps a never-edited device)
localStorage.clear();
const pushResult = mergeMapMarkerStylePrefs(collectLocalMarkerStylePrefs(), null);
assert('no cloud -> push-local', pushResult.action === 'push-local');
assert('no cloud push-local stamps fresh device', pushResult.prefs.updatedAt !== '');

// merge: garbage cloud markerStyle -> push-local ('pin' is a VALID value, must never be treated as missing)
const localPrefs: MapMarkerStylePrefs = { markerStyle: 'pin', updatedAt: '2026-10-24T10:00:00.000Z' };
assert("cloud 'pin' is valid -> honoured", mergeMapMarkerStylePrefs(localPrefs, { markerStyle: 'pin', updatedAt: '2026-10-24T11:00:00.000Z' }).action === 'apply-cloud');
assert('cloud garbage style -> push-local', mergeMapMarkerStylePrefs(localPrefs, { markerStyle: 'nonsense' as any, updatedAt: '2026-10-24T11:00:00.000Z' }).action === 'push-local');
assert('cloud undefined style -> push-local', mergeMapMarkerStylePrefs(localPrefs, {} as any).action === 'push-local');

// merge: last-write-wins
assert('cloud newer -> apply-cloud', mergeMapMarkerStylePrefs(localPrefs, { markerStyle: 'icon', updatedAt: '2026-10-24T12:00:00.000Z' }).action === 'apply-cloud');
assert('local newer -> push-local', mergeMapMarkerStylePrefs(localPrefs, { markerStyle: 'icon', updatedAt: '2026-10-24T09:00:00.000Z' }).action === 'push-local');
assert('equal stamps -> none', mergeMapMarkerStylePrefs(localPrefs, { markerStyle: 'icon', updatedAt: localPrefs.updatedAt }).action === 'none');
assert('local never stamped + cloud exists -> apply-cloud', mergeMapMarkerStylePrefs({ markerStyle: 'icon', updatedAt: '' }, { markerStyle: 'pin', updatedAt: '2026-01-01T00:00:00.000Z' }).action === 'apply-cloud');

// apply writes both value and stamp
applyMarkerStylePrefsToLocalStorage({ markerStyle: 'icon', updatedAt: '2026-10-24T12:00:00.000Z' });
assert('apply writes icon style', getMapMarkerStyle() === 'icon');
assert('apply writes stamp', localStorage.getItem(MAP_MARKER_PREFS_LOCAL_KEYS.updated) === '2026-10-24T12:00:00.000Z');
applyMarkerStylePrefsToLocalStorage({ markerStyle: 'pin', updatedAt: '2026-10-24T13:00:00.000Z' });
assert('apply writes pin style too', getMapMarkerStyle() === 'pin');

// round-trip: toggle + stamp + collect + push shape
setMapMarkerStyle('icon');
stampLocalMarkerStylePrefs();
const pushShape = collectLocalMarkerStylePrefs();
assert('push shape carries icon + stamp', pushShape.markerStyle === 'icon' && pushShape.updatedAt !== '');

console.log('— markerIconLibrary sync + tombstones —');

// baseline add/remove with tombstones
localStorage.clear();
const add1 = addMarkerIconImage('https://example.com/a.png', 'a.png');
const add2 = addMarkerIconImage('https://example.com/b.png', 'b.png');
assert('two adds ok', add1.ok && add2.ok && getMarkerIconLibrary().length === 2);
assert('no tombstones after adds', !hasMarkerIconTombstone(add1.item!.id) && !hasMarkerIconTombstone(add2.item!.id));

const afterRemove = removeMarkerIconImage(add1.item!.id);
assert('remove returns updated list', afterRemove.length === 1);
assert('remove records a tombstone', hasMarkerIconTombstone(add1.item!.id));

// re-adding clears the tombstone (same id never filtered by a stale one)
const add3 = addMarkerIconImage('https://example.com/c.png', 'c.png');
assert('re-add ok', add3.ok);
assert('re-add of a different id does not clear other tombstones', hasMarkerIconTombstone(add1.item!.id));

// collect: snapshot contains visible items + tombstones
const snap = collectLocalMarkerIconLibrary();
assert('snapshot has 2 items', snap.items.length === 2);
assert('snapshot has 1 tombstone', snap.removed.length === 1 && snap.removed[0].id === add1.item!.id);

// merge: pure union with cloud additions
const cloudSnapshot: MarkerIconLibrarySnapshot = {
  items: [
    ...snap.items,
    { id: 'mkico_cloud_1', url: 'https://example.com/cloud.png', name: 'cloud.png', createdAt: '2026-10-23T00:00:00.000Z' }
  ],
  removed: snap.removed,
  updatedAt: '2026-10-23T00:00:00.000Z'
};
const m1 = mergeMarkerIconLibraries(snap, cloudSnapshot);
assert('union: cloud addition merged', m1.snapshot.items.length === 3);
assert('union: changed=true', m1.changed === true);
assert('union: tombstones preserved', m1.snapshot.removed.length === 1);

// merge: local tombstone drops a cloud entry (deletion wins)
const cloudWithRemovedItem: MarkerIconLibrarySnapshot = {
  items: [
    ...snap.items,
    { id: 'mkico_removed_elsewhere', url: 'https://example.com/x.png', name: 'x.png', createdAt: '2026-10-23T00:00:00.000Z' }
  ],
  removed: [...snap.removed, { id: 'mkico_removed_elsewhere', deletedAt: Date.now() }],
  updatedAt: '2026-10-23T01:00:00.000Z'
};
const m2 = mergeMarkerIconLibraries(snap, cloudWithRemovedItem);
assert('tombstoned cloud entry dropped', !m2.snapshot.items.some((it) => it.id === 'mkico_removed_elsewhere'));
assert('removedFromCloud counts drops', m2.removedFromCloud === 1);
assert('other cloud items survive', m2.snapshot.items.length === 2);

// merge: cloud tombstone drops a local item (device B learns about a removal)
const localWithItem: MarkerIconLibrarySnapshot = {
  items: [...snap.items, { id: 'mkico_local_extra', url: 'data:image/png;base64,AAA', name: 'extra.png', createdAt: '2026-10-23T00:00:00.000Z' }],
  removed: snap.removed,
  updatedAt: '2026-10-23T00:00:00.000Z'
};
const cloudTombstonesLocal: Partial<MarkerIconLibrarySnapshot> = {
  items: snap.items,
  removed: [...snap.removed, { id: 'mkico_local_extra', deletedAt: Date.now() + 5000 }]
};
const m3 = mergeMarkerIconLibraries(localWithItem, cloudTombstonesLocal);
assert('cloud tombstone drops local item', !m3.snapshot.items.some((it) => it.id === 'mkico_local_extra'));
assert('changed=true when a cloud removal lands locally', m3.changed === true);

// merge: no change -> changed=false (identical snapshots)
const m4 = mergeMarkerIconLibraries(snap, snap);
assert('identical snapshots -> changed=false', m4.changed === false);
assert('identical snapshots -> same items', m4.snapshot.items.length === snap.items.length);

// merge: null cloud -> changed=false (nothing to do, no wasteful push)
const m5 = mergeMarkerIconLibraries(snap, null);
assert('null cloud -> changed=false', m5.changed === false);
assert('null cloud -> local items kept', m5.snapshot.items.length === snap.items.length);

// merge: tombstones — when both sides tombstone the same id, the newest
// deletedAt wins; ANY fresh tombstone drops the item (deletion wins, and ids
// are never reused so a drop can never hide a re-added entry).
const localNewerTomb: Partial<MarkerIconLibrarySnapshot> = {
  items: [],
  removed: [{ id: add2.item!.id, deletedAt: Date.now() - 10000 }]
};
const m6 = mergeMarkerIconLibraries(snap, localNewerTomb);
assert('fresh cloud tombstone drops the local item', !m6.snapshot.items.some((it) => it.id === add2.item!.id));
assert('merged tombstone keeps the newest deletedAt (local older, cloud newer)', (() => {
  const t = m6.snapshot.removed.find((x) => x.id === add2.item!.id);
  return !!t && t.deletedAt === Date.now() - 10000;
})());
const newerTomb: Partial<MarkerIconLibrarySnapshot> = {
  items: [],
  removed: [{ id: add2.item!.id, deletedAt: Date.now() + 10000 }]
};
const m7 = mergeMarkerIconLibraries(snap, newerTomb);
assert('cloud newer tombstone wins (item dropped)', !m7.snapshot.items.some((it) => it.id === add2.item!.id));
assert('merged tombstone keeps the newer cloud deletedAt', (() => {
  const t = m7.snapshot.removed.find((x) => x.id === add2.item!.id);
  return !!t && t.deletedAt === Date.now() + 10000;
})());

// merge: TTL prune drops ancient tombstones (id unknown locally, so the item
// becomes resurrectable once its removal record goes stale)
const ancientId = 'mkico_ancient_removal';
const ancientTomb: Partial<MarkerIconLibrarySnapshot> = {
  items: [{ id: ancientId, url: 'https://example.com/ancient.png', name: 'ancient.png', createdAt: '2026-01-01T00:00:00.000Z' }],
  removed: [{ id: ancientId, deletedAt: Date.now() - MARKER_ICON_TOMBSTONE_TTL_MS - 60000 }]
};
const m8 = mergeMarkerIconLibraries(snap, ancientTomb);
assert('ancient tombstone pruned -> item resurrectable', m8.snapshot.items.some((it) => it.id === ancientId) && !m8.snapshot.removed.some((t) => t.id === ancientId));

// merge: invalid entries filtered out
const garbageCloud: Partial<MarkerIconLibrarySnapshot> = {
  items: [{ id: 'ok_id', url: 'https://example.com/ok.png', name: 'ok', createdAt: '2026-10-23T00:00:00.000Z' }, null as any, { id: 42 as any, url: 'https://x' } as any, { url: 'no-id' } as any],
  removed: [{ id: 'tomb_no_time' } as any],
  updatedAt: ''
};
const m9 = mergeMarkerIconLibraries(snap, garbageCloud);
assert('invalid cloud entries filtered', !m9.snapshot.items.some((it) => it.id === 'tomb_no_time') && m9.snapshot.items.some((it) => it.id === 'ok_id'));
assert('invalid tombstones ignored', !m9.snapshot.removed.some((t) => t.id === 'tomb_no_time'));

// apply: writes both halves back
const applySnap: MarkerIconLibrarySnapshot = {
  items: [{ id: 'mkico_apply_1', url: 'https://example.com/applied.png', name: 'applied.png', createdAt: '2026-10-24T00:00:00.000Z' }],
  removed: [{ id: 'mkico_apply_gone', deletedAt: Date.now() }],
  updatedAt: '2026-10-24T00:00:00.000Z'
};
applyMarkerIconLibrarySnapshot(applySnap);
assert('apply writes items', getMarkerIconLibrary().length === 1 && getMarkerIconLibrary()[0].id === 'mkico_apply_1');
assert('apply writes tombstones', hasMarkerIconTombstone('mkico_apply_gone'));

// prune: stale tombstones removed, fresh ones kept
pruneMarkerIconTombstones();
assert('fresh tombstone survives prune', hasMarkerIconTombstone('mkico_apply_gone'));

console.log('— platform + autocorrect device default —');

// These imports must happen AFTER the localStorage stub exists.
const { isAndroidApp, isIosApp, isMobileApp } = await import('../src/lib/platform');
const { getAutocorrectEnabled, setAutocorrectEnabled } = await import('../src/lib/dictionaryManager');

// Node 24 exposes a getter-only global navigator/window — (re)define safely.
const defineGlobal = (name: string, value: any) => {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
};

// No window -> desktop (test env): autocorrect defaults ON
assert('desktop default: autocorrect ON', getAutocorrectEnabled() === true);
assert('no window -> not android/ios/mobile', !isAndroidApp() && !isIosApp() && !isMobileApp());

// Explicit OFF wins on every platform
setAutocorrectEnabled(false);
assert('explicit OFF respected on desktop', getAutocorrectEnabled() === false);
setAutocorrectEnabled(true);
assert('explicit ON respected on desktop', getAutocorrectEnabled() === true);
localStorage.removeItem('mundus_autocorrect_enabled');

// Simulate the Android Capacitor WebView BEFORE the first platform cache fill.
// isAndroidApp caches on first positive evaluation, so this must be the first
// call that reaches the Capacitor branch.
defineGlobal('window', {
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android'
  }
});
defineGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile', maxTouchPoints: 5 });
assert('android detected', isAndroidApp() === true);
assert('android -> mobile', isMobileApp() === true);
assert('android -> not ios', isIosApp() === false);
assert('android default: autocorrect OFF', getAutocorrectEnabled() === false);

// Explicit ON on mobile still wins over the platform default
setAutocorrectEnabled(true);
assert('explicit ON respected on android', getAutocorrectEnabled() === true);
localStorage.removeItem('mundus_autocorrect_enabled');
assert('android default again OFF', getAutocorrectEnabled() === false);

console.log('— iOS detection —');

// iOS Capacitor WebView (isAndroidApp already cached true above; isIosApp is live)
defineGlobal('window', {
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'ios'
  }
});
defineGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15', maxTouchPoints: 5 });
assert('ios detected via Capacitor', isIosApp() === true);
assert('ios -> mobile', isMobileApp() === true);
assert('ios default: autocorrect OFF', getAutocorrectEnabled() === false);

// UA fallbacks (no Capacitor)
defineGlobal('window', {});
assert('iphone UA -> ios', (() => { defineGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', maxTouchPoints: 5 }); return isIosApp(); })() === true);
assert('ipad UA -> ios', (() => { defineGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0)', maxTouchPoints: 5 }); return isIosApp(); })() === true);
assert('iPadOS13 Mac-masking -> ios', (() => { defineGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 3 }); return isIosApp(); })() === true);
assert('desktop Mac (no touch) -> not ios', (() => { defineGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 }); return isIosApp(); })() === false);
assert('android UA -> not ios', (() => { defineGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14)', maxTouchPoints: 5 }); return isIosApp(); })() === false);

// Capacitor positively reporting another platform must NOT fall through to UA ios
defineGlobal('window', { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } });
assert('capacitor says android -> not ios even with iphone-ish UA', (() => { defineGlobal('navigator', { userAgent: 'iPhone', maxTouchPoints: 5 }); return isIosApp(); })() === false);

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.error('Failures:\n - ' + failures.join('\n - '));
  process.exit(1);
}
