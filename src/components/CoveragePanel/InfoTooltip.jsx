import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

const TOOLTIP_WIDTH = 272;

/**
 * Portal-based tooltip — renders into document.body so it is never clipped
 * by ancestor overflow:hidden or z-index stacking contexts.
 *
 * Position is recalculated on scroll/resize while visible so the bubble stays
 * attached to its trigger even if the page scrolls underneath it.
 */
export function InfoTooltip({ label, children }) {
  const [visible, setVisible] = useState(false);
  const [pos,     setPos]     = useState({ top: 0, left: 0 });
  const triggerRef            = useRef(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const left = Math.min(r.left, window.innerWidth - TOOLTIP_WIDTH - 8);
    setPos({ top: r.bottom + 6, left });
  }, []);

  const show = useCallback(() => {
    updatePosition();
    setVisible(true);
  }, [updatePosition]);

  const hide = useCallback(() => setVisible(false), []);

  // Keep the tooltip glued to its trigger while visible. Using capture phase
  // so we still see scroll events from ancestors, not just the window.
  useEffect(() => {
    if (!visible) return;
    const onChange = () => updatePosition();
    window.addEventListener('scroll', onChange, true);
    window.addEventListener('resize', onChange);
    return () => {
      window.removeEventListener('scroll', onChange, true);
      window.removeEventListener('resize', onChange);
    };
  }, [visible, updatePosition]);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        tabIndex={0}
        className="underline decoration-dotted cursor-help focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded"
      >
        {label}
      </span>
      {visible && createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, width: TOOLTIP_WIDTH }}
          className="rounded bg-gray-900 border border-gray-600 p-3 text-xs text-gray-200 shadow-2xl leading-snug pointer-events-none"
          role="tooltip"
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
