'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import type {
  BBox,
  CanvasDocument,
  CanvasPage as CanvasPageData,
  CanvasTool,
  Stroke,
  TextBox,
} from '@/types/canvas';
import { PAGE_WIDTH, PAGE_HEIGHT } from '@/types/canvas';
import type { Document } from '@/types/database';
import type { SaveStatus } from '@/hooks/use-auto-save';
import type { ConnectionStatus } from '@/hooks/use-realtime-sync';
import {
  ArrowLeft,
  BookOpen,
  Camera,
  Home,
  Pen,
  Type,
  Eraser,
  Highlighter,
  Undo2,
  Redo2,
  Trash2,
  Plus,
  PanelLeftOpen,
  PanelLeftClose,
  MousePointer2,
  Save,
  Sparkles,
  Download,
  Loader2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSidebar } from '@/components/dashboard/sidebar-layout';
import { CANVAS_TYPES } from '@/lib/constants/subjects';
import { PageTypeThumb } from '@/components/ui/page-type-thumb';
import { useDocumentSync } from '@/hooks/use-document-sync';
import { useDrawing } from '@/hooks/use-drawing';
import { useEraser } from '@/hooks/use-eraser';
import { useSelection } from '@/hooks/use-selection';
import { usePinchZoom } from '@/hooks/use-pinch-zoom';
import { ZoomIndicator } from './zoom-indicator';
import { EditorToolbar } from '@/components/editor/editor-toolbar';
import { useExportPdf } from '@/hooks/use-export-pdf';
import { CanvasPage } from './canvas-page';
import { usePdfBackground } from '@/hooks/use-pdf-background';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import type { SaveErrorType } from '@/hooks/use-auto-save';
import { MathInputBox } from '@/lib/editor/math-input-box';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractNodeText(node: any): string {
  if (!node) return '';
  if (node.type === 'mathExpression' && node.attrs?.latex) {
    return `$${node.attrs.latex}$`;
  }
  if (node.text != null) return node.text;
  if (!node.content || !Array.isArray(node.content)) return '';
  return node.content.map(extractNodeText).join('');
}

interface CanvasEditorProps {
  document: Document;
  onDocumentTextReady?: (getter: () => string) => void;
  materialId?: string | null;
  courseName?: string;
  onAskAiWithContext?: (
    context:
      | { type: 'text'; content: string }
      | { type: 'image'; dataUrl: string },
  ) => void;
}

const CANVAS_CLASSES: Record<string, string> = {
  blank: '',
  lined: 'canvas-lined',
  grid: 'canvas-grid',
  dotted: 'canvas-dotted',
};

/** Returns true if a page has any real content (strokes or typed text). */
function pageHasContent(page: CanvasPageData): boolean {
  if (page.strokes.length > 0) return true;
  if (!page.flowContent) return false;
  // An empty TipTap editor produces { type:'doc', content:[{type:'paragraph'}] }.
  // Real text contains a "text" key somewhere in the JSON.
  return JSON.stringify(page.flowContent).includes('"text"');
}

const PEN_COLORS = [
  '#000000',
  '#374151',
  '#DC2626',
  '#EA580C',
  '#CA8A04',
  '#16A34A',
  '#2563EB',
  '#7C3AED',
  '#DB2777',
  '#FFFFFF',
];

const HIGHLIGHTER_COLORS = [
  '#FBBF24',
  '#34D399',
  '#60A5FA',
  '#F472B6',
  '#A78BFA',
];

const PEN_SIZES = [
  { label: 'S', value: 1.5 },
  { label: 'M', value: 3 },
  { label: 'L', value: 5 },
  { label: 'XL', value: 8 },
];

const HIGHLIGHTER_SIZES = [
  { label: 'S', value: 16 },
  { label: 'M', value: 26 },
  { label: 'L', value: 40 },
];

const ERASER_SIZES = [
  { label: 'S', value: 6 },
  { label: 'M', value: 14 },
  { label: 'L', value: 24 },
];

