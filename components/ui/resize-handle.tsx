"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A draggable divider for a side panel.
 *
 * `side` says which edge of the *viewport* the panel is docked to, which is
 * what decides whether dragging right grows or shrinks it. Keyboard users get
 * the same control through arrow keys - a drag handle on its own leaves the
 * panel un-resizable without a pointer, which is a WCAG 2.1.1 failure.
 */
export function ResizeHandle({
  side,
  width,
  min,
  max,
  onWidthChange,
  onDoubleClick,
  label,
}: {
  side: "left" | "right";
  width: number;
  min: number;
  /** a number, or a function of window width for a ratio cap */
  max: number | (() => number);
  onWidthChange: (w: number) => void;
  /** usually "reset to default" */
  onDoubleClick?: () => void;
  label: string;
}) {
  const [dragging, setDragging] = React.useState(false);
  const maxOf = React.useCallback(
    () => (typeof max === "function" ? max() : max),
    [max]
  );
  const clamp = React.useCallback(
    (w: number) => Math.min(Math.max(w, min), maxOf()),
    [min, maxOf]
  );

  const start = (clientX: number) => {
    const startX = clientX;
    const startW = width;
    setDragging(true);

    const move = (x: number) =>
      onWidthChange(clamp(startW + (side === "left" ? x - startX : startX - x)));

    const onMouseMove = (e: MouseEvent) => move(e.clientX);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) move(e.touches[0].clientX);
    };
    const stop = () => {
      setDragging(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", stop);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", stop);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", stop);
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", stop);
    // without these the drag selects text across the whole page
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 80 : 16;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onWidthChange(clamp(width + (side === "left" ? -step : step)));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onWidthChange(clamp(width + (side === "left" ? step : -step)));
    } else if (e.key === "Home") {
      e.preventDefault();
      onWidthChange(min);
    } else if (e.key === "End") {
      e.preventDefault();
      onWidthChange(maxOf());
    }
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={Math.round(maxOf())}
      onMouseDown={(e) => {
        e.preventDefault();
        start(e.clientX);
      }}
      onTouchStart={(e) => {
        if (e.touches[0]) start(e.touches[0].clientX);
      }}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      title={`${label} - drag, or use arrow keys${onDoubleClick ? "; double-click to reset" : ""}`}
      className={cn(
        "group absolute top-0 z-30 flex h-full w-2 cursor-col-resize items-center justify-center",
        side === "left" ? "-right-1" : "-left-1",
        dragging ? "bg-accentc/25" : "hover:bg-accentc/20"
      )}
    >
      <div
        className={cn(
          "h-10 w-0.5 rounded transition-colors",
          dragging ? "bg-accentc" : "bg-white/15 group-hover:bg-accentc/70"
        )}
      />
    </div>
  );
}
