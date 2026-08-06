// Jest setup provided by Grafana scaffolding
import './.config/jest-setup';

// @grafana/scenes' LazyLoader reads IntersectionObserver at module load, so any
// suite that imports a scene needs it defined before the import runs. jsdom
// doesn't implement it; observing nothing is enough for these tests.
class IntersectionObserverStub {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

Object.defineProperty(global, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: IntersectionObserverStub,
});

// ResizeObserver is the same story for scene layouts that measure themselves.
Object.defineProperty(global, 'ResizeObserver', {
  writable: true,
  configurable: true,
  value: class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});
