import { useEffect, useRef } from "react";

/**
 * useLatest — sync a ref to the latest value without retriggering effects.
 *
 * Solves the stale-closure problem: when a callback reads a prop/state value
 * from its closure, it sees the value from the render that created it, not
 * the current one. Storing the value in a ref and reading `.current` gives
 * the latest value without adding the prop to the effect's dependency array
 * (which would retrigger the effect on every change).
 *
 * Usage:
 *   const onChangeRef = useLatest(onChange);
 *   useEffect(() => {
 *     // handler reads onChangeRef.current, which is always the latest onChange
 *   }, []); // empty deps — never retriggered by onChange updates
 */
export function useLatest<T>(value: T): React.MutableRefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
