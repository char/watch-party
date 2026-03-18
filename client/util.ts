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

export function formatTime(ms: number): string {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (60 * 1000)) % 60);
  const hours = Math.floor((ms / (3600 * 1000)) % 3600);
  return `${hours < 10 ? "0" + hours : hours}:${
    minutes < 10 ? "0" + minutes : minutes
  }:${seconds < 10 ? "0" + seconds : seconds}`;
}
