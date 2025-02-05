import { createChat } from "./chat.tsx";
import { SessionConnection } from "./connection.ts";
import { PlayheadOverride } from "./session.ts";

export function createPlayer(connection: SessionConnection) {
  const { session } = connection;

  const player = (
    <div id="player">
      <div id="video-container"></div>
      <div id="chat-resizer"></div>
      <div id="chat-container">{createChat(connection)}</div>
    </div>
  );
  const videoContainer = player.querySelector("#video-container")!;

  let videoElement: HTMLVideoElement | undefined = undefined;
  session.currentVideo.subscribeImmediate(videoItem => {
    if (videoElement !== undefined) videoElement.remove();
    const video = (
      <video crossOrigin="anonymous" controls>
        <source src={videoItem.video} />
      </video>
    ) as HTMLVideoElement;
    videoElement = video;

    video.currentTime = session.playhead / 1000;
    if (!session.paused) void video.play();

    session.on(PlayheadOverride, event => {
      if (event.originator === "local") return;
      video!.currentTime = session.playhead / 1000;
      if (event.paused) video.pause();
      else video.play();
    });

    let overrideDebounce: number | undefined = undefined;
    const emitPlayhead = (playhead: number, paused: boolean) => {
      const DEBOUNCE_TIME = 1000 / 15;
      if (overrideDebounce) clearTimeout(overrideDebounce);
      overrideDebounce = setTimeout(() => {
        session.fire(PlayheadOverride, "local", Date.now(), playhead + DEBOUNCE_TIME, paused);
        overrideDebounce = undefined;
      }, DEBOUNCE_TIME);
    };

    const changePlayhead = () => {
      const playhead = video.currentTime * 1000;
      if (Math.abs(playhead - session.playhead) > 500) emitPlayhead(playhead, session.paused);
    };
    const changePaused = (paused: boolean) => () => {
      if (paused !== session.paused) emitPlayhead(video.currentTime * 1000, paused);
    };

    video.addEventListener("seeking", changePlayhead);
    video.addEventListener("seeked", changePlayhead);
    video.addEventListener("playing", changePlayhead);
    video.addEventListener("play", changePaused(false));
    video.addEventListener("pause", changePaused(true));

    videoContainer.append(video);
  });

  return player;
}
