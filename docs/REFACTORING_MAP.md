# SurveillanceMap.tsx — Refactoring Plan

## Current State (post-commit 44e8991)

- **929 lines** (was 951)
- **10 useEffect** (was 16, -37%)
- **✅ useLatest applied** — 6 manual ref-sync useEffect eliminated

## Remaining Complexity

### God Component Anti-patterns Still Present

1. **Two monster useEffect**
   - Line ~631-842: **211 lines** — marker population + reconciliation
   - Line ~395-574: **179 lines** — map creation + 5 event handlers + custom control

2. **Mixed concerns**
   - Leaflet imperative DOM (outside React tree)
   - React widget mount inside Leaflet popup
   - Custom controls with inline event listeners
   - Geolocation with direct `aria-pressed` DOM writes

3. **Business logic inline**
   - 70 lines of geolocation (should be `useGeolocation()`)
   - Grid aggregation mixed with marker rendering
   - Popup HTML generation inline

## Extraction-Ready Hooks (Already Created)

Located in `app/lib/hooks/`:

### 1. `useLatest.ts` ✅ **APPLIED**
- **22 lines**
- Eliminates stale-closure bugs
- Replace `useRef(value) + useEffect sync` pattern

### 2. `useGeolocation.ts` ⏳ **READY**
- **108 lines**
- Manages user position layer + accuracy circle
- Handles geolocation API + errors + button state
- **Dependencies**: `mapRef`, `leafletRef`, `userLayerRef`, `geoButtonRef`, `geoActiveRef`

### 3. `useLeafletMap.ts` ⏳ **READY**
- **192 lines**
- Map creation + tile layer
- Layer groups (markers, FOV, user location)
- Custom controls (zoom, geolocate button)
- Viewport bounds sync (debounced)
- **Extracts**: 180-line map creation useEffect

### 4. `useMarkerLayer.ts` ⏳ **READY**
- **226 lines**
- Marker population from `markersForViewport()`
- Reconciliation: diff existing vs desired, keep/add/remove
- Grid badges vs individual markers
- Popup lifecycle + React widget mount
- **Extracts**: 211-line marker population useEffect

### 5. `useFOVLayer.ts` ⏳ **READY**
- **79 lines**
- Field-of-view cones (directional cameras)
- Field-of-view circles (domes)
- Performance contract: only above z12, only in viewport
- **Extracts**: 35-line FOV useEffect

## Refactoring Strategy

### Phase 1: Conservative (✅ DONE)
- Apply `useLatest` to eliminate ref-sync hell
- **Risk**: minimal (no logic changes)
- **Gain**: -6 useEffect, cleaner code

### Phase 2: Extract Self-Contained Logic (NEXT)
**Pre-requisites**: Test coverage for critical paths
1. Extract `useGeolocation` (self-contained, 70 lines)
2. Extract `useFOVLayer` (simple, read-only, 35 lines)
3. Verify both in isolation

**Risk**: low (both are side-effect only, no shared state)  
**Gain**: -2 useEffect, -105 lines from main component

### Phase 3: Extract Map Creation (REQUIRES TESTS)
**Pre-requisites**: Integration tests for map lifecycle
1. Extract `useLeafletMap` (complex: creates map + controls + events)
2. Verify map creation, controls, bounds sync
3. Test cleanup on unmount

**Risk**: medium (touches initialization path)  
**Gain**: -1 useEffect (180 lines), isolates Leaflet setup

### Phase 4: Extract Marker Layer (HIGH RISK)
**Pre-requisites**: Full test suite + visual regression tests
1. Extract `useMarkerLayer` (211 lines, highest complexity)
2. Verify reconciliation logic (keep markers with open popups)
3. Verify grid aggregation
4. Verify popup widget mount/unmount
5. Test edge cases: viewport changes, filter changes, selection changes

**Risk**: high (core UX logic, many edge cases)  
**Gain**: -1 useEffect (211 lines), biggest complexity reduction

### Phase 5: Final Cleanup
1. Simplify component to pure orchestration (~150 lines)
2. Document hook contracts
3. Add integration tests for hook interactions

## Testing Requirements (Before Phase 3+)

### Unit Tests Needed
- [ ] `useLatest`: ref updates without effect retriggering
- [ ] `useGeolocation`: position fetch, error handling, button state
- [ ] `useFOVLayer`: geometry rendering, zoom threshold, viewport filtering

### Integration Tests Needed
- [ ] Map creation + initial viewport
- [ ] Marker population from empty → 100 cameras
- [ ] Marker reconciliation: keep open popup on rebuild
- [ ] Grid aggregation: switch between badges and individual markers
- [ ] Selection: marker icon change + popup open + pan into view
- [ ] Geolocation: button toggle, layer clear, pan to position

### Visual Regression Tests Needed
- [ ] Marker styles (status colors, selected state)
- [ ] Grid badge appearance
- [ ] FOV geometry (cones, circles)
- [ ] Popup layout + widget mount
- [ ] Mobile responsive behavior

## Migration Path (When Ready)

1. **Create `SurveillanceMap.new.tsx`** using all 5 hooks
2. **A/B test** in development (feature flag)
3. **Monitor** for regressions (popup behavior, selection, grid)
4. **Replace** original when stable
5. **Delete** hooks if unified component is better

## Estimated Effort

- **Phase 2** (geolocation + FOV): 2-4 hours + tests
- **Phase 3** (map creation): 4-6 hours + tests
- **Phase 4** (marker layer): 8-12 hours + tests (highest risk)
- **Phase 5** (cleanup): 2-3 hours

**Total**: ~20-30 hours with comprehensive test coverage

## Decision: Proceed or Defer?

**Defer if**:
- Current component works reliably in production
- No active bugs in map behavior
- Team velocity prioritizes new features over refactoring

**Proceed if**:
- Map bugs are frequent (popup lifecycle, selection state)
- New map features are blocked by complexity
- Onboarding new developers is slowed by 929-line file
- Test coverage is already strong

## Notes

- Hooks are **extraction-ready**, not experimental
- `useMarkerLayer` is the **highest-value target** (211 lines, highest complexity)
- Current component is **functional** — refactoring is optimization, not bug fix
- Risk increases with each phase — stop if tests reveal edge cases

---

**Author**: Refactoring audit 2026-08-09  
**Status**: Phase 1 complete, Phase 2+ deferred pending test coverage
