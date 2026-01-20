import { Signal } from "@char/aftercare";

const NOTHING: unique symbol = Symbol("lazysignal.null");
export class LazySignal<T> extends Signal<T> {
  constructor() {
    super(NOTHING as T); // dw kitten
  }

  override get() {
    const v = super.get();
    if (v === NOTHING) throw new Error("LazySignal accessed too soon!");
    return v;
  }

  override subscribeImmediate(listener: (curr: T, old: T) => void): {
    unsubscribe: () => void;
  } {
    if (this.ready()) return super.subscribeImmediate(listener);
    else return super.subscribe(listener);
  }

  ready(): boolean {
    return super.get() !== NOTHING;
  }

  tryGet(): T | undefined {
    return this.ready() ? this.get() : undefined;
  }
}
