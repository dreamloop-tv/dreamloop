"use client";

import { useRef } from "react";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export default function VideoPlayer({
  id,
  title,
  poster,
}: {
  id: string;
  title: string;
  poster?: string;
}) {
  const fired = useRef(false);

  return (
    <video
      controls
      preload="metadata"
      poster={poster}
      src={`/api/stream/${id}`}
      className="aspect-video w-full rounded-xl bg-black"
      onPlay={() => {
        if (fired.current) return;
        fired.current = true;
        window.gtag?.("event", "video_play", { video_id: id, video_title: title });
      }}
    />
  );
}
