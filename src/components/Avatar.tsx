// Pixel-art artist avatar drawn as crisp SVG rectangles from the player's look.
import { memo } from "react";
import { GRID_H, GRID_W, buildAvatar, type Look } from "../game/looks";

export const Avatar = memo(function Avatar({ look, size = 96, className = "", title }: { look: Look; size?: number; className?: string; title?: string }) {
  const px = buildAvatar(look);
  return (
    <svg viewBox={`0 0 ${GRID_W} ${GRID_H}`} width={(size * GRID_W) / GRID_H} height={size} shapeRendering="crispEdges" className={className} role="img" aria-label={title ?? "Artist look"}>
      {px.map((p, i) => <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.c} />)}
    </svg>
  );
});
