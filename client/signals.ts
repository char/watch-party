export type Signal = object;

// deno-lint-ignore no-explicit-any
export type SignalConstructor<S extends Signal = Signal> = new (...args: any[]) => S;
export type SignalListener<S extends Signal = Signal> = (signal: S) => void;

export interface SignalSubscription<S extends Signal = Signal> {
  listener: SignalListener<S>;
  readonly priority: number;
  readonly unsubscribe: () => void;
}

export interface SignalListenerOptions {
  priority?: number;
  abort?: AbortSignal;
}

const subs = Symbol.for("aftercare.signalSubscriptionMap");

export interface ISignalHandler {
  readonly [subs]: Map<SignalConstructor, SignalSubscription[]>;

  fire<S extends Signal, C extends SignalConstructor<S>>(
    type: C,
    ...params: ConstructorParameters<C>
  ): S;
  on<S extends Signal>(
    type: SignalConstructor<S>,
    listener: SignalListener<S>,
    options?: SignalListenerOptions,
  ): SignalSubscription<S>;
  unregister<T extends Signal>(type: SignalConstructor<T>, listener: SignalListener<T>): void;
}

export class DefaultSignalHandlerImpls {
  static map() {
    return new Map<SignalConstructor, SignalSubscription[]>();
  }

  static fire<S extends Signal, C extends SignalConstructor<S>>(
    handler: ISignalHandler,
    type: C,
    ...params: ConstructorParameters<C>
  ): S {
    const signal: S = new type(...params);

    const subscriptions_ = handler[subs].get(type);
    if (!subscriptions_) return signal;
    const subscriptions = [...subscriptions_];

    const len = subscriptions.length;
    for (let i = 0; i < len; i++) {
      subscriptions[i].listener(signal);
    }

    return signal;
  }

  static on<S extends Signal>(
    handler: ISignalHandler,
    type: SignalConstructor<S>,
    listener: SignalListener<S>,
    options: SignalListenerOptions = {},
  ): SignalSubscription<S> {
    const { priority = 0, abort } = options;

    // early return if abortsignal is already aborted
    if (abort?.aborted) {
      return {
        listener,
        priority,
        unsubscribe: () => {},
      };
    }

    const unsubscribe = () => {
      const idx = subscriptions.indexOf(subscription as SignalSubscription);
      if (idx !== -1) subscriptions.splice(idx, 1);
    };

    abort?.addEventListener("abort", () => unsubscribe());

    const subscriptions = handler[subs].get(type) ?? [];
    const subscription: SignalSubscription<S> = {
      listener,
      priority,
      unsubscribe,
    };

    // funny splicing for performance (instead of push() and sort())
    let idx = 0;
    while (idx < subscriptions.length) {
      if (subscriptions[idx].priority > priority) break;
      idx++;
    }
    subscriptions.splice(idx, 0, subscription as SignalSubscription);

    handler[subs].set(type, subscriptions);
    return subscription;
  }

  static unregister<S extends Signal>(
    handler: ISignalHandler,
    type: SignalConstructor<S>,
    listener: SignalListener<S>,
  ) {
    const subscriptions = handler[subs].get(type);
    if (!subscriptions) return;
    handler[subs].set(
      type,
      subscriptions.filter(it => it.listener !== listener),
    );
  }
}
export class BasicSignalHandler implements ISignalHandler {
  readonly [subs] = DefaultSignalHandlerImpls.map();

  fire<S extends Signal, C extends SignalConstructor<S>>(
    type: C,
    ...params: ConstructorParameters<C>
  ): S {
    return DefaultSignalHandlerImpls.fire(this, type, ...params);
  }

  on<S extends Signal>(
    type: SignalConstructor<S>,
    listener: SignalListener<S>,
    options: SignalListenerOptions = {},
  ): SignalSubscription<S> {
    return DefaultSignalHandlerImpls.on(this, type, listener, options);
  }

  unregister<T extends Signal>(type: SignalConstructor<T>, listener: SignalListener<T>): void {
    DefaultSignalHandlerImpls.unregister(this, type, listener);
  }
}
