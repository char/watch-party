import { SessionConnection } from "../state/connection.ts";
import { PlayheadOverride } from "../state/video-state.ts";
import { ChatWindow } from "./chat.tsx";

export function createPlayer(session: SessionConnection) {
  const chat = new ChatWindow(session);
  const player = (
    <div id="player">
      <div id="video-container"></div>
      <div id="chat-resizer"></div>
      <div id="chat-container">{chat.window}</div>
    </div>
  );
  const videoContainer = player.querySelector("#video-container")!;

  const noCurrentVideo = (
    <div className="video-status">There is no video currently playing.</div>
  );
  let videoElement: HTMLVideoElement | undefined = undefined;
  session.video.currentVideo.subscribeImmediate(videoItem => {
    if (videoItem === undefined) {
      videoContainer.append(noCurrentVideo);
      videoElement?.remove();
      return;
    } else {
      noCurrentVideo.remove();
    }

    if (videoElement !== undefined) videoElement.remove();

    const video = (
      <video crossOrigin="anonymous" controls>
        <source src={videoItem.video} />
        {...videoItem.subtitles
          .map(s => (<track kind="captions" label={s.name} src={s.url} />) as HTMLTrackElement)
          .tap(list => {
            if (list[0]) list[0].default = true;
          })}
      </video>
    ) as HTMLVideoElement;
    video.volume = 0.8;
    videoElement = video;

    video.currentTime = session.video.playhead / 1000;
    if (!session.video.paused) void video.play();

    session.video.on(PlayheadOverride, event => {
      if (event.originator === "local") return;
      video!.currentTime = session.video.playhead / 1000;
      if (event.paused) video.pause();
      else video.play();
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

    videoContainer.append(video);
  });

  return player;
}
