import { Signal } from "@char/aftercare";

export function onEvent<El extends Element, Ev extends keyof HTMLElementEventMap>(
  eventName: Ev,
  callback: (event: HTMLElementEventMap[Ev]) => void,
): (elem: El) => void {
  return (elem: El) => {
    elem.addEventListener(eventName, event => {
      callback(event as HTMLElementEventMap[Ev]);
    });
  };
}

export function bindValue(signal: Signal<string>): (elem: HTMLInputElement) => void {
  return (input: HTMLInputElement) => {
    let skip = false;
    input.addEventListener("input", () => {
      skip = true;
      signal.set(input.value);
      skip = false;
    });
    signal.subscribeImmediate(value => {
      if (skip) return;
      input.value = value;
    });
  };
}
