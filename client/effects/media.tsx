import {
  playheadAt,
  suggestedSubtitleDelay,
  type ClientCommand,
  type PlaylistItem,
} from "../../common/model.ts";
import type { LocalPrefs } from "../prefs.ts";
import type { Session } from "../session.ts";

export interface MediaController {
  readonly elem: HTMLElement;
  activeSubtitleTrackIndex(): number | undefined;
  setSubtitleDelay(delayMs: number): void;
  dispose(): void;
}

export function createMediaController(session: Session, prefs: LocalPrefs): MediaController {
  if (session.room.config.autoLock) prefs.controlsLocked.set(true);

  const abort = new AbortController();
  const elem = (<div id="video-container" />) as HTMLElement;
  const empty = <div class="video-status">There is no video currently playing.</div>;
  let media: HTMLMediaElement | undefined;
  let renderedItemId: string | undefined;
  let originalCueTimes = new WeakMap<TextTrackCue, { startTime: number; endTime: number }>();
  let subtitleDelays = new WeakMap<TextTrack, number>();
  let previousSubtitleTrackIndex: number | undefined;
  let suppressLocalEventsUntil = 0;
  let emitTimer: ReturnType<typeof setTimeout> | undefined;

  const chooseUrl = (item: PlaylistItem): string | undefined => {
    const selected = prefs.mirrorByItem.get()[item.id];
    if (item.mirrors.length) return selected;
    return item.video;
  };

  const render = (item: PlaylistItem | undefined) => {
    const previousTrackIndex = activeSubtitleTrackIndex();
    const previousTrack =
      media instanceof HTMLVideoElement && previousTrackIndex !== undefined
        ? media.textTracks[previousTrackIndex]
        : undefined;
    const wasFollowing =
      previousTrack &&
      renderedItemId &&
      (subtitleDelays.get(previousTrack) ?? prefs.subtitleDelayMs.get()) ===
        suggestedSubtitleDelay(session.room, renderedItemId, previousTrackIndex!);

    media?.remove();
    media = undefined;
    renderedItemId = item?.id;
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
    subtitleDelays = new WeakMap();
    if (wasFollowing && media instanceof HTMLVideoElement) {
      for (const [trackIndex, track] of Array.from(media.textTracks).entries())
        subtitleDelays.set(track, suggestedSubtitleDelay(session.room, item.id, trackIndex));
    }
    previousSubtitleTrackIndex = undefined;
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
    if (target instanceof HTMLVideoElement) {
      previousSubtitleTrackIndex = activeSubtitleTrackIndex();
      target.textTracks.addEventListener("change", () => queueMicrotask(subtitleTrackChanged), {
        signal: abort.signal,
      });
    }

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

  const activeSubtitleTrackIndex = (): number | undefined => {
    if (!(media instanceof HTMLVideoElement)) return undefined;
    const tracks = Array.from(media.textTracks);
    const index = tracks.findIndex(track => track.mode === "showing");
    const enabledIndex =
      index < 0 ? tracks.findIndex(track => track.mode !== "disabled") : index;
    return enabledIndex < 0 ? undefined : enabledIndex;
  };

  const applySubtitleDelay = (onlyTrack?: TextTrack) => {
    const video = media instanceof HTMLVideoElement ? media : undefined;
    if (!video) return;
    const tracks = onlyTrack ? [onlyTrack] : Array.from(video.textTracks);
    for (const track of tracks) {
      if (!track.cues) continue;
      const delaySeconds = (subtitleDelays.get(track) ?? prefs.subtitleDelayMs.get()) / 1000;
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

  const subtitleTrackChanged = () => {
    const itemId = session.room.currentItemId;
    const trackIndex = activeSubtitleTrackIndex();
    if (
      !(media instanceof HTMLVideoElement) ||
      !itemId ||
      trackIndex === undefined ||
      trackIndex === previousSubtitleTrackIndex
    ) {
      previousSubtitleTrackIndex = trackIndex;
      return;
    }

    const tracks = Array.from(media.textTracks);
    const previousTrack =
      previousSubtitleTrackIndex === undefined ? undefined : tracks[previousSubtitleTrackIndex];
    const wasFollowing =
      previousTrack &&
      (subtitleDelays.get(previousTrack) ?? prefs.subtitleDelayMs.get()) ===
        suggestedSubtitleDelay(session.room, itemId, previousSubtitleTrackIndex!);
    const track = tracks[trackIndex];
    if (wasFollowing) {
      subtitleDelays.set(track, suggestedSubtitleDelay(session.room, itemId, trackIndex));
      applySubtitleDelay(track);
    }
    previousSubtitleTrackIndex = trackIndex;
  };

  const setSubtitleDelay = (delayMs: number) => {
    prefs.subtitleDelayMs.set(delayMs);
    if (!(media instanceof HTMLVideoElement)) return;
    const trackIndex = activeSubtitleTrackIndex();
    if (trackIndex === undefined) return;
    const track = media.textTracks[trackIndex];
    subtitleDelays.set(track, delayMs);
    applySubtitleDelay(track);
  };

  const send = (command: ClientCommand) => session.send(command);

  render(session.room.playlist.find(item => item.id === session.room.currentItemId));
  session.onRoomChange((room, previous) => {
    const item = room.playlist.find(item => item.id === room.currentItemId);
    const previousItem = previous.playlist.find(item => item.id === previous.currentItemId);
    if (item !== previousItem) render(item);
    if (room.playback !== previous.playback) applyPlayback();

    if (!(media instanceof HTMLVideoElement) || !item) return;
    for (const [trackIndex, track] of Array.from(media.textTracks).entries()) {
      const previousDelay = suggestedSubtitleDelay(previous, item.id, trackIndex);
      const delay = suggestedSubtitleDelay(room, item.id, trackIndex);
      if (
        delay !== previousDelay &&
        (subtitleDelays.get(track) ?? prefs.subtitleDelayMs.get()) === previousDelay
      ) {
        subtitleDelays.set(track, delay);
        applySubtitleDelay(track);
      }
    }
  });
  prefs.volume.subscribe(volume => {
    if (media && Math.abs(media.volume - volume) > 0.001) media.volume = volume;
  });

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
    activeSubtitleTrackIndex,
    setSubtitleDelay,
    dispose() {
      abort.abort();
      media?.remove();
    },
  };
}
