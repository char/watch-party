import { playheadAt, type ClientCommand, type PlaylistItem } from "../../common/model.ts";
import type { LocalPrefs } from "../prefs.ts";
import type { Session } from "../session.ts";

export interface MediaController {
  readonly elem: HTMLElement;
  dispose(): void;
}

export function createMediaController(session: Session, prefs: LocalPrefs): MediaController {
  if (session.room.config.autoLock) prefs.controlsLocked.set(true);

  const abort = new AbortController();
  const elem = (<div id="video-container" />) as HTMLElement;
  const empty = <div class="video-status">There is no video currently playing.</div>;
  let media: HTMLMediaElement | undefined;
  let originalCueTimes = new WeakMap<TextTrackCue, { startTime: number; endTime: number }>();
  let suppressLocalEventsUntil = 0;
  let emitTimer: ReturnType<typeof setTimeout> | undefined;

  const chooseUrl = (item: PlaylistItem): string | undefined => {
    const selected = prefs.mirrorByItem.get()[item.id];
    if (item.mirrors.length) return selected;
    return item.video;
  };

  const render = (item: PlaylistItem | undefined) => {
    media?.remove();
    media = undefined;
    elem.textContent = "";

    if (!item) {
      elem.append(empty);
      return;
    }

    const url = chooseUrl(item);
    if (!url) {
      elem.append(mirrorPicker(item));
      return;
    }

    const next = item.isAudio
      ? ((
          <audio crossOrigin="anonymous" controls>
            <source src={url} />
          </audio>
        ) as HTMLMediaElement)
      : ((
          <video crossOrigin="anonymous" controls>
            <source src={url} />
            {...item.subtitles.map((track, index) => (
              <track kind="captions" label={track.name} src={track.url} default={index === 0} />
            ))}
          </video>
        ) as HTMLMediaElement);

    media = next;
    originalCueTimes = new WeakMap();
    media.volume = prefs.volume.get();
    attachMediaEvents(next);
    elem.append(next);
    applyPlayback(true);
  };

  const mirrorPicker = (item: PlaylistItem) => {
    const setMirror = (url: string) => {
      prefs.mirrorByItem.set({ ...prefs.mirrorByItem.get(), [item.id]: url });
      render(item);
    };

    return (
      <div id="mirror-picker">
        <h2>select a mirror:</h2>
        <button type="button" _onclick={() => setMirror(item.video)}>
          {item.video}
        </button>
        {...item.mirrors.map(url => (
          <button type="button" _onclick={() => setMirror(url)}>
            {url}
          </button>
        ))}
      </div>
    );
  };

  const applyPlayback = (force = false) => {
    if (!media) return;
    const playback = session.room.playback;
    const desired = playheadAt(playback, session.serverNow()) / 1000;
    const drift = desired - media.currentTime;

    suppressLocalEventsUntil = Date.now() + 300;
    if (force || Math.abs(drift) > 0.5) media.currentTime = Math.max(0, desired);
    if (playback.paused) media.pause();
    else if (media.parentElement) void media.play();
  };

  const attachMediaEvents = (target: HTMLMediaElement) => {
    target.addEventListener(
      "volumechange",
      () => {
        prefs.volume.set(target.volume);
      },
      { signal: abort.signal },
    );
    target.addEventListener("loadedmetadata", () => applySubtitleDelay(), {
      signal: abort.signal,
    });
    for (const track of target.querySelectorAll("track"))
      track.addEventListener("load", () => applySubtitleDelay(), { signal: abort.signal });

    target.addEventListener("seeking", () => emitPlayback(target.paused), {
      signal: abort.signal,
    });
    target.addEventListener("play", () => emitPlayback(false), {
      signal: abort.signal,
    });
    target.addEventListener("pause", () => emitPlayback(true), {
      signal: abort.signal,
    });
  };

  const emitPlayback = (paused: boolean) => {
    if (!media || Date.now() < suppressLocalEventsUntil) return;
    if (prefs.controlsLocked.get()) {
      send({ type: "playback/request-sync" });
      applyPlayback(true);
      return;
    }

    if (emitTimer !== undefined) clearTimeout(emitTimer);
    emitTimer = setTimeout(() => {
      if (!media) return;
      send({
        type: "playback/set",
        positionMs: media.currentTime * 1000,
        paused,
      });
      emitTimer = undefined;
    }, 75);
  };

  const applySubtitleDelay = () => {
    const video = media instanceof HTMLVideoElement ? media : undefined;
    if (!video) return;
    const delaySeconds = prefs.subtitleDelayMs.get() / 1000;
    for (const track of Array.from(video.textTracks)) {
      if (!track.cues) continue;
      for (const cue of Array.from(track.cues)) {
        let original = originalCueTimes.get(cue);
        if (!original) {
          original = { startTime: cue.startTime, endTime: cue.endTime };
          originalCueTimes.set(cue, original);
        }
        cue.startTime = original.startTime + delaySeconds;
        cue.endTime = original.endTime + delaySeconds;
      }
      const mode = track.mode;
      track.mode = "disabled";
      track.mode = mode;
    }
  };

  const send = (command: ClientCommand) => session.send(command);

  render(session.room.playlist.find(item => item.id === session.room.currentItemId));
  session.onRoomChange((room, previous) => {
    const item = room.playlist.find(item => item.id === room.currentItemId);
    const previousItem = previous.playlist.find(item => item.id === previous.currentItemId);
    if (item !== previousItem) render(item);
    if (room.playback !== previous.playback) applyPlayback();
  });
  prefs.volume.subscribe(volume => {
    if (media && Math.abs(media.volume - volume) > 0.001) media.volume = volume;
  });
  prefs.subtitleDelayMs.subscribe(() => applySubtitleDelay());

  const reportInterval = setInterval(() => {
    if (!media) return;
    session.send({
      type: "playhead/report",
      positionMs: media.currentTime * 1000,
      paused: media.paused,
    });
  }, 500);
  abort.signal.addEventListener("abort", () => clearInterval(reportInterval), {
    once: true,
  });

  return {
    elem,
    dispose() {
      abort.abort();
      media?.remove();
    },
  };
}
