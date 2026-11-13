'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './NativeModal.module.css';

interface NativeModalProps {
  isOpen: boolean;
  onClose: () => void;
  titleId: string;
  descriptionId?: string;
  dismissible?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Native modality supplies the focus containment, inert background and focus return. */
export const NativeModal: React.FC<NativeModalProps> = ({
  isOpen,
  onClose,
  titleId,
  descriptionId,
  dismissible = true,
  className = '',
  children,
}) => {
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedOutside = useRef<number | null>(null);
  const stateRef = useRef({ isOpen, dismissible, onClose });
  stateRef.current = { isOpen, dismissible, onClose };

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !isOpen) return;

    // React 18's autoFocus runs before a closed dialog is visible. Let showModal
    // choose the explicitly marked safe action using the native autofocus attribute.
    dialog.querySelector('[data-modal-autofocus]')?.setAttribute('autofocus', '');
    dialog.showModal();

    const shieldLegacyEscape = (event: KeyboardEvent) => {
      // Disabling the focused action can send focus to body. Protect the native
      // modal from legacy parent window listeners even in that transient state.
      // Do not prevent the default: native cancel still owns the close request.
      if (event.key === 'Escape' && dialog.open &&
        event.target instanceof Node && !dialog.contains(event.target)) {
        event.stopPropagation();
      }
    };
    document.addEventListener('keydown', shieldLegacyEscape, true);

    // No root overflow mutation: a legacy parent retains ownership of its lock.
    return () => {
      document.removeEventListener('keydown', shieldLegacyEscape, true);
      if (dialog.open) dialog.close();
    };
  }, [mounted, isOpen]);

  const outside = (event: React.PointerEvent<HTMLDialogElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom;
  };

  if (!mounted || !isOpen) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      dir="rtl"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={!dismissible || undefined}
      {...({ closedby: dismissible ? 'any' : 'none' } as Record<string, string>)}
      className={`${styles.modal} font-sans animate-fadeIn ${className}`}
      onCancel={(event) => {
        event.stopPropagation();
        if (!stateRef.current.dismissible) event.preventDefault();
      }}
      onClose={(event) => {
        event.stopPropagation();
        event.currentTarget.returnValue = '';
        // Ignore cleanup close events, including a queued event after reopening.
        if (stateRef.current.isOpen && !event.currentTarget.open) {
          stateRef.current.onClose();
        }
      }}
      onKeyDown={(event) => {
        // Keep legacy parent overlays' window listeners from consuming this Esc.
        // The browser still performs the native close request and cancel event.
        if (event.key === 'Escape') event.stopPropagation();
      }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        if (!('closedBy' in HTMLDialogElement.prototype)) {
          pressedOutside.current = event.button === 0 && outside(event) ? event.pointerId : null;
        }
      }}
      onPointerUp={(event) => {
        if ('closedBy' in HTMLDialogElement.prototype) return;
        const shouldClose = pressedOutside.current === event.pointerId && outside(event);
        pressedOutside.current = null;
        if (shouldClose && stateRef.current.dismissible) event.currentTarget.close();
      }}
      onPointerCancel={() => { pressedOutside.current = null; }}
    >
      {children}
    </dialog>,
    document.body,
  );
};
