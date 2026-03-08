/**
 * Global undo/redo history manager for the infinite canvas.
 *
 * All canvas actions (text edits, strokes, moves, creates, deletes) are wrapped
 * as Command objects and pushed to a single global stack. This ensures Ctrl+Z
 * always undoes the last action regardless of which element it was on.
 *
 * Implements time-based grouping (500ms) to batch rapid sequential actions
 * (e.g., typing multiple characters) into a single undo step.
 */

/** A reversible action that can be undone and redone */
export interface Command {
  /** Descriptive type for debugging (e.g., 'text-edit', 'move', 'stroke') */
  type: string;
  /** Element ID this command affects (for grouping) */
  elementId?: string;
  /** Timestamp when the command was created */
  timestamp: number;
  /** Apply the action */
  execute: () => void;
  /** Reverse the action */
  undo: () => void;
}

/** Grouping delay in milliseconds — rapid actions within this window are grouped */
const GROUP_DELAY_MS = 500;

/** Maximum history size to prevent unbounded memory growth */
const MAX_HISTORY_SIZE = 200;

export type HistoryChangeListener = () => void;

export class HistoryManager {
  private undoStack: Command[][] = [];
  private redoStack: Command[][] = [];
  private listeners: Set<HistoryChangeListener> = new Set();

  /** Push a new command onto the history stack */
  push(command: Command): void {
    // Check if this command should be grouped with the previous one
    const lastGroup = this.undoStack[this.undoStack.length - 1];
    if (lastGroup && this.shouldGroup(lastGroup, command)) {
      lastGroup.push(command);
    } else {
      this.undoStack.push([command]);
    }

    // Trim history if too long
    if (this.undoStack.length > MAX_HISTORY_SIZE) {
      this.undoStack.shift();
    }

    // Any new action clears the redo stack
    this.redoStack = [];

    // Execute the command
    command.execute();

    this.notifyListeners();
  }

  /**
   * Push a command without executing it.
   * Use when the action has already been applied (e.g., ProseMirror transactions
   * that are applied before we intercept them).
   */
  pushWithoutExecute(command: Command): void {
    const lastGroup = this.undoStack[this.undoStack.length - 1];
    if (lastGroup && this.shouldGroup(lastGroup, command)) {
      lastGroup.push(command);
    } else {
      this.undoStack.push([command]);
    }

    if (this.undoStack.length > MAX_HISTORY_SIZE) {
      this.undoStack.shift();
    }

    this.redoStack = [];
    this.notifyListeners();
  }

  /** Undo the last action group */
  undo(): boolean {
    const group = this.undoStack.pop();
    if (!group) return false;

    // Undo in reverse order within the group
    for (let i = group.length - 1; i >= 0; i--) {
      group[i].undo();
    }

    this.redoStack.push(group);
    this.notifyListeners();
    return true;
  }

  /** Redo the last undone action group */
  redo(): boolean {
    const group = this.redoStack.pop();
    if (!group) return false;

    // Re-execute in forward order
    for (const command of group) {
      command.execute();
    }

    this.undoStack.push(group);
    this.notifyListeners();
    return true;
  }

  /** Whether undo is available */
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Whether redo is available */
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Number of undo steps available */
  get undoSize(): number {
    return this.undoStack.length;
  }

  /** Clear all history */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notifyListeners();
  }

  /** Subscribe to history changes (for UI updates) */
  subscribe(listener: HistoryChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Determine if a new command should be grouped with the previous group.
   * Groups rapid sequential actions on the same element of the same type.
   */
  private shouldGroup(lastGroup: Command[], newCommand: Command): boolean {
    const lastCommand = lastGroup[lastGroup.length - 1];

    // Must be the same action type
    if (lastCommand.type !== newCommand.type) return false;

    // Must be on the same element
    if (lastCommand.elementId !== newCommand.elementId) return false;

    // Must be within the grouping delay
    if (newCommand.timestamp - lastCommand.timestamp > GROUP_DELAY_MS) return false;

    return true;
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

// ─── Command Factories ───────────────────────────────────────────────────────

export interface MoveCommandArgs {
  elementId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  applyMove: (id: string, x: number, y: number) => void;
}

export function createMoveCommand(args: MoveCommandArgs): Command {
  return {
    type: 'move',
    elementId: args.elementId,
    timestamp: Date.now(),
    execute: () => args.applyMove(args.elementId, args.toX, args.toY),
    undo: () => args.applyMove(args.elementId, args.fromX, args.fromY),
  };
}

export interface ResizeCommandArgs {
  elementId: string;
  fromWidth: number;
  fromHeight: number;
  toWidth: number;
  toHeight: number;
  applyResize: (id: string, width: number, height: number) => void;
}

export function createResizeCommand(args: ResizeCommandArgs): Command {
  return {
    type: 'resize',
    elementId: args.elementId,
    timestamp: Date.now(),
    execute: () => args.applyResize(args.elementId, args.toWidth, args.toHeight),
    undo: () => args.applyResize(args.elementId, args.fromWidth, args.fromHeight),
  };
}

export interface CreateElementCommandArgs {
  elementId: string;
  addElement: (id: string) => void;
  removeElement: (id: string) => void;
}

export function createAddElementCommand(args: CreateElementCommandArgs): Command {
  return {
    type: 'create-element',
    elementId: args.elementId,
    timestamp: Date.now(),
    execute: () => args.addElement(args.elementId),
    undo: () => args.removeElement(args.elementId),
  };
}

export interface DeleteElementCommandArgs {
  elementId: string;
  addElement: (id: string) => void;
  removeElement: (id: string) => void;
}

export function createDeleteElementCommand(args: DeleteElementCommandArgs): Command {
  return {
    type: 'delete-element',
    elementId: args.elementId,
    timestamp: Date.now(),
    execute: () => args.removeElement(args.elementId),
    undo: () => args.addElement(args.elementId),
  };
}

export interface StrokeCommandArgs {
  elementId: string;
  strokeId: string;
  addStroke: () => void;
  removeStroke: () => void;
}

export function createStrokeCommand(args: StrokeCommandArgs): Command {
  return {
    type: 'stroke',
    elementId: args.elementId,
    timestamp: Date.now(),
    execute: () => args.addStroke(),
    undo: () => args.removeStroke(),
  };
}
