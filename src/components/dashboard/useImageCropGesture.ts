"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

export type CropPoint = {
  x: number;
  y: number;
};

type PinchGesture = {
  distance: number;
  center: CropPoint;
  centerRelativeToPreview: CropPoint;
  zoom: number;
  offset: CropPoint;
};

type Options = {
  enabled: boolean;
  minZoom: number;
  maxZoom: number;
  zoom: number;
  offset: CropPoint;
  clampOffset: (nextOffset: CropPoint, nextZoom: number) => CropPoint;
  onTransform: (nextZoom: number, nextOffset: CropPoint) => void;
};

function getPinchMetrics(pointers: Map<number, CropPoint>) {
  const [first, second] = Array.from(pointers.values());
  if (!first || !second) return null;

  return {
    center: {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    },
    distance: Math.hypot(second.x - first.x, second.y - first.y),
  };
}

export function useImageCropGesture({
  enabled,
  minZoom,
  maxZoom,
  zoom,
  offset,
  clampOffset,
  onTransform,
}: Options) {
  const activePointersRef = useRef<Map<number, CropPoint>>(new Map());
  const pinchGestureRef = useRef<PinchGesture | null>(null);
  const zoomRef = useRef(zoom);
  const offsetRef = useRef(offset);
  const [isInteracting, setIsInteracting] = useState(false);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const applyTransform = useCallback(
    (nextZoom: number, nextOffset: CropPoint) => {
      zoomRef.current = nextZoom;
      offsetRef.current = nextOffset;
      onTransform(nextZoom, nextOffset);
    },
    [onTransform]
  );

  const resetGesture = useCallback(() => {
    activePointersRef.current.clear();
    pinchGestureRef.current = null;
    setIsInteracting(false);
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        !enabled ||
        (event.pointerType === "mouse" && event.button !== 0) ||
        activePointersRef.current.has(event.pointerId) ||
        activePointersRef.current.size >= 2
      ) {
        return;
      }

      event.preventDefault();
      activePointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      setIsInteracting(true);
      event.currentTarget.setPointerCapture(event.pointerId);

      if (activePointersRef.current.size === 2) {
        const metrics = getPinchMetrics(activePointersRef.current);
        if (!metrics) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        pinchGestureRef.current = {
          distance: Math.max(metrics.distance, 1),
          center: metrics.center,
          centerRelativeToPreview: {
            x: metrics.center.x - (bounds.left + bounds.width / 2),
            y: metrics.center.y - (bounds.top + bounds.height / 2),
          },
          zoom: zoomRef.current,
          offset: { ...offsetRef.current },
        };
      }
    },
    [enabled]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const previousPoint = activePointersRef.current.get(event.pointerId);
      if (!previousPoint) return;

      event.preventDefault();
      activePointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      if (activePointersRef.current.size === 2) {
        const metrics = getPinchMetrics(activePointersRef.current);
        const gesture = pinchGestureRef.current;
        if (!metrics || !gesture) return;

        const nextZoom = Math.max(
          minZoom,
          Math.min(
            maxZoom,
            gesture.zoom * (metrics.distance / gesture.distance)
          )
        );
        const zoomRatio = nextZoom / gesture.zoom;
        const centerDelta = {
          x: metrics.center.x - gesture.center.x,
          y: metrics.center.y - gesture.center.y,
        };
        const focalPoint = {
          x: gesture.centerRelativeToPreview.x - gesture.offset.x,
          y: gesture.centerRelativeToPreview.y - gesture.offset.y,
        };
        const nextOffset = clampOffset(
          {
            x:
              gesture.offset.x +
              centerDelta.x +
              (1 - zoomRatio) * focalPoint.x,
            y:
              gesture.offset.y +
              centerDelta.y +
              (1 - zoomRatio) * focalPoint.y,
          },
          nextZoom
        );

        applyTransform(nextZoom, nextOffset);
        return;
      }

      pinchGestureRef.current = null;
      applyTransform(
        zoomRef.current,
        clampOffset(
          {
            x: offsetRef.current.x + event.clientX - previousPoint.x,
            y: offsetRef.current.y + event.clientY - previousPoint.y,
          },
          zoomRef.current
        )
      );
    },
    [applyTransform, clampOffset, maxZoom, minZoom]
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!activePointersRef.current.has(event.pointerId)) return;

      activePointersRef.current.delete(event.pointerId);
      pinchGestureRef.current = null;
      setIsInteracting(activePointersRef.current.size > 0);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    []
  );

  return {
    isInteracting,
    resetGesture,
    cropGestureHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerEnd,
      onPointerCancel: handlePointerEnd,
      onLostPointerCapture: handlePointerEnd,
    },
  };
}
