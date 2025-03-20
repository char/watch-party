import { PlaylistItem } from "../../common/playlist.ts";
import { SessionConnection } from "../state/connection.ts";
import { PlayheadOverride } from "../state/video-state.ts";
import { onEvent } from "../util.ts";
import { ChatWindow } from "./chat.tsx";

export function createPlayer(session: SessionConnection) {
  const chat = new ChatWindow(session);
  const player = (
    <div id="player">
      <div id="video-container"></div>
      <div id="sidebar-resizer"></div>
      <div id="sidebar">{chat.window}</div>
    </div>
  );
  const videoContainer = player.querySelector("#video-container")!;

  {
    const resizer = player.querySelector("#sidebar-resizer") as HTMLElement;
    let resizingX: number | undefined = undefined;

    resizer.addEventListener("pointerdown", e => {
      e.preventDefault();
      resizingX = e.clientX;
    });
    window.addEventListener("pointermove", e => {
      if (resizingX === undefined) return;
      const playerRect = player.getBoundingClientRect();
      const width = playerRect.right - e.clientX + resizer.getBoundingClientRect().width / 2;
      const widthPct = (width / playerRect.width) * 100;
      player.style.setProperty("--chat-width", `${widthPct.toFixed(2)}%`);
    });
    window.addEventListener("pointerup", () => {
      resizingX = undefined;
    });
  }

  const noCurrentVideo = (
    <div className="video-status">There is no video currently playing.</div>
  );
  let videoElement: HTMLVideoElement | undefined = undefined;
  const showVideo = (url: string, subtitles: PlaylistItem["subtitles"]) => {
    noCurrentVideo.remove();
    if (videoElement !== undefined) videoElement.remove();

    const video = (
      <video crossOrigin="anonymous" controls>
        <source src={url} />
        {...subtitles
          .map(s => (<track kind="captions" label={s.name} src={s.url} />) as HTMLTrackElement)
          .tap(list => {
            if (list[0]) list[0].default = true;
          })}
      </video>
    ) as HTMLVideoElement;
    video.volume =
      localStorage
        .getItem("watch-party/last-volume")
        ?.pipe(Number)
        .pipe(it => (Number.isFinite(it) ? it : undefined)) ?? 0.8;
    videoElement = video;
    videoContainer.append(video);
    video.currentTime = session.video.playhead / 1000;
    if (!session.video.paused) void video.play();

    session.video.on(PlayheadOverride, event => {
      if (event.originator === "local" && !event.forceHandleLocal) return;
      video!.currentTime = session.video.playhead / 1000;
      if (event.paused) video.pause();
      else {
        if (video.parentNode == null) return;
        video.play();
      }
    });

    let overrideDebounce: number | undefined = undefined;
    const emitPlayhead = (playhead: number, paused: boolean) => {
      const DEBOUNCE_TIME = 1000 / 15;
      if (overrideDebounce) clearTimeout(overrideDebounce);
      overrideDebounce = setTimeout(() => {
        session.video.fire(
          PlayheadOverride,
          "local",
          Date.now(),
          playhead + DEBOUNCE_TIME,
          paused,
        );
        overrideDebounce = undefined;
      }, DEBOUNCE_TIME);
    };

    const changePlayhead = () => {
      const playhead = video.currentTime * 1000;
      if (Math.abs(playhead - session.video.playhead) > 500)
        emitPlayhead(playhead, session.video.paused);
    };
    const changePaused = (paused: boolean) => () => {
      if (paused !== session.video.paused) emitPlayhead(video.currentTime * 1000, paused);
    };

    video.addEventListener("seeking", changePlayhead);
    // video.addEventListener("seeked", changePlayhead);
    // video.addEventListener("playing", changePlayhead);
    video.addEventListener("play", changePaused(false));
    video.addEventListener("pause", changePaused(true));

    video.addEventListener("volumechange", () => {
      localStorage.setItem("watch-party/last-volume", String(video.volume));
    });
  };

  session.video.currentVideo.subscribeImmediate(videoItem => {
    if (videoItem === undefined) {
      videoContainer.append(noCurrentVideo);
      videoElement?.remove();
      return;
    } else {
      noCurrentVideo.remove();
    }

    if (videoItem.mirrors.length) {
      // TODO: show a mirror picker :3
      const picker = (
        <div id="mirror-picker">
          <h2>select a mirror:</h2>

          <button
            type="button"
            _tap={onEvent("click", () => {
              picker.remove();
              showVideo(videoItem.video, videoItem.subtitles);
            })}
          >
            {videoItem.video}
          </button>

          {...videoItem.mirrors.map(mirror => (
            <button
              type="button"
              _tap={onEvent("click", () => {
                picker.remove();
                showVideo(mirror, videoItem.subtitles);
              })}
            >
              {mirror}
            </button>
          ))}
        </div>
      );
      videoContainer.append(picker);
    } else {
      showVideo(videoItem.video, videoItem.subtitles);
    }
  });

  const reportInterval = setInterval(() => {
    if (!videoElement) return;
    session.send({
      type: "ReportPlayhead",
      playhead: videoElement.currentTime * 1000,
      paused: videoElement.paused,
    });
  }, 500);
  session.abort.addEventListener("abort", () => clearInterval(reportInterval));

  return player;
}
