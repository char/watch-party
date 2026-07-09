import { Signal } from "@char/aftercare";

export interface LocalPrefs {
  nickname: Signal<string>;
  displayColor: Signal<string>;
  volume: Signal<number>;
  controlsLocked: Signal<boolean>;
  subtitleDelayMs: Signal<number>;
  sidebarWidth: Signal<string>;
  mirrorByItem: Signal<Record<string, string | undefined>>;
}

export function createPrefs(): LocalPrefs {
  return {
    nickname: persistedString("watch-party/nickname", ""),
    displayColor: persistedString("watch-party/display-color", "#ffffff"),
    volume: persisted("watch-party/volume", 0.8),
    controlsLocked: persisted("watch-party/controls-locked", false),
    subtitleDelayMs: persisted("watch-party/subtitle-delay", 0),
    sidebarWidth: persistedString("watch-party/sidebar-width", "40ch"),
    mirrorByItem: persisted<Record<string, string | undefined>>("watch-party/mirrors", {}),
  };
}

const persistedString = (key: string, fallback: string) =>
  persisted(key, fallback, String, String);

function persisted<T>(
  key: string,
  fallback: T,
  stringify: (value: T) => string = JSON.stringify,
  parse: (stored: string) => T = JSON.parse,
): Signal<T> {
  const stored = localStorage.getItem(key);
  let value = fallback;
  try {
    if (stored !== null) value = parse(stored);
  } catch {
    // ignore corrupt local storage
  }

  const signal = new Signal(value);
  signal.subscribe(value => localStorage.setItem(key, stringify(value)));
  return signal;
}
