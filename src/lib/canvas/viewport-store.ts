'use client';

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import React from 'react';
import {
  type Viewport,
  DEFAULT_VIEWPORT,
  MIN_ZOOM,
  MAX_ZOOM,
} from '@/lib/canvas/types';

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type ViewportAction =
  | { type: 'PAN'; dx: number; dy: number }
  | { type: 'ZOOM_TO'; zoom: number; centerX: number; centerY: number }
  | { type: 'SET_VIEWPORT'; viewport: Viewport }
  | { type: 'RESET' };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function viewportReducer(state: Viewport, action: ViewportAction): Viewport {
  switch (action.type) {
    case 'PAN':
      return {
        ...state,
        x: state.x + action.dx,
        y: state.y + action.dy,
      };

    case 'ZOOM_TO': {
      const nextZoom = clampZoom(action.zoom);

      // Zoom centered on (centerX, centerY) in screen-space.
      // The world point under the cursor before the zoom:
      //   worldX = (centerX - state.x) / state.zoom
      //   worldY = (centerY - state.y) / state.zoom
      // After the zoom the same world point must stay under the cursor:
      //   centerX = worldX * nextZoom + nextX  =>  nextX = centerX - worldX * nextZoom
      const worldX = (action.centerX - state.x) / state.zoom;
      const worldY = (action.centerY - state.y) / state.zoom;

      return {
        x: action.centerX - worldX * nextZoom,
        y: action.centerY - worldY * nextZoom,
        zoom: nextZoom,
      };
    }

    case 'SET_VIEWPORT':
      return {
        x: action.viewport.x,
        y: action.viewport.y,
        zoom: clampZoom(action.viewport.zoom),
      };

    case 'RESET':
      return { ...DEFAULT_VIEWPORT };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ViewportContextValue {
  viewport: Viewport;
  pan: (dx: number, dy: number) => void;
  zoomTo: (zoom: number, centerX: number, centerY: number) => void;
  setViewport: (viewport: Viewport) => void;
  resetViewport: () => void;
}

const ViewportContext = createContext<ViewportContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ViewportProviderProps {
  children: ReactNode;
  initialViewport?: Viewport;
}

export function ViewportProvider({
  children,
  initialViewport,
}: ViewportProviderProps) {
  const [viewport, dispatch] = useReducer(
    viewportReducer,
    initialViewport ?? DEFAULT_VIEWPORT,
  );

  const pan = useCallback((dx: number, dy: number) => {
    dispatch({ type: 'PAN', dx, dy });
  }, []);

  const zoomTo = useCallback(
    (zoom: number, centerX: number, centerY: number) => {
      dispatch({ type: 'ZOOM_TO', zoom, centerX, centerY });
    },
    [],
  );

  const setViewport = useCallback((v: Viewport) => {
    dispatch({ type: 'SET_VIEWPORT', viewport: v });
  }, []);

  const resetViewport = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const value = useMemo<ViewportContextValue>(
    () => ({ viewport, pan, zoomTo, setViewport, resetViewport }),
    [viewport, pan, zoomTo, setViewport, resetViewport],
  );

  return React.createElement(
    ViewportContext.Provider,
    { value },
    children,
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useViewport(): ViewportContextValue {
  const ctx = useContext(ViewportContext);
  if (ctx === null) {
    throw new Error('useViewport must be used within a <ViewportProvider>');
  }
  return ctx;
}