function SaveIndicator({
  status,
  errorDetails,
  errorType,
  retryNow,
}: {
  status: SaveStatus;
  errorDetails?: string | null;
  errorType?: SaveErrorType;
  retryNow?: () => void;
}) {
  const labels: Record<SaveStatus, string> = {
    saved: 'Saved',
    saving: 'Saving...',
    unsaved: 'Unsaved',
    retrying: 'Retrying...',
    error: 'Error',
  };
  const colors: Record<SaveStatus, string> = {
    saved: 'text-green-600',
    saving: 'text-yellow-600',
    unsaved: 'text-red-600',
    retrying: 'text-amber-600',
    error: 'text-red-600',
  };

  const indicator = (
    <span
      className={`text-sm ${colors[status]} ${status === 'error' ? 'cursor-pointer underline decoration-dotted' : ''}`}
    >
      {labels[status]}
    </span>
  );

  if (status === 'error' && errorDetails) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{indicator}</TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="text-sm">{errorDetails}</p>
            {errorType === 'network' && retryNow && (
              <button
                onClick={retryNow}
                className="mt-1 text-sm font-medium text-blue-600 hover:text-blue-800 underline"
              >
                Retry now
              </button>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return indicator;
}

function ConnectionIndicator({
  status,
  isLockedByRemote,
}: {
  status: ConnectionStatus;
  isLockedByRemote: boolean;
}) {
  if (isLockedByRemote) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="inline-block h-2 w-2 rounded-full bg-yellow-500" />
        Editing elsewhere
      </span>
    );
  }
  const config: Record<ConnectionStatus, { color: string; label: string }> = {
    connected: { color: 'bg-green-500', label: 'Synced' },
    connecting: { color: 'bg-yellow-500', label: 'Connecting' },
    disconnected: { color: 'bg-red-500', label: 'Disconnected' },
  };
  const { color, label } = config[status];
  return (
    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function createEmptyPage(
  order: number,
  pageType?: string,
  seed?: string,
): CanvasPageData {
  return {
    id: seed
      ? `${seed}-p${order}`
      : Math.random().toString(36).slice(2) + Date.now().toString(36),
    order,
    pageType: pageType as CanvasPageData['pageType'],
    strokes: [],
    textBoxes: [],
    flowContent: null,
  };
}

/** Migrate flowContent to a text box on load.
 *  The text box height is set to a small estimate for selection purposes,
 *  but the TextBox component uses minHeight so content is never clipped. */
function migrateFlowContent(page: CanvasPageData): CanvasPageData {
  if (page.flowContent && page.textBoxes.length === 0) {
    // Estimate height from block count
    const doc = page.flowContent as { content?: unknown[] };
    const blockCount = doc?.content?.length ?? 1;
    const height = Math.max(blockCount * 30 + 20, 60);
    const textBox: TextBox = {
      id: `${page.id}-ftb`,
      x: 40,
      y: 40,
      width: PAGE_WIDTH - 80,
      height,
      content: page.flowContent,
      isFullPage: false,
      zIndex: 0,
    };
    return { ...page, textBoxes: [textBox], flowContent: null };
  }
  if (page.textBoxes.length > 0 && page.flowContent) {
    return { ...page, flowContent: null };
  }
  // Repair text boxes from previous migration:
  // - Set isFullPage to false (all text boxes are now content-sized)
  // - Fix oversized heights
  if (page.textBoxes.some((tb) => tb.isFullPage || tb.height > 200)) {
    return {
      ...page,
      textBoxes: page.textBoxes.map((tb) => {
        const needsHeightFix = tb.height > 200;
        const doc = tb.content as { content?: unknown[] } | null;
        const blockCount = doc?.content?.length ?? 1;
        return {
          ...tb,
          isFullPage: false,
          height: needsHeightFix
            ? Math.max(blockCount * 30 + 20, 60)
            : tb.height,
        };
      }),
    };
  }
  return page;
}

function initializePagesFromDocument(doc: Document): CanvasPageData[] {
  const pagesData = doc.pages as CanvasDocument | null;
  if (pagesData?.pages && pagesData.pages.length > 0) {
    const loaded = pagesData.pages.map(migrateFlowContent);
    // Always ensure a trailing empty page for infinite-scroll feel
    const lastPage = loaded[loaded.length - 1];
    if (pageHasContent(lastPage)) {
      const newType = lastPage.pageType || doc.canvas_type;
      return [...loaded, createEmptyPage(loaded.length, newType, doc.id)];
    }
    return loaded;
  }
  return [createEmptyPage(0, doc.canvas_type, doc.id)];
}

export function CanvasEditor({
  document,
  onDocumentTextReady,
  materialId,
  courseName,
  onAskAiWithContext,
}: CanvasEditorProps) {
  const router = useRouter();
  const { isOpen: sidebarOpen, toggle: toggleSidebar } = useSidebar();
  const { exportPdf, isExporting } = useExportPdf();
  const [title, setTitle] = useState(document.title);
  const [pages, setPages] = useState<CanvasPageData[]>(() =>
    initializePagesFromDocument(document),
  );
  const [activeTool, setActiveToolRaw] = useState<CanvasTool>('text');

  // Wrap setActiveTool to migrate flowContent → text boxes when entering Select
  const setActiveTool = useCallback((tool: CanvasTool) => {
    if (tool === 'select') {
      setPages((prev) => {
        let changed = false;
        const migrated = prev.map((page) => {
          const result = migrateFlowContent(page);
          if (result !== page) changed = true;
          return result;
        });
        return changed ? migrated : prev;
      });
    }
    setActiveToolRaw(tool);
  }, []);

  const [askAiDropdownOpen, setAskAiDropdownOpen] = useState(false);
  const askAiDropdownRef = useRef<HTMLDivElement>(null);
  const [askAiDropdownPos, setAskAiDropdownPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  // Close Ask AI dropdown on click outside
  useEffect(() => {
    if (!askAiDropdownOpen) return;
    const handler = (e: PointerEvent) => {
      if (
        askAiDropdownRef.current &&
        !askAiDropdownRef.current.contains(e.target as Node)
      ) {
        setAskAiDropdownOpen(false);
      }
    };
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, [askAiDropdownOpen]);

  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [remoteUpdateCounter, setRemoteUpdateCounter] = useState(0);

  // Math input ($ key → LaTeX conversion)
  const [mathInputPosition, setMathInputPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Add page popover
  const [addPagePopoverIndex, setAddPagePopoverIndex] = useState<number | null>(
    null,
  );

  // Drawing tool settings
  const [penColor, setPenColor] = useState('#000000');
  const [penSize, setPenSize] = useState(3);
  const [highlighterColor, setHighlighterColor] = useState('#FBBF24');
  const [highlighterSize, setHighlighterSize] = useState(20);
  const [eraserSize, setEraserSize] = useState(14);

  // Pinch-to-zoom: camera model — 100% = page fills container width
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const {
    camera,
    scale,
    zoom,
    isZooming,
    resetZoom,
    displayPercent,
    setCameraY,
  } = usePinchZoom({
    containerRef: scrollContainerRef,
    pageWidth: PAGE_WIDTH,
    contentHeight: pages.length * PAGE_HEIGHT,
  });

  // Auto-add missing pages when PDF has more pages than the document.
  const lastSyncedPageCount = useRef(0);
  const expandPagesIfNeeded = useCallback((count: number) => {
    if (count <= 0 || count <= lastSyncedPageCount.current) return;
    lastSyncedPageCount.current = count;
    setPages((prev) => {
      if (prev.length >= count) return prev;
      const expanded = [...prev];
      for (let i = prev.length; i < count; i++) {
        const page = createEmptyPage(i);
        expanded.push({ ...page, pdfPage: i });
      }
      return expanded;
    });
  }, []);

  // PDF background for material-backed documents
  const {
    renderPage: renderPdfPage,
    isLoading: pdfLoading,
    error: pdfError,
    pageCount: pdfPageCount,
  } = usePdfBackground(materialId ?? null, {
    onPageCountReady: expandPagesIfNeeded,
  });

  // Derived values based on active tool
  const currentColor =
    activeTool === 'highlighter' ? highlighterColor : penColor;
  const currentSize = activeTool === 'highlighter' ? highlighterSize : penSize;
  const currentOpacity = activeTool === 'highlighter' ? 0.4 : 1;

  // Undo/redo history (polymorphic actions)
  type CanvasAction =
    | { type: 'stroke-add'; pageId: string; stroke: Stroke }
    | { type: 'stroke-remove'; pageId: string; stroke: Stroke }
    | { type: 'textbox-add'; pageId: string; textBox: TextBox }
    | { type: 'textbox-remove'; pageId: string; textBox: TextBox }
    | {
        type: 'textbox-move';
        pageId: string;
        textBoxId: string;
        fromX: number;
        fromY: number;
        toX: number;
        toY: number;
      };
  const undoStackRef = useRef<CanvasAction[]>([]);
  const redoStackRef = useRef<CanvasAction[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);

  const pagesRef = useRef(pages);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  const getPagesData = useCallback((): Record<string, unknown> => {
    // Strip empty trailing pages — only save pages with content
    const all = pagesRef.current;
    let lastContentIndex = all.length - 1;
    while (lastContentIndex > 0 && !pageHasContent(all[lastContentIndex])) {
      lastContentIndex--;
    }
    const toSave = all.slice(0, lastContentIndex + 1).map((p) => ({
      ...p,
      // Strip transient contentBounds from text boxes before persisting
      textBoxes: p.textBoxes.map(({ contentBounds: _, ...tb }) => tb),
    }));
    return { pages: toSave } as unknown as Record<string, unknown>;
  }, []);

  const onRemoteTitleUpdate = useCallback((remoteTitle: string) => {
    setTitle(remoteTitle);
  }, []);

  const onRemotePagesUpdate = useCallback(
    (remotePagesData: Record<string, unknown>) => {
      const remote = remotePagesData as unknown as CanvasDocument;
      if (remote?.pages) {
        setPages(remote.pages);
        setRemoteUpdateCounter((c) => c + 1);
      }
    },
    [],
  );

  const {
    saveStatus,
    connectionStatus,
    isLockedByRemote,
    unlockEditor,
    triggerSave,
    saveTitle,
    manualSave,
    errorDetails,
    errorType,
    retryNow,
  } = useDocumentSync({
    documentId: document.id,
    editor: null,
    onRemoteTitleUpdate,
    getPagesData,
    onRemotePagesUpdate,
  });

  // Ctrl+S / Cmd+S keyboard shortcut for manual save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (saveStatus !== 'saved' && saveStatus !== 'saving') {
          manualSave();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveStatus, manualSave]);

  // Stroke management (with undo history + auto-add page)
  const handleStrokeAdd = useCallback(
    (pageId: string, stroke: Stroke) => {
      undoStackRef.current.push({ type: 'stroke-add', pageId, stroke });
      redoStackRef.current = [];
      if (undoStackRef.current.length > 100) undoStackRef.current.shift();
      setHistoryVersion((v) => v + 1);
      setPages((prev) => {
        const updated = prev.map((p) =>
          p.id === pageId ? { ...p, strokes: [...p.strokes, stroke] } : p,
        );
        // Auto-add page when the last page now has content
        const lastPage = updated[updated.length - 1];
        if (pageHasContent(lastPage)) {
          const newType = lastPage.pageType || document.canvas_type;
          return [...updated, createEmptyPage(updated.length, newType)];
        }
        return updated;
      });
      triggerSave();
    },
    [triggerSave, document.canvas_type],
  );

  const handleStrokeRemove = useCallback(
    (pageId: string, strokeId: string) => {
      const stroke = pagesRef.current
        .find((p) => p.id === pageId)
        ?.strokes.find((s) => s.id === strokeId);
      if (stroke) {
        undoStackRef.current.push({ type: 'stroke-remove', pageId, stroke });
        redoStackRef.current = [];
        if (undoStackRef.current.length > 100) undoStackRef.current.shift();
        setHistoryVersion((v) => v + 1);
      }
      setPages((prev) =>
        prev.map((p) =>
          p.id === pageId
            ? { ...p, strokes: p.strokes.filter((s) => s.id !== strokeId) }
            : p,
        ),
      );
      triggerSave();
    },
    [triggerSave],
  );

  // Flow content update handler (save only — auto-add is triggered by
  // overflow detection in CanvasPage, like Word/Google Docs)
  const handleFlowContentUpdate = useCallback(
    (pageId: string, content: Record<string, unknown>) => {
      setPages((prev) =>
        prev.map((p) => (p.id === pageId ? { ...p, flowContent: content } : p)),
      );
      triggerSave();
    },
    [triggerSave],
  );

  // Text box content update handler
  const handleTextBoxContentUpdate = useCallback(
    (pageId: string, textBoxId: string, content: Record<string, unknown>) => {
      setPages((prev) =>
        prev.map((p) => {
          if (p.id !== pageId) return p;
          return {
            ...p,
            textBoxes: p.textBoxes.map((tb) =>
              tb.id === textBoxId ? { ...tb, content } : tb,
            ),
          };
        }),
      );
      triggerSave();
    },
    [triggerSave],
  );

  // Auto-fit text box height to actual rendered content
  const handleTextBoxHeightMeasured = useCallback(
    (pageId: string, textBoxId: string, measuredHeight: number) => {
      setPages((prev) =>
        prev.map((p) => {
          if (p.id !== pageId) return p;
          const tb = p.textBoxes.find((t) => t.id === textBoxId);
          if (!tb || Math.abs(tb.height - measuredHeight) < 2) return p;
          return {
            ...p,
            textBoxes: p.textBoxes.map((t) =>
              t.id === textBoxId ? { ...t, height: measuredHeight } : t,
            ),
          };
        }),
      );
    },
    [],
  );

  // Auto-fit text box content bounds (tight horizontal bounds for selection)
  const handleTextBoxContentBoundsMeasured = useCallback(
    (
      pageId: string,
      textBoxId: string,
      bounds: { offsetX: number; width: number } | undefined,
    ) => {
      setPages((prev) =>
        prev.map((p) => {
          if (p.id !== pageId) return p;
          const tb = p.textBoxes.find((t) => t.id === textBoxId);
          if (!tb) return p;
          // Skip if bounds haven't meaningfully changed
          if (!bounds && !tb.contentBounds) return p;
          if (
            bounds &&
            tb.contentBounds &&
            Math.abs(tb.contentBounds.offsetX - bounds.offsetX) < 2 &&
            Math.abs(tb.contentBounds.width - bounds.width) < 2
          )
            return p;
          return {
            ...p,
            textBoxes: p.textBoxes.map((t) =>
              t.id === textBoxId ? { ...t, contentBounds: bounds } : t,
            ),
          };
        }),
      );
    },
    [],
  );

  const editorsRef = useRef<Map<string, Editor>>(new Map());

  // Register a getter function that extracts text from all page editors
  useEffect(() => {
    if (!onDocumentTextReady) return;
    onDocumentTextReady(() => {
      const texts: string[] = [];
      for (const [, editor] of editorsRef.current) {
        if (editor && !editor.isDestroyed) {
          const json = editor.getJSON();
          texts.push(extractNodeText(json));
        }
      }
      return texts.filter(Boolean).join('\n\n');
    });
  }, [onDocumentTextReady]);

  // Scroll so the top of a page is ~1/3 from the top of the viewport,
  // showing the divider and bottom of the previous page (like Word/Docs).
  const scrollToPage = useCallback(
    (pageId: string) => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const targetEl = container.querySelector(
        `[data-page-id="${pageId}"]`,
      ) as HTMLElement | null;
      if (targetEl) {
        const containerRect = container.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        const currentOffset = targetRect.top - containerRect.top;
        const desiredOffset = containerRect.height * 0.35;
        const delta = currentOffset - desiredOffset;
        setCameraY(camera.y - delta);
      }
    },
    [camera.y, setCameraY],
  );

  // Focus a page's editor by polling until it appears in editorsRef.
  // This is reliable for both existing pages and newly created ones
  // (where the editor mounts asynchronously after React renders).
  // Uses a ref for self-reference to satisfy lint rules.
  const focusPageRef = useRef<
    (
      pageId: string,
      overflowContent: Record<string, unknown> | null,
      isExistingPage: boolean,
      attempt?: number,
    ) => void
  >(() => {});

  const focusPage = useCallback(
    (
      pageId: string,
      overflowContent: Record<string, unknown> | null,
      isExistingPage: boolean,
      attempt = 0,
    ) => {
      const editor = editorsRef.current.get(pageId);
      if (editor) {
        // Merge overflow content into an existing page
        if (isExistingPage && overflowContent) {
          const existing = editor.getJSON() as {
            type?: string;
            content?: unknown[];
          };
          const merged = {
            type: 'doc',
            content: [
              ...((overflowContent as { content?: unknown[] }).content || []),
              ...(existing?.content || [{ type: 'paragraph' }]),
            ],
          };
          editor.commands.setContent(
            merged as unknown as Record<string, unknown>,
          );
        }
        editor.commands.focus('start');
        scrollToPage(pageId);
        return;
      }
      // Editor not mounted yet — retry (up to 1s)
      if (attempt < 20) {
        setTimeout(
          () =>
            focusPageRef.current(
              pageId,
              overflowContent,
              isExistingPage,
              attempt + 1,
            ),
          50,
        );
      }
    },
    [scrollToPage],
  );

  useEffect(() => {
    focusPageRef.current = focusPage;
  }, [focusPage]);

  // Editor ready / focus handler — registers editor in the map
  const handleEditorReady = useCallback((pageId: string, editor: Editor) => {
    editorsRef.current.set(pageId, editor);
    setActiveEditor(editor);
  }, []);

  // Listen for math input trigger from ProseMirror plugin ($ key press)
  useEffect(() => {
    const handleMathTrigger = (e: Event) => {
      const detail = (e as CustomEvent).detail as { x: number; y: number };
      setMathInputPosition(detail);
    };
    window.addEventListener('math-input-trigger', handleMathTrigger);
    return () => {
      window.removeEventListener('math-input-trigger', handleMathTrigger);
    };
  }, []);

  const handleMathSubmit = useCallback(
    async (text: string) => {
      if (!activeEditor) return;
      const res = await fetch('/api/ai/latex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, courseName }),
      });
      if (!res.ok) {
        setMathInputPosition(null);
        return;
      }
      const data = await res.json();
      activeEditor.chain().focus().insertMath(data.latex, text).run();
      setMathInputPosition(null);
      triggerSave();
    },
    [activeEditor, triggerSave, courseName],
  );

  const handleMathCancel = useCallback(() => {
    setMathInputPosition(null);
    activeEditor?.commands.focus();
  }, [activeEditor]);

  // Get strokes for a page (used by eraser + selection)
  const getPageStrokes = useCallback((pageId: string): Stroke[] => {
    return pagesRef.current.find((p) => p.id === pageId)?.strokes ?? [];
  }, []);

  // Get text boxes for a page (used by selection)
  const getPageTextBoxes = useCallback((pageId: string): TextBox[] => {
    return pagesRef.current.find((p) => p.id === pageId)?.textBoxes ?? [];
  }, []);

  // Auto-add page when drawing near the bottom of the last page
  const handleNearPageBottom = useCallback(
    (pageId: string) => {
      setPages((prev) => {
        const lastPage = prev[prev.length - 1];
        if (lastPage.id === pageId) {
          const newType = lastPage.pageType || document.canvas_type;
          return [...prev, createEmptyPage(prev.length, newType)];
        }
        return prev;
      });
    },
    [document.canvas_type],
  );

  // Text overflow handler — moves cursor (and optionally content) to the
  // next page, creating one if needed. Works on any page, like Word/Docs.
  const handleTextOverflow = useCallback(
    (pageId: string, overflowContent: Record<string, unknown> | null) => {
      let targetPageId: string | null = null;
      let isExisting = false;

      setPages((prev) => {
        const pageIndex = prev.findIndex((p) => p.id === pageId);
        if (pageIndex === -1) return prev;

        const nextPage = prev[pageIndex + 1];

        if (nextPage) {
          targetPageId = nextPage.id;
          isExisting = true;
          return prev;
        }

        // No next page — create one after the current page
        const currentPage = prev[pageIndex];
        const newType = currentPage.pageType || document.canvas_type;
        const newPage = createEmptyPage(pageIndex + 1, newType);
        if (overflowContent) {
          newPage.flowContent = overflowContent;
        }
        targetPageId = newPage.id;

        return [
          ...prev.slice(0, pageIndex + 1),
          newPage,
          ...prev.slice(pageIndex + 1),
        ].map((p, i) => ({ ...p, order: i }));
      });

      // Poll for the editor and focus it (handles both existing and new pages)
      if (targetPageId) {
        focusPage(
          targetPageId,
          isExisting ? overflowContent : null,
          isExisting,
        );
      }

      triggerSave();
    },
    [triggerSave, document.canvas_type, focusPage],
  );

  // Move strokes (used by selection drag)
  const handleStrokesMove = useCallback(
    (
      pageId: string,
      movedStrokes: { id: string; points: Stroke['points']; bbox: BBox }[],
    ) => {
      setPages((prev) =>
        prev.map((p) => {
          if (p.id !== pageId) return p;
          const moveMap = new Map(movedStrokes.map((m) => [m.id, m]));
          return {
            ...p,
            strokes: p.strokes.map((s) => {
              const moved = moveMap.get(s.id);
              return moved
                ? { ...s, points: moved.points, bbox: moved.bbox }
                : s;
            }),
          };
        }),
      );
      triggerSave();
    },
    [triggerSave],
  );

  // Move a text box (used by selection drag)
  const handleTextBoxMove = useCallback(
    (pageId: string, textBoxId: string, dx: number, dy: number) => {
      setPages((prev) =>
        prev.map((p) => {
          if (p.id !== pageId) return p;
          return {
            ...p,
            textBoxes: p.textBoxes.map((tb) =>
              tb.id === textBoxId
                ? { ...tb, x: tb.x + dx, y: tb.y + dy, isFullPage: false }
                : tb,
            ),
          };
        }),
      );
      triggerSave();
    },
    [triggerSave],
  );

  // Resize a text box (used by selection resize)
  const handleTextBoxResize = useCallback(
    (
      pageId: string,
      textBoxId: string,
      x: number,
      y: number,
      width: number,
      height: number,
      fontScale: number,
    ) => {
      setPages((prev) =>
        prev.map((p) => {
          if (p.id !== pageId) return p;
          return {
            ...p,
            textBoxes: p.textBoxes.map((tb) =>
              tb.id === textBoxId
                ? { ...tb, x, y, width, height, fontScale }
                : tb,
            ),
          };
        }),
      );
      triggerSave();
    },
    [triggerSave],
  );

  // Delete selected objects
  const handleDeleteSelected = useCallback(
    (pageId: string, strokeIds: string[], textBoxIds: string[]) => {
      // Push undo actions
      const page = pagesRef.current.find((p) => p.id === pageId);
      if (page) {
        for (const sid of strokeIds) {
          const stroke = page.strokes.find((s) => s.id === sid);
          if (stroke) {
            undoStackRef.current.push({
              type: 'stroke-remove',
              pageId,
              stroke,
            });
          }
        }
        for (const tbId of textBoxIds) {
          const tb = page.textBoxes.find((t) => t.id === tbId);
          if (tb) {
            undoStackRef.current.push({
              type: 'textbox-remove',
              pageId,
              textBox: tb,
            });
          }
        }
        redoStackRef.current = [];
        setHistoryVersion((v) => v + 1);
      }

      setPages((prev) =>
        prev.map((p) => {
          if (p.id !== pageId) return p;
          return {
            ...p,
            strokes: p.strokes.filter((s) => !strokeIds.includes(s.id)),
            textBoxes: p.textBoxes.filter((tb) => !textBoxIds.includes(tb.id)),
          };
        }),
      );
      triggerSave();
    },
    [triggerSave],
  );

  // Selection hook
  const {
    handlePointerDown: selectDown,
    handlePointerMove: selectMove,
    handlePointerUp: selectUp,
    selectionPath,
    selectedStrokeIds,
    selectedTextBoxIds,
    selectionBBox,
    tightSelectionBBox,
    isRectMode,
    isDragging: isSelectionDragging,
    dragOffset: selectionDragOffset,
    isResizing: isSelectionResizing,
    resizeBBox: selectionResizeBBox,
    clearSelection,
    deleteSelected,
  } = useSelection({
    activeTool,
    getPageStrokes,
    getPageTextBoxes,
    onStrokesMove: handleStrokesMove,
    onTextBoxMove: handleTextBoxMove,
    onTextBoxResize: handleTextBoxResize,
    onModeChange: setActiveTool,
    onDeleteSelected: handleDeleteSelected,
  });

  // Drawing hook
  const {
    handlePointerDown: drawDown,
    handlePointerMove: drawMove,
    handlePointerUp: drawUp,
  } = useDrawing({
    activeTool,
    penColor: currentColor,
    penSize: currentSize,
    penOpacity: currentOpacity,
    onStrokeComplete: handleStrokeAdd,
    onNearPageBottom: handleNearPageBottom,
  });

  // Eraser hook
  const {
    handlePointerDown: eraseDown,
    handlePointerMove: eraseMove,
    handlePointerUp: eraseUp,
    eraserPosition,
  } = useEraser({
    activeTool,
    eraserRadius: eraserSize,
    onStrokeRemove: handleStrokeRemove,
    getPageStrokes,
  });

  // Route pointer events to active tool's handler
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, pageId: string) => {
      drawDown(e, pageId);
      eraseDown(e, pageId);
      selectDown(e, pageId);
    },
    [drawDown, eraseDown, selectDown],
  );
  const handlePointerMove = useCallback(
    (e: React.PointerEvent, pageId: string) => {
      drawMove(e, pageId);
      eraseMove(e, pageId);
      selectMove(e, pageId);
    },
    [drawMove, eraseMove, selectMove],
  );
  const handlePointerUp = useCallback(
    (e: React.PointerEvent, pageId: string) => {
      drawUp(e, pageId);
      eraseUp(e, pageId);
      selectUp(e, pageId);
    },
    [drawUp, eraseUp, selectUp],
  );

  // Undo / Redo
  const handleUndo = useCallback(() => {
    if (activeTool === 'text' && activeEditor) {
      activeEditor.chain().focus().undo().run();
      return;
    }
    const action = undoStackRef.current.pop();
    if (!action) return;
    switch (action.type) {
      case 'stroke-add':
        setPages((prev) =>
          prev.map((p) =>
            p.id === action.pageId
              ? {
                  ...p,
                  strokes: p.strokes.filter((s) => s.id !== action.stroke.id),
                }
              : p,
          ),
        );
        break;
      case 'stroke-remove':
        setPages((prev) =>
          prev.map((p) =>
            p.id === action.pageId
              ? { ...p, strokes: [...p.strokes, action.stroke] }
              : p,
          ),
        );
        break;
      case 'textbox-add':
        setPages((prev) =>
          prev.map((p) =>
            p.id === action.pageId
              ? {
                  ...p,
                  textBoxes: p.textBoxes.filter(
                    (tb) => tb.id !== action.textBox.id,
                  ),
                }
              : p,
          ),
        );
        break;
      case 'textbox-remove':
        setPages((prev) =>
          prev.map((p) =>
            p.id === action.pageId
              ? { ...p, textBoxes: [...p.textBoxes, action.textBox] }
              : p,
          ),
        );
        break;
      case 'textbox-move':
        setPages((prev) =>
          prev.map((p) =>
            p.id === action.pageId
              ? {
                  ...p,
                  textBoxes: p.textBoxes.map((tb) =>
                    tb.id === action.textBoxId
                      ? { ...tb, x: action.fromX, y: action.fromY }
                      : tb,
                  ),
                }
              : p,
          ),
        );
        break;
    }
    redoStackRef.current.push(action);
    setHistoryVersion((v) => v + 1);
    triggerSave();
  }, [activeTool, activeEditor, triggerSave]);

  const handleRedo = useCallback(() => {
    if (activeTool === 'text' && activeEditor) {
      activeEditor.chain().focus().redo().run();
      return;
    }
    const action = redoStackRef.current.pop();
    if (!action) return;
    switch (action.type) {
      case 'stroke-add':
        setPages((prev) =>
          prev.map((p) =>
            p.id === action.pageId
              ? { ...p, strokes: [...p.strokes, action.stroke] }
              : p,
          ),
        );
        break;
      case 'stroke-remove':
        setPages((prev) =>
          prev.map((p) =>
            p.id === action.pageId
              ? {
                  ...p,
                  strokes: p.strokes.filter((s) => s.id !== action.stroke.id),
                }
              : p,
          ),
        );
        break;
      case 'textbox-add':
        setPages((prev) =>
          prev.map((p) =>
            p.id === action.pageId
              ? { ...p, textBoxes: [...p.textBoxes, action.textBox] }
              : p,
          ),
        );
        break;
      case 'textbox-remove':
        setPages((prev) =>
          prev.map((p) =>
            p.id === action.pageId
              ? {
                  ...p,
                  textBoxes: p.textBoxes.filter(
                    (tb) => tb.id !== action.textBox.id,
                  ),
                }
              : p,
          ),
        );
        break;
      case 'textbox-move':
        setPages((prev) =>
          prev.map((p) =>
            p.id === action.pageId
              ? {
                  ...p,
                  textBoxes: p.textBoxes.map((tb) =>
                    tb.id === action.textBoxId
                      ? { ...tb, x: action.toX, y: action.toY }
                      : tb,
                  ),
                }
              : p,
          ),
        );
        break;
    }
    undoStackRef.current.push(action);
    setHistoryVersion((v) => v + 1);
    triggerSave();
  }, [activeTool, activeEditor, triggerSave]);

  // Compute disabled state (draw mode only — text mode always enabled)
  // historyVersion is bumped whenever the undo/redo stacks change, so we
  // derive canUndo/canRedo from it without accessing refs during render.
  const [canUndoDraw, setCanUndoDraw] = useState(false);
  const [canRedoDraw, setCanRedoDraw] = useState(false);
  useEffect(() => {
    setCanUndoDraw(undoStackRef.current.length > 0);
    setCanRedoDraw(redoStackRef.current.length > 0);
  }, [historyVersion]);

  // Delete selected objects with keyboard
  useEffect(() => {
    if (activeTool !== 'select') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected();
      }
      if (e.key === 'Escape') {
        clearSelection();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTool, deleteSelected, clearSelection]);

  // Edit selected text boxes — switch to text mode and focus the editor
  const handleEditSelection = useCallback(() => {
    // Grab the first selected text box ID before clearing
    const tbId =
      selectedTextBoxIds.size > 0 ? Array.from(selectedTextBoxIds)[0] : null;
    // Camera state is preserved across mode switches — no save/restore needed
    clearSelection();
    setActiveTool('text');
    // After React re-renders in text mode, focus the text box
    if (tbId) {
      requestAnimationFrame(() => {
        const el = globalThis.document.querySelector(
          `[data-textbox-id="${tbId}"] .ProseMirror`,
        ) as HTMLElement | null;
        if (el) {
          el.focus({ preventScroll: true });
          // Place caret at the end of the text content
          const sel = globalThis.document.getSelection();
          if (sel) {
            sel.selectAllChildren(el);
            sel.collapseToEnd();
          }
        }
      });
    }
  }, [clearSelection, setActiveTool, selectedTextBoxIds]);

  // Add a new text box (from Draw mode toolbar)
  const handleAddTextBox = useCallback(() => {
    if (pages.length === 0) return;
    const firstPage = pages[0];
    const newTextBox: TextBox = {
      id: Math.random().toString(36).slice(2) + Date.now().toString(36),
      x: 100,
      y: 200,
      width: 300,
      height: 40,
      content: null,
      isFullPage: false,
      zIndex: 1,
    };

    // Push undo action
    undoStackRef.current.push({
      type: 'textbox-add',
      pageId: firstPage.id,
      textBox: newTextBox,
    });
    redoStackRef.current = [];
    if (undoStackRef.current.length > 100) undoStackRef.current.shift();
    setHistoryVersion((v) => v + 1);

    setPages((prev) =>
      prev.map((p) =>
        p.id === firstPage.id
          ? { ...p, textBoxes: [...p.textBoxes, newTextBox] }
          : p,
      ),
    );
    setActiveTool('text');
    triggerSave();
  }, [pages, setActiveTool, triggerSave]);

  // Page management
  const handleDeletePage = useCallback(
    (pageId: string) => {
      editorsRef.current.delete(pageId);
      setPages((prev) => {
        if (prev.length <= 1) return prev;
        return prev
          .filter((p) => p.id !== pageId)
          .map((p, i) => ({ ...p, order: i }));
      });
      triggerSave();
    },
    [triggerSave],
  );

  const handleAddPage = useCallback(
    (afterIndex: number, pageType: string) => {
      setPages((prev) => {
        const newPage = createEmptyPage(afterIndex + 1, pageType);
        const updated = [
          ...prev.slice(0, afterIndex + 1),
          newPage,
          ...prev.slice(afterIndex + 1),
        ].map((p, i) => ({ ...p, order: i }));
        return updated;
      });
      setAddPagePopoverIndex(null);
      triggerSave();
    },
    [triggerSave],
  );

  // Close add page popover on outside click
  useEffect(() => {
    if (addPagePopoverIndex === null) return;
    const handler = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-add-page-popover]')) {
        setAddPagePopoverIndex(null);
      }
    };
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, [addPagePopoverIndex]);

  const handleTitleBlur = async () => {
    if (title !== document.title) {
      await saveTitle(title);
    }
  };

  const handleTakeOver = () => {
    unlockEditor();
  };

  // Canvas refs for region capture (per page)
  const pageCanvasRefsMap = useRef<
    Map<
      string,
      {
        pdf: HTMLCanvasElement | null;
        strokes: HTMLCanvasElement | null;
        element: HTMLDivElement | null;
      }
    >
  >(new Map());

  const handleCanvasRefsReady = useCallback(
    (
      pageId: string,
      pdfCanvas: HTMLCanvasElement | null,
      strokesCanvas: HTMLCanvasElement | null,
      pageElement: HTMLDivElement | null,
    ) => {
      pageCanvasRefsMap.current.set(pageId, {
        pdf: pdfCanvas,
        strokes: strokesCanvas,
        element: pageElement,
      });
    },
    [],
  );

  // Ask AI callbacks: text selection and region capture
  const handleAskAiWithText = useCallback(
    (text: string) => {
      onAskAiWithContext?.({ type: 'text', content: text });
    },
    [onAskAiWithContext],
  );

  const handleAskAiWithRegion = useCallback(
    (bbox: BBox, pageId: string) => {
      const refs = pageCanvasRefsMap.current.get(pageId);
      if (!refs) return;

      const w = bbox.maxX - bbox.minX;
      const h = bbox.maxY - bbox.minY;
      if (w < 20 || h < 20) return;

      try {
        const dpr = window.devicePixelRatio || 1;
        // Composite PDF + strokes canvases directly (avoids html-to-image DOM cloning issues)
        const offscreen = window.document.createElement('canvas');
        offscreen.width = Math.round(w * dpr);
        offscreen.height = Math.round(h * dpr);
        const ctx = offscreen.getContext('2d');
        if (!ctx) return;

        // White background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, offscreen.width, offscreen.height);

        // Source rect in internal canvas pixels (high-DPI backing buffer)
        const sx = bbox.minX * dpr;
        const sy = bbox.minY * dpr;
        const sw = w * dpr;
        const sh = h * dpr;

        // Draw PDF background layer (if available)
        if (refs.pdf && refs.pdf.width > 0) {
          ctx.drawImage(
            refs.pdf,
            sx,
            sy,
            sw,
            sh,
            0,
            0,
            offscreen.width,
            offscreen.height,
          );
        }

        // Draw committed strokes layer
        if (refs.strokes && refs.strokes.width > 0) {
          ctx.drawImage(
            refs.strokes,
            sx,
            sy,
            sw,
            sh,
            0,
            0,
            offscreen.width,
            offscreen.height,
          );
        }

        const dataUrl = offscreen.toDataURL('image/png');
        onAskAiWithContext?.({ type: 'image', dataUrl });
      } catch (err) {
        console.error('Region capture failed:', err);
      }
    },
    [onAskAiWithContext],
  );

  const isDrawMode =
    activeTool === 'pen' ||
    activeTool === 'highlighter' ||
    activeTool === 'eraser';
  const isReadMode = activeTool === 'read';

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header — hidden on mobile (merged into toolbar) */}
      <div className="hidden xl:flex items-center justify-between border-b px-4 py-2">
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center h-8 w-8 min-h-[44px] min-w-[44px] rounded-lg hover:bg-accent transition-colors text-muted-foreground mr-1 shrink-0"
          title="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <a
          href="/dashboard"
          className="flex items-center justify-center h-8 w-8 min-h-[44px] min-w-[44px] rounded-lg hover:bg-accent transition-colors text-muted-foreground mr-1 shrink-0"
          title="Go to dashboard"
        >
          <Home className="h-4 w-4" />
        </a>
        <button
          onClick={toggleSidebar}
          className="flex items-center justify-center h-8 w-8 min-h-[44px] min-w-[44px] rounded-lg hover:bg-accent transition-colors text-muted-foreground mr-2 shrink-0"
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        >
          {sidebarOpen ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeftOpen className="h-4 w-4" />
          )}
        </button>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          onPointerDown={(e) => {
            if (activeTool !== 'text') {
              e.preventDefault();
            }
          }}
          className="text-xl font-semibold bg-transparent border-none outline-none flex-1"
          placeholder="Untitled"
        />
        <div className="flex items-center gap-3">
          <ConnectionIndicator
            status={connectionStatus}
            isLockedByRemote={isLockedByRemote}
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => manualSave()}
                  disabled={saveStatus === 'saved' || saveStatus === 'saving'}
                  className="p-1 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Save now"
                >
                  <Save className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Save now (Ctrl+S)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <SaveIndicator
            status={saveStatus}
            errorDetails={errorDetails}
            errorType={errorType}
            retryNow={retryNow}
          />
        </div>
      </div>

      {/* Remote editing lock banner */}
      {isLockedByRemote && (
        <div className="flex items-center justify-between bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-sm text-yellow-800">
          <span>This document is being edited on another device.</span>
          <button
            onClick={handleTakeOver}
            className="font-medium underline hover:text-yellow-900"
          >
            Take over editing
          </button>
        </div>
      )}

      {/* Toolbar — sticky so it stays visible when zoomed */}
      <div className="flex items-center border-b px-2 py-1 overflow-x-auto overflow-y-visible bg-background z-20 shrink-0">
        {/* Mobile: back + home + title (hidden on desktop — shown in header) */}
        <div className="flex items-center gap-1 mr-2 xl:hidden shrink-0">
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center h-8 w-8 rounded-lg hover:bg-accent transition-colors text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <a
            href="/dashboard"
            className="flex items-center justify-center h-8 w-8 rounded-lg hover:bg-accent transition-colors text-muted-foreground"
            title="Go to dashboard"
          >
            <Home className="h-4 w-4" />
          </a>
          <span className="text-sm font-medium truncate max-w-[100px]">
            {title || 'Untitled'}
          </span>
        </div>
        {/* Undo / Redo — always visible */}
        <div className="flex items-center gap-0.5 mr-2">
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              handleUndo();
            }}
            disabled={isDrawMode ? !canUndoDraw : false}
            className="flex items-center justify-center h-8 w-8 min-h-[44px] min-w-[44px] rounded-lg transition-colors hover:bg-accent disabled:opacity-30 disabled:pointer-events-none text-muted-foreground"
            title="Undo"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              handleRedo();
            }}
            disabled={isDrawMode ? !canRedoDraw : false}
            className="flex items-center justify-center h-8 w-8 min-h-[44px] min-w-[44px] rounded-lg transition-colors hover:bg-accent disabled:opacity-30 disabled:pointer-events-none text-muted-foreground"
            title="Redo"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>

        <div className="h-6 w-px bg-border mr-2" />

        {/* Mode toggle: Draw / Select / Type */}
        <div className="flex items-center gap-1">
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              if (!isDrawMode) setActiveTool('pen');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] min-w-[44px] rounded-md text-sm font-medium transition-colors ${
              isDrawMode
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent text-muted-foreground'
            }`}
          >
            <Pen className="h-4 w-4" />
            Draw
          </button>
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              setActiveTool('select');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] min-w-[44px] rounded-md text-sm font-medium transition-colors ${
              activeTool === 'select'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent text-muted-foreground'
            }`}
          >
            <MousePointer2 className="h-4 w-4" />
            Select
          </button>
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              setActiveTool('text');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] min-w-[44px] rounded-md text-sm font-medium transition-colors ${
              activeTool === 'text'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent text-muted-foreground'
            }`}
          >
            <Type className="h-4 w-4" />
            Type
          </button>
          <div className="relative" ref={askAiDropdownRef}>
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                if (!askAiDropdownOpen && askAiDropdownRef.current) {
                  const rect = askAiDropdownRef.current.getBoundingClientRect();
                  setAskAiDropdownPos({
                    top: rect.bottom + 4,
                    left: rect.left,
                  });
                }
                setAskAiDropdownOpen((prev) => !prev);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isReadMode || activeTool === 'crop'
                  ? 'bg-purple-600 text-white'
                  : 'hover:bg-purple-50 text-purple-600'
              }`}
            >
              <Sparkles className="h-4 w-4" />
              Ask AI
            </button>
            {askAiDropdownOpen && askAiDropdownPos && (
              <div
                className="fixed mt-1 w-44 rounded-lg border bg-popover p-1 shadow-lg z-[100]"
                style={{
                  top: askAiDropdownPos.top,
                  left: askAiDropdownPos.left,
                }}
              >
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setAskAiDropdownOpen(false);
                    setActiveTool('read');
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                    isReadMode ? 'bg-accent' : 'hover:bg-accent'
                  }`}
                >
                  <BookOpen className="h-4 w-4 text-purple-500" />
                  Select Text
                </button>
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setAskAiDropdownOpen(false);
                    setActiveTool('crop');
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                    activeTool === 'crop' ? 'bg-accent' : 'hover:bg-accent'
                  }`}
                >
                  <Camera className="h-4 w-4 text-purple-500" />
                  Screenshot
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Draw mode: sub-tool icons */}
        {isDrawMode && (
          <>
            <div className="h-6 w-px bg-border mx-2" />
            <div className="flex items-center gap-1">
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setActiveTool('pen');
                }}
                className={`flex items-center justify-center h-8 w-8 min-h-[44px] min-w-[44px] rounded-lg transition-colors ${
                  activeTool === 'pen'
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50 text-muted-foreground'
                }`}
                title="Pen"
              >
                <Pen className="h-4 w-4" />
              </button>
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setActiveTool('highlighter');
                }}
                className={`flex items-center justify-center h-8 w-8 min-h-[44px] min-w-[44px] rounded-lg transition-colors ${
                  activeTool === 'highlighter'
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50 text-muted-foreground'
                }`}
                title="Highlighter"
              >
                <Highlighter className="h-4 w-4" />
              </button>
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setActiveTool('eraser');
                }}
                className={`flex items-center justify-center h-8 w-8 min-h-[44px] min-w-[44px] rounded-lg transition-colors ${
                  activeTool === 'eraser'
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50 text-muted-foreground'
                }`}
                title="Eraser"
              >
                <Eraser className="h-4 w-4" />
              </button>
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  handleAddTextBox();
                }}
                className="flex items-center justify-center h-8 w-8 min-h-[44px] min-w-[44px] rounded-lg transition-colors hover:bg-accent/50 text-muted-foreground"
                title="Add text box"
              >
                <Type className="h-4 w-4" />
              </button>
            </div>
          </>
        )}

        {/* Type mode: text formatting toolbar */}
        {activeTool === 'text' && activeEditor && (
          <>
            <div className="h-6 w-px bg-border mx-2" />
            <div className="flex-1">
              <EditorToolbar
                editor={activeEditor}
                hideUndoRedo
                document={{ ...document, pages: { pages } }}
              />
            </div>
          </>
        )}

        {/* Export PDF — always visible */}
        {activeTool !== 'text' && (
          <>
            <div className="flex-1" />
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
                exportPdf({ ...document, pages: { pages } });
              }}
              disabled={isExporting}
              className="flex items-center justify-center h-8 w-8 min-h-[44px] min-w-[44px] rounded-lg transition-colors hover:bg-accent/50 text-muted-foreground"
              title="Export as PDF"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </button>
          </>
        )}
      </div>

      {/* PDF loading/error banner for material-backed documents */}
      {pdfLoading && materialId && (
        <div className="bg-muted px-4 py-2 text-center text-sm text-muted-foreground">
          Loading PDF background…
        </div>
      )}
      {pdfError && (
        <div className="bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
          PDF background failed to load: {pdfError}
        </div>
      )}

      {/* Main content: canvas + optional right sidebar */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Canvas scroll area */}
        <div
          ref={scrollContainerRef}
          className="flex-1 bg-white xl:bg-gray-100"
          data-scroll-container
          style={{
            overflow: 'hidden',
            touchAction: 'none',
            overscrollBehavior: 'none',
            userSelect: isReadMode
              ? 'text'
              : activeTool === 'text' || activeTool === 'select'
                ? 'auto'
                : 'none',
            WebkitUserSelect:
              activeTool === 'text' || activeTool === 'select'
                ? 'auto'
                : 'none',
          }}
        >
          <div
            className="py-8 max-xl:py-0"
            style={{
              transform: `translate(${camera.x}px, ${camera.y}px) scale(${scale})`,
              transformOrigin: 'top left',
              willChange: 'transform',
              width: PAGE_WIDTH,
              minHeight: `${pages.length * PAGE_HEIGHT}px`,
            }}
          >
            {pages.map((page, index) => {
              const effectiveType = page.pageType || document.canvas_type;
              return (
                <div key={page.id} data-page-id={page.id}>
                  <CanvasPage
                    page={page}
                    activeTool={activeTool}
                    canvasType={effectiveType}
                    onStrokeAdd={handleStrokeAdd}
                    onStrokeRemove={handleStrokeRemove}
                    onPointerDown={(e) => handlePointerDown(e, page.id)}
                    onPointerMove={(e) => handlePointerMove(e, page.id)}
                    onPointerUp={(e) => handlePointerUp(e, page.id)}
                    onFlowContentUpdate={handleFlowContentUpdate}
                    onEditorReady={handleEditorReady}
                    onTextOverflow={handleTextOverflow}
                    canvasClass={CANVAS_CLASSES[effectiveType] ?? ''}
                    eraserPosition={
                      activeTool === 'eraser' ? eraserPosition : null
                    }
                    eraserRadius={eraserSize}
                    remoteUpdateCounter={remoteUpdateCounter}
                    selectionPath={selectionPath}
                    isRectMode={isRectMode}
                    selectionBBox={selectionBBox}
                    tightSelectionBBox={tightSelectionBBox}
                    isSelectionDragging={isSelectionDragging}
                    selectionDragOffset={selectionDragOffset}
                    isSelectionResizing={isSelectionResizing}
                    selectionResizeBBox={selectionResizeBBox}
                    selectedStrokeIds={selectedStrokeIds}
                    selectedTextBoxIds={selectedTextBoxIds}
                    onTextBoxContentUpdate={handleTextBoxContentUpdate}
                    onTextBoxHeightMeasured={handleTextBoxHeightMeasured}
                    onTextBoxContentBoundsMeasured={
                      handleTextBoxContentBoundsMeasured
                    }
                    onDeleteSelection={deleteSelected}
                    onEditSelection={handleEditSelection}
                    hasSelectedTextBoxes={selectedTextBoxIds.size > 0}
                    renderPdfPage={renderPdfPage}
                    materialId={materialId}
                    onAskAiWithText={handleAskAiWithText}
                    onAskAiWithRegion={handleAskAiWithRegion}
                    onCanvasRefsReady={handleCanvasRefsReady}
                  />
                  {/* Page break divider */}
                  <div
                    className="group flex items-center justify-center mx-auto py-1.5"
                    style={{ width: PAGE_WIDTH }}
                  >
                    <div className="h-px flex-1 bg-border" />
                    <span className="px-3 text-xs text-muted-foreground select-none">
                      {index + 1} / {pages.length}
                    </span>
                    {/* Add page button */}
                    <div className="relative" data-add-page-popover>
                      <button
                        onClick={() =>
                          setAddPagePopoverIndex(
                            addPagePopoverIndex === index ? null : index,
                          )
                        }
                        className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-accent transition-colors text-muted-foreground"
                        title="Add page"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      {addPagePopoverIndex === index && (
                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-popover border rounded-lg shadow-lg z-50 p-2">
                          <div className="flex gap-2">
                            {CANVAS_TYPES.map((t) => (
                              <button
                                key={t.value}
                                onClick={() => handleAddPage(index, t.value)}
                                className="flex flex-col items-center gap-1 p-1.5 rounded-lg hover:bg-accent transition-colors"
                              >
                                <PageTypeThumb type={t.value} size={36} />
                                <span className="text-[10px] text-muted-foreground">
                                  {t.label}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {pages.length > 1 && (
                      <button
                        onClick={() => handleDeletePage(page.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive transition-all"
                        title="Delete page"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                    <div className="h-px flex-1 bg-border" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <ZoomIndicator percent={displayPercent} visible={isZooming} />

        {/* Math input box ($ key → LaTeX) */}
        {mathInputPosition && (
          <MathInputBox
            position={mathInputPosition}
            onSubmit={handleMathSubmit}
            onCancel={handleMathCancel}
          />
        )}

        {/* Right sidebar — draw mode settings */}
        {isDrawMode && (
          <div
            className="flex flex-col items-center gap-1 border-l bg-background py-3 overflow-y-auto"
            style={{ width: 48 }}
          >
            {/* Pen: thickness + colors */}
            {activeTool === 'pen' && (
              <>
                {/* Thickness dots */}
                {PEN_SIZES.map((s) => (
                  <button
                    key={s.label}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setPenSize(s.value);
                    }}
                    className={`flex items-center justify-center h-8 w-8 min-h-[44px] min-w-[44px] rounded-lg transition-colors ${
                      penSize === s.value
                        ? 'bg-accent ring-1 ring-primary/50'
                        : 'hover:bg-accent/50'
                    }`}
                    title={`${s.label} (${s.value}px)`}
                  >
                    <span
                      className="rounded-full"
                      style={{
                        width: Math.max(Math.min(s.value * 2, 18), 4),
                        height: Math.max(Math.min(s.value * 2, 18), 4),
                        backgroundColor: penColor,
                      }}
                    />
                  </button>
                ))}

                <div className="w-6 h-px bg-border my-1" />

                {/* Color swatches */}
                {PEN_COLORS.map((c) => (
                  <button
                    key={c}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setPenColor(c);
                    }}
                    className={`flex items-center justify-center rounded-full transition-transform hover:scale-110 min-h-[44px] min-w-[44px] ${
                      penColor === c
                        ? 'ring-2 ring-primary ring-offset-1 scale-110'
                        : ''
                    }`}
                    style={{ width: 28, height: 28 }}
                    title={c}
                  >
                    <span
                      className="rounded-full"
                      style={{
                        width: 22,
                        height: 22,
                        backgroundColor: c,
                        border:
                          c === '#FFFFFF' ? '1px solid #d1d5db' : undefined,
                      }}
                    />
                  </button>
                ))}
              </>
            )}

            {/* Highlighter: thickness + colors */}
            {activeTool === 'highlighter' && (
              <>
                {/* Thickness dots */}
                {HIGHLIGHTER_SIZES.map((s) => (
                  <button
                    key={s.label}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setHighlighterSize(s.value);
                    }}
                    className={`flex items-center justify-center h-8 w-8 min-h-[44px] min-w-[44px] rounded-lg transition-colors ${
                      highlighterSize === s.value
                        ? 'bg-accent ring-1 ring-primary/50'
                        : 'hover:bg-accent/50'
                    }`}
                    title={`${s.label} (${s.value}px)`}
                  >
                    <span
                      className="rounded-full"
                      style={{
                        width: s.value,
                        height: s.value,
                        backgroundColor: highlighterColor,
                        opacity: 0.5,
                      }}
                    />
                  </button>
                ))}

                <div className="w-6 h-px bg-border my-1" />

                {/* Color swatches */}
                {HIGHLIGHTER_COLORS.map((c) => (
                  <button
                    key={c}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setHighlighterColor(c);
                    }}
                    className={`flex items-center justify-center rounded-full transition-transform hover:scale-110 min-h-[44px] min-w-[44px] ${
                      highlighterColor === c
                        ? 'ring-2 ring-primary ring-offset-0'
                        : ''
                    }`}
                    style={{ width: 24, height: 24 }}
                    title={c}
                  >
                    <span
                      className="rounded-full"
                      style={{ width: 18, height: 18, backgroundColor: c }}
                    />
                  </button>
                ))}
              </>
            )}

            {/* Eraser: 3 sizes */}
            {activeTool === 'eraser' && (
              <>
                {ERASER_SIZES.map((s) => (
                  <button
                    key={s.label}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setEraserSize(s.value);
                    }}
                    className={`flex items-center justify-center h-8 w-8 min-h-[44px] min-w-[44px] rounded-lg transition-colors ${
                      eraserSize === s.value
                        ? 'bg-accent ring-1 ring-primary/50'
                        : 'hover:bg-accent/50'
                    }`}
                    title={`${s.label} eraser`}
                  >
                    <span
                      className="rounded-full border border-gray-300"
                      style={{
                        width: Math.max(s.value * 1.2, 8),
                        height: Math.max(s.value * 1.2, 8),
                        backgroundColor: '#ffffff',
                      }}
                    />
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Canvas background styles */}
      <style jsx global>{`
        .canvas-lined {
          background-image: repeating-linear-gradient(
            transparent,
            transparent 31px,
            #e5e7eb 31px,
            #e5e7eb 32px
          );
          background-size: 100% 32px;
        }
        .canvas-grid {
          background-image:
            linear-gradient(#e5e7eb 1px, transparent 1px),
            linear-gradient(90deg, #e5e7eb 1px, transparent 1px);
          background-size: 32px 32px;
        }
        .canvas-dotted {
          background-image: radial-gradient(
            circle,
            #d1d5db 1px,
            transparent 1px
          );
          background-size: 32px 32px;
        }
      `}</style>
    </div>
  );
}
