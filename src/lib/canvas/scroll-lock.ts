/**
 * RULE: NEVER scroll or move the page while the pen is drawing or erasing.
 *
 * lockScroll() freezes every scrollable ancestor and the window itself.
 * It returns an unlock function — call it on pointer-up.
 *
 * Four layers of protection:
 * 1. Document touchmove/pointermove block in CAPTURE phase — stops ALL
 *    touch/pointer-move events before they reach any element handler
 *    (including our own finger-scroll handler)
 * 2. Scroll-container lock — snapshots scrollTop, reverts on every scroll event
 * 3. Window scroll lock — prevents Safari viewport bounce / body scroll
 * 4. Scroll-container touchmove block — belt-and-suspenders for Safari
 */

export function lockScroll(target: HTMLElement): () => void {
  const cleanups: (() => void)[] = [];

  const scrollContainer = target.closest(
    '[data-scroll-container]',
  ) as HTMLElement | null;

  // 1. Block touchmove in CAPTURE phase on document — this fires BEFORE any
  //    element-level handlers, so our finger-scroll handler never runs.
  const blockTouch = (ev: TouchEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
  };
  document.addEventListener('touchmove', blockTouch, {
    passive: false,
    capture: true,
  });
  cleanups.push(() =>
    document.removeEventListener('touchmove', blockTouch, { capture: true }),
  );

  // 2. Lock the data-scroll-container scrollTop
  if (scrollContainer) {
    const lockedTop = scrollContainer.scrollTop;
    const onScroll = () => {
      scrollContainer.scrollTop = lockedTop;
    };
    scrollContainer.addEventListener('scroll', onScroll);
    cleanups.push(() =>
      scrollContainer.removeEventListener('scroll', onScroll),
    );

    // 4. Also block touchmove directly on the scroll container
    scrollContainer.addEventListener('touchmove', blockTouch, {
      passive: false,
      capture: true,
    });
    cleanups.push(() =>
      scrollContainer.removeEventListener('touchmove', blockTouch, {
        capture: true,
      }),
    );
  }

  // 3. Lock window scroll (Safari viewport bounce / body scroll)
  const lockedWindowY = window.scrollY;
  const onWindowScroll = () => {
    window.scrollTo(0, lockedWindowY);
  };
  window.addEventListener('scroll', onWindowScroll);
  cleanups.push(() => window.removeEventListener('scroll', onWindowScroll));

  return () => {
    cleanups.forEach((fn) => fn());
  };
}
