// Shared mutable state between the mocked db modules and the test harness.
// The mock modules in tests/helpers/mocks/ are what the transpiled route
// handlers actually import at runtime; each function records its invocation
// and delegates to a per-test stub. Unstubbed calls throw so tests cannot
// accidentally pass against default behaviour.

export const mockState = {
  impls: new Map(),
  calls: [],
};

export function resetMockState() {
  mockState.impls = new Map();
  mockState.calls = [];
}

export function stub(name, impl) {
  mockState.impls.set(name, impl);
  return impl;
}

export function callArgs(name) {
  return mockState.calls.filter((call) => call.name === name).map((call) => call.args);
}

export function makeMock(namespace) {
  return Object.fromEntries(
    Object.entries(namespace).map(([name]) => [
      name,
      async (...args) => {
        mockState.calls.push({ name, args });
        const impl = mockState.impls.get(name);
        if (!impl) {
          throw new Error(
            `db.${name} was called but no test stub was registered — stub it with stub("${name}", impl)`,
          );
        }
        return impl(...args);
      },
    ]),
  );
}
