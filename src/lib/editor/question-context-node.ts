import { Node, mergeAttributes } from '@tiptap/core';

export const QuestionContextNode = Node.create({
  name: 'questionContext',
  group: 'block',
  atom: true,
  draggable: false,

  addAttributes() {
    return {
      label: { default: '' },
      html: { default: '' },
      preambleHtml: { default: null },
      assignmentId: { default: null },
      splitId: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-question-context]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-question-context': '' }), 0];
  },
});
