'use client';

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TextTooltipProps {
  as?: 'span' | 'div' | 'p' | 'h3';
  content: string;
  children: React.ReactNode;
  className?: string;
}

/** Reveals clipped text without changing the trigger's layout or click behavior. */
export const TextTooltip: React.FC<TextTooltipProps> = ({ as = 'span', content, children, className }) => {
  const id = useId();
  const triggerRef = useRef<HTMLElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const cancelClose = () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
  };
  const closeSoon = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    let active = true;
    const measure = () => {
      if (!active) return;
      const clipped = trigger.scrollWidth > trigger.clientWidth + 1 || trigger.scrollHeight > trigger.clientHeight + 1;
      setTruncated(clipped);
      if (!clipped) setOpen(false);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(trigger);
    // Local fonts can finish loading without changing the element's outer size.
    void document.fonts.ready.then(measure);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [content, children]);

  useEffect(() => () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;
    const bounds = trigger.getBoundingClientRect();
    const popup = tooltip.getBoundingClientRect();
    const margin = 8;
    const above = bounds.top - popup.height - margin;
    setPosition({
      top: Math.max(margin, Math.min(above >= margin ? above : bounds.bottom + margin, window.innerHeight - popup.height - margin)),
      left: Math.max(margin, Math.min(bounds.left + (bounds.width - popup.width) / 2, window.innerWidth - popup.width - margin)),
    });

    const dismiss = () => setOpen(false);
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && tooltip.contains(event.target)) return;
      dismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, content]);

  return (
    <>
      {React.createElement(as, {
        ref: triggerRef,
        className,
        tabIndex: truncated ? 0 : undefined,
        'aria-describedby': open ? id : undefined,
        onPointerEnter: (event: React.PointerEvent) => {
          cancelClose();
          if (event.pointerType !== 'touch' && truncated) setOpen(true);
        },
        onPointerLeave: closeSoon,
        onFocus: () => {
          cancelClose();
          if (truncated) setOpen(true);
        },
        onBlur: () => setOpen(false),
      }, children)}
      {open && createPortal(
        <div
          ref={tooltipRef}
          id={id}
          role="tooltip"
          dir="auto"
          className="fixed z-[10000] w-max max-w-[min(22rem,calc(100vw-1rem))] max-h-[calc(100vh-1rem)] overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-[#0c3e35] px-3 py-2 text-start text-xs font-medium leading-relaxed text-white shadow-lg"
          style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? 'visible' : 'hidden' }}
          onPointerEnter={cancelClose}
          onPointerLeave={closeSoon}
          onClick={(event) => event.stopPropagation()}
        >
          {content}
        </div>,
        document.body,
      )}
    </>
  );
};
