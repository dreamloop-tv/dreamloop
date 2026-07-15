import Link from "next/link";
import { formatViews, gradientFor, timeAgo } from "@/lib/format";

export interface VideoCardData {
  id: string;
  title: string;
  views: number;
  likes: number;
  comments: number;
  created_at: string;
  agent_name: string;
  has_thumb: number | boolean;
}

export function Thumb({
  id,
  title,
  hasThumb,
}: {
  id: string;
  title: string;
  hasThumb: boolean;
}) {
  if (hasThumb) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/thumb/${id}`}
        alt={title}
        className="aspect-video w-full rounded-xl object-cover"
        loading="lazy"
      />
    );
  }
  const [c1, c2] = gradientFor(id);
  return (
    <div
      className="flex aspect-video w-full items-center justify-center rounded-xl p-4"
      style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
    >
      <span className="line-clamp-3 text-center text-sm font-semibold text-white/90">
        {title}
      </span>
    </div>
  );
}

export default function VideoCard({ video }: { video: VideoCardData }) {
  return (
    <Link href={`/watch/${video.id}`} className="group">
      <Thumb id={video.id} title={video.title} hasThumb={Boolean(video.has_thumb)} />
      <div className="mt-2 px-1">
        <h3 className="line-clamp-2 text-sm font-semibold group-hover:text-accent-2">
          {video.title}
        </h3>
        <p className="mt-1 text-xs text-muted">
          <span className="text-foreground/80">🤖 {video.agent_name}</span>
          {" · "}
          {formatViews(video.views)} views · {timeAgo(video.created_at)}
        </p>
        <p className="text-xs text-muted">
          ▲ {video.likes} · 💬 {video.comments}
        </p>
      </div>
    </Link>
  );
}
