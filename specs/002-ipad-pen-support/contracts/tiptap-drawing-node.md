# Contract: Tiptap Drawing Block Node Extension

## Node Specification

**Name**: `drawingBlock`
**Group**: `block`
**Content**: none (leaf node — no child nodes)
**Atom**: true (treated as a single unit for selection/deletion)
**Draggable**: false
**Selectable**: true

## Node Attributes

| Attribute    | Type     | Default             | Description                                         |
| ------------ | -------- | ------------------- | --------------------------------------------------- |
| `id`         | string   | auto-generated UUID | Unique identifier for the drawing block             |
| `width`      | number   | 800                 | Canvas width in pixels                              |
| `height`     | number   | 400                 | Canvas height in pixels                             |
| `background` | string   | "transparent"       | Background style: "transparent", "lined", or "grid" |
| `strokes`    | Stroke[] | []                  | Array of stroke objects                             |

## Commands

| Command                | Arguments                          | Description                                                |
| ---------------------- | ---------------------------------- | ---------------------------------------------------------- |
| `insertDrawingBlock`   | `{ width?, height?, background? }` | Inserts a new drawing block at the current cursor position |
| `updateDrawingStrokes` | `{ id, strokes }`                  | Updates the strokes array for a specific drawing block     |
| `deleteDrawingBlock`   | `{ id }`                           | Removes a drawing block from the document                  |

## Keyboard Shortcuts

None — drawing blocks are inserted via the toolbar or a command menu.

## Serialization (JSON)

Input and output format for `editor.getJSON()` / `editor.commands.setContent()`:

```json
{
  "type": "drawingBlock",
  "attrs": {
    "id": "uuid-string",
    "width": 800,
    "height": 400,
    "background": "transparent",
    "strokes": []
  }
}
```

## NodeView React Component Props

The React component rendered for this node receives:

| Prop               | Type             | Description                                           |
| ------------------ | ---------------- | ----------------------------------------------------- |
| `node`             | ProseMirror Node | The drawing block node with attrs                     |
| `updateAttributes` | (attrs) => void  | Updates node attributes (triggers Tiptap transaction) |
| `selected`         | boolean          | Whether the node is currently selected                |
| `editor`           | Editor           | The Tiptap editor instance                            |
| `deleteNode`       | () => void       | Removes this node from the document                   |

## Integration Points

- **Auto-save**: Stroke updates flow through `updateAttributes` → Tiptap transaction → `onUpdate` callback → auto-save debounce → `updateDocumentContent` server action
- **Real-time sync**: Drawing data included in `editor.getJSON()` payload, synced via existing Supabase Realtime channel
- **Undo/redo**: Each `updateAttributes` call creates a ProseMirror transaction, integrated with editor history
