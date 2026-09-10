'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { User, UserTodo, Priority, TodoCategory, Directorate } from '../types';
import { api } from '../services/api';
import { CustomDatePicker } from './CustomDatePicker';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar,
  Sparkles,
  Plus,
  Search,
  Trash2,
  Edit3,
  Layers,
  Send,
  Check,
  X,
  ArrowRight,
  Tag,
  Phone,
  Briefcase,
  Users,
  Building2,
  FileText,
  Loader2,
  RefreshCw,
  ListTodo,
  CheckCheck,
  Flame,
  Filter,
  GripVertical,
  ArrowUpDown,
  MoveDown,
  ChevronDown,
  ChevronUp,
  ChevronsUp,
  ChevronsDown,
} from 'lucide-react';

interface TodosViewProps {
  currentUser: User;
  onBackToDashboard?: () => void;
}

const CATEGORY_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  GENERAL: { label: 'عام', icon: <Tag className="w-3.5 h-3.5" />, color: 'bg-slate-100 text-slate-700 border-slate-200' },
  MEETING: { label: 'اجتماع', icon: <Users className="w-3.5 h-3.5" />, color: 'bg-blue-50 text-blue-700 border-blue-200' },
  FOLLOWUP: { label: 'متابعة عاجلة', icon: <Clock className="w-3.5 h-3.5" />, color: 'bg-amber-50 text-amber-700 border-amber-200' },
  OFFICIAL: { label: 'بريد ومعاملات', icon: <FileText className="w-3.5 h-3.5" />, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  CALL: { label: 'اتصال هاتفي', icon: <Phone className="w-3.5 h-3.5" />, color: 'bg-purple-50 text-purple-700 border-purple-200' },
};

const PRIORITY_BADGES: Record<Priority, { label: string; color: string }> = {
  URGENT: { label: 'طارئ جداً', color: 'bg-red-50 text-red-700 border-red-200' },
  HIGH: { label: 'هام', color: 'bg-amber-50 text-amber-800 border-amber-200' },
  NORMAL: { label: 'عادي', color: 'bg-[#0c3e35]/10 text-[#0c3e35] border-[#0c3e35]/20' },
  LOW: { label: 'منخفض', color: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export const getCleanTodoDescription = (desc?: string | null): string => {
  if (!desc) return '';
  return desc
    .replace(/\[تم تحويلها إلى الخطة اليومية الصباحية\]/g, '')
    .replace(/\[تم إدراجها في الخطة اليومية\]/g, '')
    .replace(/\[تم تحويلها إلى تكليف تنفيذي رسمي\]/g, '')
    .replace(/\[تم إسنادها كتكليف تنفيذي\]/g, '')
    .trim();
};

export const TodosView: React.FC<TodosViewProps> = ({ currentUser, onBackToDashboard }) => {
  const [todos, setTodos] = useState<UserTodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [directorates, setDirectorates] = useState<Directorate[]>([]);
  
  // Quick Add Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('NORMAL');
  const [newCategory, setNewCategory] = useState<string>('GENERAL');
  const [newDueDate, setNewDueDate] = useState<string>('');
  const [showAdvancedAdd, setShowAdvancedAdd] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusTab, setStatusTab] = useState<'ALL' | 'PENDING' | 'TODAY' | 'COMPLETED'>('ALL');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');

  // Drag and Drop State
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'top' | 'bottom'>('bottom');

  const todosRef = useRef(todos);
  useEffect(() => {
    todosRef.current = todos;
  }, [todos]);

  const draggedIdRef = useRef<string | null>(null);
  const dragOverIdRef = useRef<string | null>(null);
  const dropPositionRef = useRef<'top' | 'bottom'>('bottom');
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isTouchDraggingRef = useRef<boolean>(false);

  // Mobile Touch Drag State for Floating Clone
  const [touchCurrentPos, setTouchCurrentPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [touchGhostTodo, setTouchGhostTodo] = useState<UserTodo | null>(null);
  const [isTouchDragging, setIsTouchDragging] = useState<boolean>(false);

  // Quick reorder menu popover state
  const [activeReorderMenuId, setActiveReorderMenuId] = useState<string | null>(null);

  // Inline Title Editing (Microsoft To Do style)
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineTitleValue, setInlineTitleValue] = useState('');
  const inlineInputRef = useRef<HTMLInputElement | null>(null);

  // Quick inline popover states for changing priority / category on the fly
  const [activePriorityDropdownId, setActivePriorityDropdownId] = useState<string | null>(null);
  const [activeCategoryDropdownId, setActiveCategoryDropdownId] = useState<string | null>(null);
  const [dropdownPlacement, setDropdownPlacement] = useState<'down' | 'up'>('down');
  const [dropdownAlign, setDropdownAlign] = useState<'right' | 'left'>('right');

  // Close popovers on click outside or escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        !target.closest('.priority-popover') &&
        !target.closest('.category-popover') &&
        !target.closest('.reorder-menu-popover')
      ) {
        setActivePriorityDropdownId(null);
        setActiveCategoryDropdownId(null);
        setActiveReorderMenuId(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActivePriorityDropdownId(null);
        setActiveCategoryDropdownId(null);
        setActiveReorderMenuId(null);
        setInlineEditingId(null);
        setPlanConversionTodo(null);
        setDeleteConfirmTodo(null);
      }
    };
    window.addEventListener('click', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Enforce cursor-move on document body while actively dragging
  useEffect(() => {
    if (draggedId) {
      document.body.style.cursor = 'move';
      const handleGlobalDragEnd = () => {
        document.body.style.cursor = '';
        setDraggedId(null);
        setDragOverId(null);
      };
      window.addEventListener('dragend', handleGlobalDragEnd);
      window.addEventListener('mouseup', handleGlobalDragEnd);
      return () => {
        document.body.style.cursor = '';
        window.removeEventListener('dragend', handleGlobalDragEnd);
        window.removeEventListener('mouseup', handleGlobalDragEnd);
      };
    } else {
      document.body.style.cursor = '';
    }
  }, [draggedId]);

  // Edit Todo State
  const [editingTodo, setEditingTodo] = useState<UserTodo | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPriority, setEditPriority] = useState<Priority>('NORMAL');
  const [editCategory, setEditCategory] = useState<string>('GENERAL');
  const [editDueDate, setEditDueDate] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Executive Conversion Modal State (for General Director)
  const [convertingTodo, setConvertingTodo] = useState<UserTodo | null>(null);
  const [targetDirIds, setTargetDirIds] = useState<string[]>([]);
  const [conversionDueDate, setConversionDueDate] = useState<string>('');
  const [isConvertingExec, setIsConvertingExec] = useState(false);

  // Daily Plan Conversion Modal State (for Directorate Directors)
  const [planConversionTodo, setPlanConversionTodo] = useState<UserTodo | null>(null);
  const [isConvertingToPlan, setIsConvertingToPlan] = useState(false);

  // Delete Confirmation Modal State
  const [deleteConfirmTodo, setDeleteConfirmTodo] = useState<{ id: string; title: string } | null>(null);
  const [isDeletingTodo, setIsDeletingTodo] = useState(false);

  // Toast Notification
  const [toast, setToast] = useState<{ title: string; desc: string; type?: 'success' | 'info' } | null>(null);

  const isGeneralDirector =
    currentUser.role === 'GENERAL_DIRECTOR' || currentUser.role === 'ASSISTANT_DIRECTOR';

  useEffect(() => {
    loadTodos();
    if (isGeneralDirector) {
      loadDirectorates();
    }
  }, []);

  const loadDirectorates = async () => {
    try {
      const dirs = await api.getDirectorates();
      setDirectorates(dirs);
    } catch (err) {
      console.error('Failed to load directorates', err);
    }
  };

  // Sort helper to ensure completed tasks always drop to bottom
  const sortWithCompletedAtBottom = (list: UserTodo[]) => {
    const pending = list.filter((t) => !t.isCompleted);
    const completed = list.filter((t) => t.isCompleted);
    return [...pending, ...completed];
  };

  const loadTodos = async () => {
    try {
      setLoading(true);
      const res = await api.getTodos();
      const sorted = sortWithCompletedAtBottom(res.todos || []);
      setTodos(sorted);
    } catch (err) {
      console.error('Failed to load todos', err);
    } finally {
      setLoading(false);
    }
  };

  const showToastMsg = (title: string, desc: string, type: 'success' | 'info' = 'success') => {
    setToast({ title, desc, type });
    setTimeout(() => setToast(null), 3800);
  };

  // Quick Add Todo
  const handleCreateTodo = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      setIsSubmitting(true);
      const created = await api.createTodo({
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
        priority: newPriority,
        category: newCategory,
        dueDate: newDueDate || undefined,
      });

      setTodos((prev) => [created, ...prev]);
      setNewTitle('');
      setNewDesc('');
      setNewPriority('NORMAL');
      setNewCategory('GENERAL');
      setNewDueDate('');
      setShowAdvancedAdd(false);

      window.dispatchEvent(new CustomEvent('ports:todos_updated'));
    } catch (err) {
      console.error('Failed to create todo', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle Completion (moves completed task immediately to bottom)
  const handleToggleTodo = async (todo: UserTodo) => {
    try {
      const nextCompleted = !todo.isCompleted;
      const updatedItem: UserTodo = {
        ...todo,
        isCompleted: nextCompleted,
        completedAt: nextCompleted ? new Date().toISOString() : null,
      };

      // Optimistic update: place completed at bottom or restore to pending
      const updatedList = todos.map((t) => (t.id === todo.id ? updatedItem : t));
      const sorted = sortWithCompletedAtBottom(updatedList);
      setTodos(sorted);

      const updated = await api.toggleTodo(todo.id);

      // Persist the new order in backend
      api.reorderTodos(sorted.map((t) => t.id)).catch(() => {});

      window.dispatchEvent(new CustomEvent('ports:todos_updated'));
    } catch (err) {
      console.error('Failed to toggle todo', err);
      loadTodos();
    }
  };


  // Toggle Priority Dropdown with dynamic viewport placement and edge protection
  const handleTogglePriorityDropdown = (e: React.MouseEvent<HTMLButtonElement>, todoId: string) => {
    e.stopPropagation();
    setActiveCategoryDropdownId(null);
    if (activePriorityDropdownId === todoId) {
      setActivePriorityDropdownId(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setDropdownPlacement(spaceBelow < 185 ? 'up' : 'down');
    setDropdownAlign(rect.right - 160 < 15 ? 'left' : 'right');
    setActivePriorityDropdownId(todoId);
  };

  // Toggle Category Dropdown with dynamic viewport placement and edge protection
  const handleToggleCategoryDropdown = (e: React.MouseEvent<HTMLButtonElement>, todoId: string) => {
    e.stopPropagation();
    setActivePriorityDropdownId(null);
    if (activeCategoryDropdownId === todoId) {
      setActiveCategoryDropdownId(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setDropdownPlacement(spaceBelow < 230 ? 'up' : 'down');
    setDropdownAlign(rect.right - 170 < 15 ? 'left' : 'right');
    setActiveCategoryDropdownId(todoId);
  };

  // Quick Change Priority directly from Badge
  const handleQuickChangePriority = async (todoId: string, newPriority: Priority) => {
    setActivePriorityDropdownId(null);
    setTodos((prev) =>
      prev.map((t) => (t.id === todoId ? { ...t, priority: newPriority } : t))
    );
    try {
      await api.updateTodo(todoId, { priority: newPriority });
      window.dispatchEvent(new CustomEvent('ports:todos_updated'));
    } catch (err) {
      console.error('Failed to update priority', err);
      loadTodos();
    }
  };

  // Quick Change Category directly from Badge
  const handleQuickChangeCategory = async (todoId: string, newCategory: string) => {
    setActiveCategoryDropdownId(null);
    setTodos((prev) =>
      prev.map((t) => (t.id === todoId ? { ...t, category: newCategory } : t))
    );
    try {
      await api.updateTodo(todoId, { category: newCategory });
      window.dispatchEvent(new CustomEvent('ports:todos_updated'));
    } catch (err) {
      console.error('Failed to update category', err);
      loadTodos();
    }
  };

  // Quick Change Due Date directly from Badge / CustomDatePicker
  const handleQuickChangeDueDate = async (todoId: string, newDate: string | null) => {
    const cleanDate = newDate && newDate.trim() ? newDate.trim() : null;
    setTodos((prev) =>
      prev.map((t) => (t.id === todoId ? { ...t, dueDate: cleanDate } : t))
    );
    try {
      await api.updateTodo(todoId, { dueDate: cleanDate });
      window.dispatchEvent(new CustomEvent('ports:todos_updated'));
    } catch (err) {
      console.error('Failed to update due date', err);
      loadTodos();
    }
  };

  // Unified Reorder Function (Used by Desktop Drag-and-Drop, Touch, and Up/Down Buttons)
  const reorderTodosArray = async (sourceId: string, targetId: string, position: 'top' | 'bottom') => {
    if (!sourceId || !targetId || sourceId === targetId) return;

    const currentTodos = [...todosRef.current];
    const sourceIndex = currentTodos.findIndex((t) => t.id === sourceId);
    const targetIndex = currentTodos.findIndex((t) => t.id === targetId);

    if (sourceIndex === -1 || targetIndex === -1) return;

    const [movedItem] = currentTodos.splice(sourceIndex, 1);
    const insertIndex = position === 'top' ? targetIndex : targetIndex + 1;
    currentTodos.splice(insertIndex > sourceIndex ? insertIndex - 1 : insertIndex, 0, movedItem);

    // Ensure completed tasks remain at the bottom
    const finalSorted = sortWithCompletedAtBottom(currentTodos);
    setTodos(finalSorted);

    try {
      await api.reorderTodos(finalSorted.map((t) => t.id));
    } catch (err) {
      console.error('Failed to persist reorder', err);
    }
  };

  // Move single item up by one slot (Instant One-Click / Keyboard Alt+Up)
  const handleMoveUp = async (todoId: string) => {
    setActiveReorderMenuId(null);
    const currentTodos = [...todosRef.current];
    const index = currentTodos.findIndex((t) => t.id === todoId);
    if (index <= 0) return;

    const prevItem = currentTodos[index - 1];
    if (prevItem.isCompleted) return;

    currentTodos[index - 1] = currentTodos[index];
    currentTodos[index] = prevItem;

    const finalSorted = sortWithCompletedAtBottom(currentTodos);
    setTodos(finalSorted);

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(15); } catch (_) {}
    }

    try {
      await api.reorderTodos(finalSorted.map((t) => t.id));
    } catch (err) {
      console.error('Failed to persist reorder', err);
    }
  };

  // Move single item down by one slot (Instant One-Click / Keyboard Alt+Down)
  const handleMoveDown = async (todoId: string) => {
    setActiveReorderMenuId(null);
    const currentTodos = [...todosRef.current];
    const index = currentTodos.findIndex((t) => t.id === todoId);
    if (index === -1 || index >= currentTodos.length - 1) return;

    const nextItem = currentTodos[index + 1];
    if (nextItem.isCompleted) return;

    currentTodos[index + 1] = currentTodos[index];
    currentTodos[index] = nextItem;

    const finalSorted = sortWithCompletedAtBottom(currentTodos);
    setTodos(finalSorted);

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(15); } catch (_) {}
    }

    try {
      await api.reorderTodos(finalSorted.map((t) => t.id));
    } catch (err) {
      console.error('Failed to persist reorder', err);
    }
  };

  // Move item to absolute top of active tasks
  const handleMoveToTop = async (todoId: string) => {
    setActiveReorderMenuId(null);
    const currentTodos = [...todosRef.current];
    const index = currentTodos.findIndex((t) => t.id === todoId);
    if (index <= 0) return;

    const [movedItem] = currentTodos.splice(index, 1);
    currentTodos.unshift(movedItem);

    const finalSorted = sortWithCompletedAtBottom(currentTodos);
    setTodos(finalSorted);

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate([15, 30, 15]); } catch (_) {}
    }

    showToastMsg('تم الترتيب', `تم نقل "${movedItem.title}" إلى بداية القائمة.`);

    try {
      await api.reorderTodos(finalSorted.map((t) => t.id));
    } catch (err) {
      console.error('Failed to persist reorder', err);
    }
  };

  // Move item to bottom of active tasks
  const handleMoveToBottom = async (todoId: string) => {
    setActiveReorderMenuId(null);
    const currentTodos = [...todosRef.current];
    const index = currentTodos.findIndex((t) => t.id === todoId);
    if (index === -1) return;

    const [movedItem] = currentTodos.splice(index, 1);
    const firstCompletedIndex = currentTodos.findIndex((t) => t.isCompleted);
    if (firstCompletedIndex === -1) {
      currentTodos.push(movedItem);
    } else {
      currentTodos.splice(firstCompletedIndex, 0, movedItem);
    }

    const finalSorted = sortWithCompletedAtBottom(currentTodos);
    setTodos(finalSorted);

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate([15, 30, 15]); } catch (_) {}
    }

    showToastMsg('تم الترتيب', `تم نقل "${movedItem.title}" إلى نهاية قائمة المهام النشطة.`);

    try {
      await api.reorderTodos(finalSorted.map((t) => t.id));
    } catch (err) {
      console.error('Failed to persist reorder', err);
    }
  };

  // Inline Title Editing Handlers (Microsoft To Do style)
  const handleStartInlineEdit = (todo: UserTodo) => {
    if (todo.isCompleted) return;
    setInlineEditingId(todo.id);
    setInlineTitleValue(todo.title);
    setTimeout(() => {
      inlineInputRef.current?.focus();
      inlineInputRef.current?.select();
    }, 40);
  };

  const handleSaveInlineEdit = async (todoId: string) => {
    const trimmed = inlineTitleValue.trim();
    if (!trimmed) {
      setInlineEditingId(null);
      return;
    }
    const currentTodo = todos.find((t) => t.id === todoId);
    if (currentTodo && currentTodo.title === trimmed) {
      setInlineEditingId(null);
      return;
    }

    // Optimistic update
    setTodos((prev) =>
      prev.map((t) => (t.id === todoId ? { ...t, title: trimmed } : t))
    );
    setInlineEditingId(null);

    try {
      await api.updateTodo(todoId, { title: trimmed });
      window.dispatchEvent(new CustomEvent('ports:todos_updated'));
    } catch (err) {
      console.error('Failed to save inline edit', err);
      loadTodos();
    }
  };

  const handleCancelInlineEdit = () => {
    setInlineEditingId(null);
    setInlineTitleValue('');
  };

  // Desktop Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    draggedIdRef.current = id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedId === targetId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const offset = e.clientY - rect.top;
    const isTop = offset < rect.height / 2;
    const newPos = isTop ? 'top' : 'bottom';

    // Only update state when changed to avoid layout re-render loops
    if (dragOverIdRef.current !== targetId || dropPositionRef.current !== newPos) {
      setDragOverId(targetId);
      setDropPosition(newPos);
      dragOverIdRef.current = targetId;
      dropPositionRef.current = newPos;
    }
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    const sourceId = draggedId;
    const pos = dropPosition;
    setDraggedId(null);
    setDragOverId(null);

    await reorderTodosArray(sourceId, targetId, pos);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
    draggedIdRef.current = null;
    dragOverIdRef.current = null;
    document.body.style.cursor = '';
  };

  // Mobile Touch Long-Press Drag-and-Drop Handlers with Floating Clone
  const handleWindowTouchMove = useCallback((e: TouchEvent) => {
    if (!isTouchDraggingRef.current) return;

    if (e.cancelable) {
      e.preventDefault();
    }

    const touch = e.touches[0];
    if (!touch) return;

    setTouchCurrentPos({ x: touch.clientX, y: touch.clientY });

    // Edge auto-scroll
    const edgeMargin = 80;
    if (touch.clientY < edgeMargin) {
      window.scrollBy({ top: -10, behavior: 'auto' });
    } else if (touch.clientY > window.innerHeight - edgeMargin) {
      window.scrollBy({ top: 10, behavior: 'auto' });
    }

    // Find task card element under current finger coordinates
    const elem = document.elementFromPoint(touch.clientX, touch.clientY);
    const card = elem?.closest('[data-todo-id]');
    if (card) {
      const targetId = card.getAttribute('data-todo-id');
      if (targetId && targetId !== draggedIdRef.current) {
        const targetTodo = todosRef.current.find((t) => t.id === targetId);
        if (targetTodo && !targetTodo.isCompleted) {
          const rect = card.getBoundingClientRect();
          const isTop = touch.clientY < (rect.top + rect.height / 2);
          const pos = isTop ? 'top' : 'bottom';
          
          if (dragOverIdRef.current !== targetId || dropPositionRef.current !== pos) {
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              try { navigator.vibrate(12); } catch (_) {}
            }
            setDragOverId(targetId);
            setDropPosition(pos);
            dragOverIdRef.current = targetId;
            dropPositionRef.current = pos;
          }
        }
      }
    }
  }, []);

  const handleWindowTouchEnd = useCallback(() => {
    window.removeEventListener('touchmove', handleWindowTouchMove);
    window.removeEventListener('touchend', handleWindowTouchEnd);
    window.removeEventListener('touchcancel', handleWindowTouchEnd);

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (isTouchDraggingRef.current) {
      const sourceId = draggedIdRef.current;
      const targetId = dragOverIdRef.current;
      const pos = dropPositionRef.current;

      if (sourceId && targetId && sourceId !== targetId) {
        reorderTodosArray(sourceId, targetId, pos);
      }

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(25);
        } catch (_) {}
      }
    }

    isTouchDraggingRef.current = false;
    setIsTouchDragging(false);
    draggedIdRef.current = null;
    dragOverIdRef.current = null;
    setDraggedId(null);
    setDragOverId(null);
    setTouchGhostTodo(null);
    document.body.style.userSelect = '';
  }, [handleWindowTouchMove]);

  const handleTouchStart = (e: React.TouchEvent, todo: UserTodo) => {
    if (todo.isCompleted) return;

    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('a') ||
      target.closest('.priority-popover') ||
      target.closest('.category-popover') ||
      target.closest('.reorder-menu-popover') ||
      target.closest('[data-no-dnd]')
    ) {
      return;
    }

    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    longPressTimerRef.current = setTimeout(() => {
      isTouchDraggingRef.current = true;
      setIsTouchDragging(true);
      draggedIdRef.current = todo.id;
      setDraggedId(todo.id);
      setTouchGhostTodo(todo);
      setTouchCurrentPos({ x: touch.clientX, y: touch.clientY });
      document.body.style.userSelect = 'none';

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(35);
        } catch (_) {}
      }

      window.addEventListener('touchmove', handleWindowTouchMove, { passive: false });
      window.addEventListener('touchend', handleWindowTouchEnd);
      window.addEventListener('touchcancel', handleWindowTouchEnd);
    }, 240);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isTouchDraggingRef.current && longPressTimerRef.current) {
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
      const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
      if (dx > 8 || dy > 8) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  const handleTouchEndOrCancel = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Cleanup touch listeners on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
      window.removeEventListener('touchmove', handleWindowTouchMove);
      window.removeEventListener('touchend', handleWindowTouchEnd);
      window.removeEventListener('touchcancel', handleWindowTouchEnd);
      document.body.style.userSelect = '';
    };
  }, [handleWindowTouchMove, handleWindowTouchEnd]);

  // Delete Todo Dialog Trigger
  const handleDeleteTodo = (id: string, title: string) => {
    setDeleteConfirmTodo({ id, title });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmTodo) return;

    try {
      setIsDeletingTodo(true);
      const targetId = deleteConfirmTodo.id;
      setTodos((prev) => prev.filter((t) => t.id !== targetId));
      await api.deleteTodo(targetId);
      setDeleteConfirmTodo(null);
      window.dispatchEvent(new CustomEvent('ports:todos_updated'));
    } catch (err) {
      console.error('Failed to delete todo', err);
      loadTodos();
    } finally {
      setIsDeletingTodo(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (todo: UserTodo) => {
    setEditingTodo(todo);
    setEditTitle(todo.title);
    setEditDesc(getCleanTodoDescription(todo.description));
    setEditPriority(todo.priority);
    setEditCategory(todo.category || 'GENERAL');
    setEditDueDate(todo.dueDate ? new Date(todo.dueDate).toISOString().split('T')[0] : '');
  };

  // Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTodo || !editTitle.trim()) return;

    try {
      setSavingEdit(true);
      // Preserve existing system tags if they existed in the original description
      const rawDesc = editingTodo.description || '';
      const tags: string[] = [];
      if (rawDesc.includes('الخطة اليومية')) tags.push('[تم إدراجها في الخطة اليومية]');
      if (rawDesc.includes('تكليف تنفيذي')) tags.push('[تم تحويلها إلى تكليف تنفيذي رسمي]');

      const cleanDesc = editDesc.trim();
      let finalDesc: string | undefined = cleanDesc || undefined;
      if (tags.length > 0) {
        finalDesc = cleanDesc ? `${cleanDesc}\n${tags.join('\n')}` : tags.join('\n');
      }

      const updated = await api.updateTodo(editingTodo.id, {
        title: editTitle.trim(),
        description: finalDesc,
        priority: editPriority,
        category: editCategory,
        dueDate: editDueDate || null,
      });

      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setEditingTodo(null);
      showToastMsg('تم التحديث', 'تم حفظ تعديلات المهمة بنجاح.');
      window.dispatchEvent(new CustomEvent('ports:todos_updated'));
    } catch (err) {
      console.error('Failed to update todo', err);
    } finally {
      setSavingEdit(false);
    }
  };

  // Open Daily Plan Task Conversion Dialog (For Directorate Directors)
  const handleConvertToPlan = (todo: UserTodo) => {
    setPlanConversionTodo(todo);
  };

  const handleConfirmPlanConversion = async () => {
    if (!planConversionTodo) return;

    try {
      setIsConvertingToPlan(true);
      const res = await api.convertTodoToPlanTask(planConversionTodo.id);
      showToastMsg('تم الإدراج بالخطة اليومية', res.message);
      setPlanConversionTodo(null);
      // Reload todos to reflect update
      loadTodos();
      window.dispatchEvent(new CustomEvent('ports:todos_updated'));
    } catch (err: any) {
      console.error('Failed to convert to plan task', err);
      alert(err.message || 'تعذر تحويل المهمة إلى الخطة اليومية');
    } finally {
      setIsConvertingToPlan(false);
    }
  };

  // Open Executive Task Conversion Dialog (For General Director)
  const handleOpenExecConversion = (todo: UserTodo) => {
    setConvertingTodo(todo);
    setTargetDirIds([]);
    setConversionDueDate(todo.dueDate ? new Date(todo.dueDate).toISOString().split('T')[0] : '');
  };

  // Submit Executive Task Conversion
  const handleConfirmExecConversion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertingTodo) return;
    if (targetDirIds.length === 0) {
      alert('يرجى اختيار مديرية واحدة على الأقل لإسناد التكليف إليها.');
      return;
    }

    try {
      setIsConvertingExec(true);
      const res = await api.convertTodoToExecutiveTask(convertingTodo.id, {
        directorateIds: targetDirIds,
        dueDate: conversionDueDate || undefined,
      });

      showToastMsg('تم إصدار التكليف التنفيذي', res.message);
      setConvertingTodo(null);
      loadTodos();
      window.dispatchEvent(new CustomEvent('ports:todos_updated'));
    } catch (err: any) {
      console.error('Failed to convert to executive task', err);
      alert(err.message || 'تعذر تحويل المهمة إلى تكليف تنفيذي');
    } finally {
      setIsConvertingExec(false);
    }
  };

  // Computed Stats
  const stats = useMemo(() => {
    const total = todos.length;
    const completed = todos.filter((t) => t.isCompleted).length;
    const pending = total - completed;
    const urgent = todos.filter((t) => !t.isCompleted && (t.priority === 'URGENT' || t.priority === 'HIGH')).length;
    
    const todayStr = new Date().toISOString().split('T')[0];
    const dueToday = todos.filter((t) => {
      if (t.isCompleted || !t.dueDate) return false;
      return new Date(t.dueDate).toISOString().split('T')[0] === todayStr;
    }).length;

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, pending, urgent, dueToday, completionRate };
  }, [todos]);

  // Filtered List
  const filteredTodos = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];

    return todos.filter((todo) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = todo.title.toLowerCase().includes(q);
        const matchDesc = todo.description?.toLowerCase().includes(q) || false;
        if (!matchTitle && !matchDesc) return false;
      }

      // Status Tab
      if (statusTab === 'PENDING' && todo.isCompleted) return false;
      if (statusTab === 'COMPLETED' && !todo.isCompleted) return false;
      if (statusTab === 'TODAY') {
        if (!todo.dueDate) return false;
        const dStr = new Date(todo.dueDate).toISOString().split('T')[0];
        if (dStr !== todayStr) return false;
      }

      // Category
      if (selectedCategoryFilter !== 'ALL' && todo.category !== selectedCategoryFilter) {
        return false;
      }

      return true;
    });
  }, [todos, searchQuery, statusTab, selectedCategoryFilter]);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 left-5 z-50 max-w-sm rounded-2xl bg-[#05261e] border border-[#d4af37] p-4 text-white shadow-2xl flex items-start gap-3 animate-in slide-in-from-bottom-5">
          <Sparkles className="w-5 h-5 text-[#d4af37] shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <h4 className="font-bold text-[#d4af37] text-sm">{toast.title}</h4>
            <p className="mt-0.5 text-slate-200">{toast.desc}</p>
          </div>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-l from-[#05261e] via-[#0c3e35] to-[#05261e] p-4 sm:p-8 text-white shadow-xl border border-[#0c3e35]">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#d4af37]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 left-10 w-72 h-72 bg-[#0c3e35]/40 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4">
          <div className="space-y-1 sm:space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center size-8 sm:size-9 rounded-xl bg-[#d4af37]/20 border border-[#d4af37]/30 text-[#d4af37]">
                <ListTodo className="w-4 h-4 sm:w-5 sm:h-5" />
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-[#d4af37]/15 text-[#d4af37] text-[11px] sm:text-xs font-bold border border-[#d4af37]/20">
                المفكرة التنفيذية الخاصة
              </span>
            </div>
            <h1 className="text-lg sm:text-2xl font-black tracking-tight text-white flex items-center gap-2 flex-wrap">
              أجندة المهام اليومية والمتابعات
              <span className="text-[#d4af37]">({currentUser.fullName})</span>
            </h1>
            <p className="text-xs sm:text-sm text-[#8daaa2] leading-relaxed">
              مساحة عمل خاصة وسريعة لتدوين مهامك الشخصية ومواعيدك، مع إمكانية تحويلها إلى خطط أو تكليفات رسمية بنقرة واحدة.
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap w-full md:w-auto justify-between sm:justify-start">
            <button
              onClick={loadTodos}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-[#0c3e35] hover:bg-[#0c4237] border border-[#d4af37]/40 text-[#d4af37] transition cursor-pointer active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>

            {onBackToDashboard && (
              <button
                onClick={onBackToDashboard}
                className="flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-2 text-xs font-bold rounded-xl bg-[#d4af37] text-[#05261e] hover:bg-[#c5a059] transition shadow-md cursor-pointer active:scale-95"
              >
                <ArrowRight className="w-4 h-4" />
                <span>العودة للوحة القيادة</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        
        {/* Total Tasks */}
        <div className="rounded-2xl border border-[#d2d1c9] bg-white p-4 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-[#0c3e35]/10 text-[#0c3e35]">
              <ListTodo className="w-5 h-5" />
            </span>
            <span className="text-[11px] font-bold text-[#0c3e35] bg-[#0c3e35]/10 px-2 py-0.5 rounded-md">
              الإجمالي
            </span>
          </div>
          <div className="text-2xl font-black text-[#05261e]">{stats.total}</div>
          <p className="text-xs font-semibold text-[#5e736e] mt-0.5">كافة المهام المسجلة</p>
        </div>

        {/* Due Today */}
        <div className="rounded-2xl border border-[#d2d1c9] bg-white p-4 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Calendar className="w-5 h-5" />
            </span>
            <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
              اليوم
            </span>
          </div>
          <div className="text-2xl font-black text-blue-900">{stats.dueToday}</div>
          <p className="text-xs font-semibold text-[#5e736e] mt-0.5">استحقاق اليوم</p>
        </div>

        {/* Urgent & High */}
        <div className={`rounded-2xl border p-4 shadow-xs transition hover:shadow-md ${
          stats.urgent > 0 ? 'bg-red-50/50 border-red-200' : 'bg-white border-[#d2d1c9]'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`flex size-9 items-center justify-center rounded-xl ${
              stats.urgent > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
            }`}>
              <Flame className="w-5 h-5" />
            </span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
              stats.urgent > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
            }`}>
              أولوية عالية
            </span>
          </div>
          <div className={`text-2xl font-black ${stats.urgent > 0 ? 'text-red-700' : 'text-[#05261e]'}`}>
            {stats.urgent}
          </div>
          <p className="text-xs font-semibold text-[#5e736e] mt-0.5">عاجل وطارئ</p>
        </div>

        {/* Completed */}
        <div className="rounded-2xl border border-[#d2d1c9] bg-white p-4 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="w-5 h-5" />
            </span>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
              منجزة
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-800">{stats.completed}</div>
          <p className="text-xs font-semibold text-[#5e736e] mt-0.5">تم شطبها بنجاح</p>
        </div>

        {/* Progress % */}
        <div className="col-span-2 lg:col-span-1 rounded-2xl border border-[#d2d1c9] bg-white p-4 shadow-xs transition hover:shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[#5e736e]">معدل الإنجاز</span>
            <span className="text-xs font-extrabold text-[#0c3e35]">{stats.completionRate}%</span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden mb-1">
            <div
              className="h-full bg-gradient-to-r from-[#0c3e35] to-[#d4af37] transition-all duration-500 rounded-full"
              style={{ width: `${stats.completionRate}%` }}
            />
          </div>
          <p className="text-[11px] font-semibold text-[#8daaa2] text-left">
            {stats.pending} مهام متبقية
          </p>
        </div>

      </div>

      {/* Quick Add Todo Card */}
      <div className="rounded-2xl sm:rounded-3xl border border-[#d2d1c9] bg-white p-3.5 sm:p-5 shadow-sm transition hover:shadow-md">
        <form onSubmit={handleCreateTodo} className="space-y-3">
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5">
            <div className="relative flex-1">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="اكتب مهمة جديدة ثم اضغط Enter..."
                className="w-full pl-4 pr-10 sm:pr-11 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold rounded-2xl bg-[#f8f9fa] border border-[#d2d1c9] focus:outline-hidden focus:ring-2 focus:ring-[#0c3e35] focus:bg-white transition text-[#05261e] placeholder:text-[#8daaa2]"
              />
              <span className="absolute right-3 sm:right-3.5 top-1/2 -translate-y-1/2 text-[#0c3e35]">
                <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              </span>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !newTitle.trim()}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 sm:px-5 py-2.5 sm:py-3 text-xs font-extrabold rounded-2xl bg-[#0c3e35] text-[#d4af37] hover:bg-[#05261e] transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0 active:scale-98"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              <span>إضافة المهمة</span>
            </button>
          </div>

          {/* Quick Config Row (Priority, Category, Date) */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 pt-1 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              
              {/* Category selector chips with horizontal scroll on mobile */}
              <div className="flex items-center gap-1 bg-[#f4f3ed] p-1 rounded-xl border border-[#d2d1c9]/60 max-w-full overflow-x-auto scrollbar-none py-1">
                {(['GENERAL', 'MEETING', 'FOLLOWUP', 'OFFICIAL', 'CALL'] as const).map((cat) => {
                  const meta = CATEGORY_LABELS[cat];
                  const isSelected = newCategory === cat;
                  return (
                    <button
                      type="button"
                      key={cat}
                      onClick={() => setNewCategory(cat)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer shrink-0 whitespace-nowrap ${
                        isSelected
                          ? 'bg-[#0c3e35] text-white shadow-xs'
                          : 'text-[#5e736e] hover:text-[#0c3e35] hover:bg-white/60'
                      }`}
                    >
                      {meta.icon}
                      <span>{meta.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Priority selector */}
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as Priority)}
                className="px-2.5 py-1.5 text-xs font-bold rounded-xl bg-white border border-[#d2d1c9] text-[#05261e] focus:outline-hidden cursor-pointer shrink-0"
              >
                <option value="LOW">أولوية منخفضة</option>
                <option value="NORMAL">أولوية عادية</option>
                <option value="HIGH">أولوية هامة</option>
                <option value="URGENT">أولوية طارئة جداً</option>
              </select>

              {/* Due Date Picker using system CustomDatePicker */}
              <CustomDatePicker
                value={newDueDate}
                onChange={(newVal) => setNewDueDate(newVal)}
                variant="input"
                placeholder="تاريخ الاستحقاق (اختياري)"
                allowClear={true}
                className="py-1 px-2.5 min-w-[140px] sm:min-w-[150px]"
              />

              <button
                type="button"
                onClick={() => setShowAdvancedAdd(!showAdvancedAdd)}
                className="text-xs font-bold text-[#0c3e35] hover:underline px-1 cursor-pointer whitespace-nowrap"
              >
                {showAdvancedAdd ? 'إخفاء الملاحظات' : '+ إضافة ملاحظات'}
              </button>
            </div>
          </div>

          {/* Collapsible Details / Notes Input */}
          {showAdvancedAdd && (
            <div className="pt-2 animate-in fade-in duration-200">
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="أضف تفاصيل أو أرقام هواتف أو ملاحظات فرعية للمهمة..."
                rows={2}
                className="w-full p-3 text-xs font-medium rounded-xl bg-[#f8f9fa] border border-[#d2d1c9] focus:outline-hidden focus:ring-2 focus:ring-[#0c3e35] focus:bg-white transition text-[#05261e]"
              />
            </div>
          )}

        </form>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 sm:gap-3 bg-white p-2.5 sm:p-3 rounded-2xl border border-[#d2d1c9]">
        
        {/* Status Tabs */}
        <div className="flex items-center gap-1 bg-[#f4f3ed] p-1 rounded-xl border border-[#d2d1c9]/60 max-w-full overflow-x-auto scrollbar-none shrink-0">
          <button
            onClick={() => setStatusTab('ALL')}
            className={`px-3 py-1.5 text-xs font-extrabold rounded-lg transition shrink-0 whitespace-nowrap cursor-pointer ${
              statusTab === 'ALL' ? 'bg-[#0c3e35] text-white shadow-xs' : 'text-[#5e736e] hover:text-[#0c3e35]'
            }`}
          >
            كافة المهام ({todos.length})
          </button>
          <button
            onClick={() => setStatusTab('PENDING')}
            className={`px-3 py-1.5 text-xs font-extrabold rounded-lg transition shrink-0 whitespace-nowrap cursor-pointer ${
              statusTab === 'PENDING' ? 'bg-[#0c3e35] text-white shadow-xs' : 'text-[#5e736e] hover:text-[#0c3e35]'
            }`}
          >
            قيد المتابعة ({stats.pending})
          </button>
          <button
            onClick={() => setStatusTab('TODAY')}
            className={`px-3 py-1.5 text-xs font-extrabold rounded-lg transition shrink-0 whitespace-nowrap cursor-pointer ${
              statusTab === 'TODAY' ? 'bg-[#0c3e35] text-white shadow-xs' : 'text-[#5e736e] hover:text-[#0c3e35]'
            }`}
          >
            مهام اليوم ({stats.dueToday})
          </button>
          <button
            onClick={() => setStatusTab('COMPLETED')}
            className={`px-3 py-1.5 text-xs font-extrabold rounded-lg transition shrink-0 whitespace-nowrap cursor-pointer ${
              statusTab === 'COMPLETED' ? 'bg-[#0c3e35] text-white shadow-xs' : 'text-[#5e736e] hover:text-[#0c3e35]'
            }`}
          >
            المكتملة ({stats.completed})
          </button>
        </div>

        {/* Category Filter & Search */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          
          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            className="px-2.5 sm:px-3 py-2 text-xs font-bold rounded-xl bg-[#f8f9fa] border border-[#d2d1c9] text-[#05261e] focus:outline-hidden cursor-pointer shrink-0"
          >
            <option value="ALL">كافة التصنيفات</option>
            <option value="GENERAL">عام</option>
            <option value="MEETING">اجتماعات</option>
            <option value="FOLLOWUP">متابعات عاجلة</option>
            <option value="OFFICIAL">بريد ومعاملات</option>
            <option value="CALL">اتصالات هاتفية</option>
          </select>

          <div className="relative flex-1 md:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث في المهام..."
              className="w-full pl-3 pr-8 py-2 text-xs font-bold rounded-xl bg-[#f8f9fa] border border-[#d2d1c9] focus:outline-hidden focus:ring-1 focus:ring-[#0c3e35] text-[#05261e]"
            />
            <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5e736e]" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

        </div>

      </div>

      {/* Reorder Hint Bar */}
      {todos.length > 1 && (
        <div className="flex items-center justify-between text-[11px] text-[#5e736e] px-2 font-medium">
          <span className="flex items-center gap-1.5 font-bold text-[#0c3e35]">
            <ArrowUpDown className="w-3.5 h-3.5 text-[#d4af37]" />
            <span className="hidden sm:inline">
              يمكنك استخدام أسهم الترتيب (↑/↓) أو السحب والإفلات • انقر نقراً مزدوجاً على العنوان للتحرير السريع
            </span>
            <span className="inline sm:hidden">
              استخدم أسهم (↑/↓) أو اضغط مطولاً للسحب وإعادة الترتيب
            </span>
          </span>
          <span className="text-[#8daaa2] text-[10px] sm:text-[11px]">
            المهام المنجزة تستقر بالأسفل ⬇️
          </span>
        </div>
      )}

      {/* Todos List */}
      <div className="space-y-3">
        {loading ? (
          <div className="rounded-3xl border border-[#d2d1c9] bg-white p-12 text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#0c3e35]" />
            <p className="text-sm font-bold text-[#5e736e]">جاري تحميل قائمة المهام...</p>
          </div>
        ) : filteredTodos.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[#d2d1c9] bg-white/70 p-12 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-[#0c3e35]/10 text-[#0c3e35] flex items-center justify-center mx-auto">
              <CheckCheck className="w-7 h-7" />
            </div>
            <h3 className="text-base font-extrabold text-[#05261e]">لا توجد مهام مطابقة</h3>
            <p className="text-xs text-[#5e736e] max-w-sm mx-auto">
              {searchQuery || statusTab !== 'ALL' || selectedCategoryFilter !== 'ALL'
                ? 'لا توجد مهام تطابق خيارات الفلترة المحددة، جرّب تغيير الفلاتر.'
                : 'أجندتك فارغة حالياً. اكتب مهمتك الأولى في الحقل أعلاه لبدء تنظيم يومك.'}
            </p>
          </div>
        ) : (
          filteredTodos.map((todo, index) => {
            const priorityBadge = PRIORITY_BADGES[todo.priority] || PRIORITY_BADGES.NORMAL;
            const categoryMeta = CATEGORY_LABELS[todo.category] || CATEGORY_LABELS.GENERAL;

            const pendingTodos = filteredTodos.filter((t) => !t.isCompleted);
            const pendingIndex = pendingTodos.findIndex((t) => t.id === todo.id);
            const isFirstPending = pendingIndex === 0;
            const isLastPending = pendingIndex === pendingTodos.length - 1;

            const isDueToday =
              todo.dueDate &&
              new Date(todo.dueDate).toISOString().split('T')[0] === new Date().toISOString().split('T')[0];

            const isOverdue =
              todo.dueDate &&
              !todo.isCompleted &&
              new Date(todo.dueDate).toISOString().split('T')[0] < new Date().toISOString().split('T')[0];

            const isFirstCompleted =
              todo.isCompleted &&
              statusTab === 'ALL' &&
              (index === 0 || !filteredTodos[index - 1].isCompleted);

            const isDragging = draggedId === todo.id;
            const isDragOver = dragOverId === todo.id;

            return (
              <React.Fragment key={todo.id}>
                {isFirstCompleted && (
                  <div className="pt-3 pb-1 flex items-center gap-3 animate-in fade-in">
                    <div className="h-px bg-[#d2d1c9] flex-1" />
                    <span className="text-[11px] font-extrabold text-[#0c3e35] flex items-center gap-1.5 bg-[#edece4] px-3.5 py-1 rounded-full border border-[#d2d1c9]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>المهام المنجزة ({stats.completed})</span>
                    </span>
                    <div className="h-px bg-[#d2d1c9] flex-1" />
                  </div>
                )}

                <div
                  data-todo-id={todo.id}
                  draggable={!todo.isCompleted && inlineEditingId !== todo.id}
                  onDragStart={(e) => handleDragStart(e, todo.id)}
                  onDragOver={(e) => handleDragOver(e, todo.id)}
                  onDrop={(e) => handleDrop(e, todo.id)}
                  onDragEnd={handleDragEnd}
                  onTouchStart={(e) => handleTouchStart(e, todo)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEndOrCancel}
                  onTouchCancel={handleTouchEndOrCancel}
                  onKeyDown={(e) => {
                    if (!todo.isCompleted && inlineEditingId !== todo.id) {
                      if (e.altKey && e.key === 'ArrowUp') {
                        e.preventDefault();
                        handleMoveUp(todo.id);
                      } else if (e.altKey && e.key === 'ArrowDown') {
                        e.preventDefault();
                        handleMoveDown(todo.id);
                      }
                    }
                  }}
                  className={`group rounded-2xl border transition-all duration-150 p-3.5 sm:p-4 relative ${
                    isDragging
                      ? 'opacity-40 scale-[0.99] border-dashed border-2 border-[#d4af37] bg-amber-50/40 z-20 ring-2 ring-[#d4af37]/30'
                      : isDragOver
                      ? 'bg-[#0c3e35]/5 shadow-md border-[#0c3e35]/40 ring-1 ring-[#0c3e35]/20'
                      : todo.isCompleted
                      ? 'bg-slate-50/80 border-slate-200 opacity-75'
                      : 'bg-white border-[#d2d1c9] shadow-xs hover:shadow-md hover:border-[#0c3e35]/40'
                  }`}
                >
                  {/* Dedicated Drop Indicator Line (Zero Layout Shift!) */}
                  {isDragOver && !isDragging && dropPosition === 'top' && (
                    <div className="absolute -top-1.5 left-3 right-3 h-1 bg-gradient-to-r from-[#0c3e35] via-[#d4af37] to-[#0c3e35] rounded-full shadow-md z-40 pointer-events-none flex items-center justify-between px-1 animate-in fade-in duration-100">
                      <span className="size-2 rounded-full bg-[#d4af37] shadow-xs ring-2 ring-white" />
                      <span className="size-2 rounded-full bg-[#d4af37] shadow-xs ring-2 ring-white" />
                    </div>
                  )}
                  {isDragOver && !isDragging && dropPosition === 'bottom' && (
                    <div className="absolute -bottom-1.5 left-3 right-3 h-1 bg-gradient-to-r from-[#0c3e35] via-[#d4af37] to-[#0c3e35] rounded-full shadow-md z-40 pointer-events-none flex items-center justify-between px-1 animate-in fade-in duration-100">
                      <span className="size-2 rounded-full bg-[#d4af37] shadow-xs ring-2 ring-white" />
                      <span className="size-2 rounded-full bg-[#d4af37] shadow-xs ring-2 ring-white" />
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-2 sm:gap-3">
                    
                    {/* Left: Drag Handle & Arrows + Checkbox + Title + Metadata */}
                    <div className="flex items-start gap-2 sm:gap-2.5 flex-1 min-w-0">
                      
                      {/* Drag Handle & Instant Reorder Arrows */}
                      {!todo.isCompleted ? (
                        <div
                          className="flex flex-col items-center justify-center shrink-0 select-none py-0.5"
                          data-no-dnd="true"
                        >
                          {/* Up Arrow */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveUp(todo.id);
                            }}
                            disabled={isFirstPending}
                            className={`size-5 rounded flex items-center justify-center transition cursor-pointer ${
                              isFirstPending
                                ? 'opacity-15 cursor-not-allowed text-slate-300'
                                : 'text-slate-400 hover:text-[#0c3e35] hover:bg-[#0c3e35]/10 active:scale-90'
                            }`}
                            title={isFirstPending ? 'في أعلى القائمة' : 'تحريك للأعلى خطوة واحدة (Alt+↑)'}
                          >
                            <ChevronUp className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>

                          {/* Grip Handle */}
                          <div
                            className="p-0.5 text-slate-300 hover:text-[#0c3e35] transition cursor-grab active:cursor-grabbing hover:scale-110"
                            title="اسحب أو اضغط مطولاً للترتيب الحر"
                          >
                            <GripVertical className="w-3.5 h-3.5" />
                          </div>

                          {/* Down Arrow */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveDown(todo.id);
                            }}
                            disabled={isLastPending}
                            className={`size-5 rounded flex items-center justify-center transition cursor-pointer ${
                              isLastPending
                                ? 'opacity-15 cursor-not-allowed text-slate-300'
                                : 'text-slate-400 hover:text-[#0c3e35] hover:bg-[#0c3e35]/10 active:scale-90'
                            }`}
                            title={isLastPending ? 'في أسفل القائمة' : 'تحريك للأسفل خطوة واحدة (Alt+↓)'}
                          >
                            <ChevronDown className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center mt-1 text-slate-200 shrink-0 select-none" title="المهام المكتملة مستقرة في الأسفل">
                          <GripVertical className="w-4 h-4 opacity-25 cursor-not-allowed" />
                        </div>
                      )}

                      {/* Custom Checkbox */}
                      <button
                        type="button"
                        onClick={() => handleToggleTodo(todo)}
                        className={`mt-0.5 size-6 rounded-lg border flex items-center justify-center transition cursor-pointer shrink-0 ${
                          todo.isCompleted
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                            : 'border-[#d2d1c9] hover:border-[#0c3e35] bg-white text-transparent'
                        }`}
                        title={todo.isCompleted ? 'إلغاء الشطب (إعادة للأعلى)' : 'شطب المهمة كمنجزة (نقل للأسفل)'}
                      >
                        <Check className="w-4 h-4 stroke-[3]" />
                      </button>

                      <div className="flex-1 min-w-0 space-y-1">
                        
                        {/* Inline Edit Form OR Title Display */}
                        {inlineEditingId === todo.id ? (
                          <div className="py-0.5" onClick={(e) => e.stopPropagation()}>
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                handleSaveInlineEdit(todo.id);
                              }}
                              className="flex items-center gap-1.5 flex-wrap"
                            >
                              <input
                                ref={inlineInputRef}
                                type="text"
                                value={inlineTitleValue}
                                onChange={(e) => setInlineTitleValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') {
                                    e.stopPropagation();
                                    handleCancelInlineEdit();
                                  }
                                }}
                                className="flex-1 min-w-[200px] px-2.5 py-1 text-sm font-extrabold text-[#05261e] bg-[#f8f9fa] border-2 border-[#0c3e35] rounded-xl focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-[#d4af37]/40 shadow-inner"
                                placeholder="عنوان المهمة..."
                                autoFocus
                              />
                              <button
                                type="submit"
                                className="px-2.5 py-1 rounded-xl bg-[#0c3e35] text-[#d4af37] hover:bg-[#05261e] flex items-center gap-1 text-xs font-extrabold shadow-xs transition cursor-pointer shrink-0 active:scale-95"
                                title="حفظ التعديل (Enter)"
                              >
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                                <span>حفظ</span>
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelInlineEdit}
                                className="px-2 py-1 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center gap-1 text-xs font-bold transition cursor-pointer shrink-0 active:scale-95"
                                title="إلغاء (Esc)"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>إلغاء</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleCancelInlineEdit();
                                  handleOpenEdit(todo);
                                }}
                                className="px-2 py-1 rounded-xl text-[11px] font-bold text-[#0c3e35] bg-[#0c3e35]/10 hover:bg-[#0c3e35]/20 flex items-center gap-1 transition cursor-pointer shrink-0 whitespace-nowrap"
                                title="تعديل كافة التفاصيل والملاحظات والتاريخ"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>خيارات متقدمة</span>
                              </button>
                            </form>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4
                              onDoubleClick={() => !todo.isCompleted && handleStartInlineEdit(todo)}
                              className={`text-sm font-extrabold leading-snug transition cursor-pointer select-none group/title inline-flex items-center gap-1.5 ${
                                todo.isCompleted
                                  ? 'line-through text-slate-400'
                                  : 'text-[#05261e] hover:text-[#0c3e35]'
                              }`}
                              title={!todo.isCompleted ? 'انقر نقراً مزدوجاً للتحرير السريع المباشر' : ''}
                            >
                              <span>{todo.title}</span>
                              {!todo.isCompleted && (
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartInlineEdit(todo);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 group-hover/title:opacity-100 p-0.5 text-slate-400 hover:text-[#0c3e35] transition rounded cursor-pointer"
                                  title="تحرير سريع للعنوان"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </span>
                              )}
                            </h4>

                            {/* Priority Badge Popover */}
                            <div className="relative priority-popover">
                              <button
                                type="button"
                                onClick={(e) => handleTogglePriorityDropdown(e, todo.id)}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold border transition cursor-pointer hover:shadow-xs hover:scale-105 active:scale-95 ${priorityBadge.color}`}
                                title="انقر لتغيير درجة الأولوية فورياً"
                              >
                                <span>{priorityBadge.label}</span>
                                <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                              </button>

                              {activePriorityDropdownId === todo.id && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className={`absolute z-40 w-36 bg-white border border-[#d2d1c9] rounded-xl shadow-xl p-1 text-right animate-in fade-in zoom-in-95 duration-150 ${
                                    dropdownAlign === 'left' ? 'left-0' : 'right-0'
                                  } ${
                                    dropdownPlacement === 'up'
                                      ? 'bottom-full mb-1.5'
                                      : 'top-full mt-1.5'
                                  }`}
                                >
                                  <span className="block px-2 py-1 text-[9px] font-bold text-[#8daaa2] border-b border-[#f4f3ed]">
                                    تغيير الأولوية:
                                  </span>
                                  {(['URGENT', 'HIGH', 'NORMAL', 'LOW'] as Priority[]).map((p) => {
                                    const badge = PRIORITY_BADGES[p];
                                    const isSelected = todo.priority === p;
                                    return (
                                      <button
                                        key={p}
                                        type="button"
                                        onClick={() => handleQuickChangePriority(todo.id, p)}
                                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                                          isSelected
                                            ? 'bg-[#0c3e35]/10 text-[#0c3e35]'
                                            : 'text-[#05261e] hover:bg-[#f8f9fa]'
                                        }`}
                                      >
                                        <span className={`px-1.5 py-0.2 rounded border ${badge.color}`}>
                                          {badge.label}
                                        </span>
                                        {isSelected && <Check className="w-3 h-3 text-[#0c3e35]" />}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Category Badge Popover */}
                            <div className="relative category-popover">
                              <button
                                type="button"
                                onClick={(e) => handleToggleCategoryDropdown(e, todo.id)}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border transition cursor-pointer hover:shadow-xs hover:scale-105 active:scale-95 ${categoryMeta.color}`}
                                title="انقر لتغيير نوع المهمة فورياً"
                              >
                                {categoryMeta.icon}
                                <span>{categoryMeta.label}</span>
                                <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                              </button>

                              {activeCategoryDropdownId === todo.id && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className={`absolute z-40 w-40 bg-white border border-[#d2d1c9] rounded-xl shadow-xl p-1 text-right animate-in fade-in zoom-in-95 duration-150 ${
                                    dropdownAlign === 'left' ? 'left-0' : 'right-0'
                                  } ${
                                    dropdownPlacement === 'up'
                                      ? 'bottom-full mb-1.5'
                                      : 'top-full mt-1.5'
                                  }`}
                                >
                                  <span className="block px-2 py-1 text-[9px] font-bold text-[#8daaa2] border-b border-[#f4f3ed]">
                                    تغيير نوع المهمة:
                                  </span>
                                  {(['GENERAL', 'MEETING', 'FOLLOWUP', 'OFFICIAL', 'CALL'] as const).map((cat) => {
                                    const meta = CATEGORY_LABELS[cat];
                                    const isSelected = todo.category === cat;
                                    return (
                                      <button
                                        key={cat}
                                        type="button"
                                        onClick={() => handleQuickChangeCategory(todo.id, cat)}
                                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                                          isSelected
                                            ? 'bg-[#0c3e35]/10 text-[#0c3e35]'
                                            : 'text-[#05261e] hover:bg-[#f8f9fa]'
                                        }`}
                                      >
                                        <span className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded border ${meta.color}`}>
                                          {meta.icon}
                                          <span>{meta.label}</span>
                                        </span>
                                        {isSelected && <Check className="w-3 h-3 text-[#0c3e35]" />}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Due Date Indicator */}
                            {(todo.dueDate || !todo.isCompleted) && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="relative inline-flex items-center"
                              >
                                <CustomDatePicker
                                  value={todo.dueDate ? new Date(todo.dueDate).toISOString().split('T')[0] : ''}
                                  onChange={(newDate) => handleQuickChangeDueDate(todo.id, newDate)}
                                  variant="badge"
                                  badgeStatus={
                                    isOverdue
                                      ? 'overdue'
                                      : isDueToday
                                      ? 'today'
                                      : todo.dueDate
                                      ? 'normal'
                                      : 'none'
                                  }
                                  placeholder="+ موعد"
                                  allowClear={true}
                                  disabled={todo.isCompleted}
                                />
                              </div>
                            )}

                            {/* Badges for Plan / Executive Linking */}
                            {todo.description?.includes('الخطة اليومية') && (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-xs"
                                title="هذه المهمة مدرجة في الخطة اليومية للمديرية"
                              >
                                <FileText className="w-3 h-3 text-emerald-600 shrink-0" />
                                <span>مدرجة بالخطة اليومية</span>
                              </span>
                            )}

                            {todo.description?.includes('تكليف تنفيذي') && (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-50 text-amber-900 border border-amber-300 shadow-xs"
                                title="تم إصدار تكليف تنفيذي رسمي بهذه المهمة"
                              >
                                <Layers className="w-3 h-3 text-amber-700 shrink-0" />
                                <span>مُكلّفة رسمياً</span>
                              </span>
                            )}

                            {todo.isCompleted && todo.completedAt && (
                              <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
                                <CheckCheck className="w-3 h-3" />
                                <span>أنجزت {new Date(todo.completedAt).toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' })}</span>
                              </span>
                            )}

                          </div>
                        )}

                        {/* Description */}
                        {getCleanTodoDescription(todo.description) && (
                          <p className={`text-xs whitespace-pre-line leading-relaxed ${
                            todo.isCompleted ? 'text-slate-400' : 'text-[#5e736e]'
                          }`}>
                            {getCleanTodoDescription(todo.description)}
                          </p>
                        )}

                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                    
                    {/* Smart Conversion: For Directorate Director -> Convert to Daily Plan */}
                    {!isGeneralDirector && currentUser.directorateId && !todo.isCompleted && (
                      <button
                        type="button"
                        onClick={() => handleConvertToPlan(todo)}
                        className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition border cursor-pointer min-h-[30px] ${
                          todo.description?.includes('الخطة اليومية')
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 shadow-xs'
                            : 'bg-[#0c3e35]/10 hover:bg-[#0c3e35] text-[#0c3e35] hover:text-white border-[#0c3e35]/20'
                        }`}
                        title={
                          todo.description?.includes('الخطة اليومية')
                            ? 'المهمة مدرجة مسبقاً في الخطة اليومية (انقر لإدراج نسخة إضافية)'
                            : 'إدراج هذه المهمة في الخطة الصباحية الرسمية لليوم مع الحفاظ عليها في أجندتك'
                        }
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">
                          {todo.description?.includes('الخطة اليومية') ? 'مدرجة بالخطة ✓' : 'إدراج بالخطة اليومية'}
                        </span>
                      </button>
                    )}

                    {/* Smart Conversion: For General Director -> Convert to Executive Task */}
                    {isGeneralDirector && !todo.isCompleted && (
                      <button
                        type="button"
                        onClick={() => handleOpenExecConversion(todo)}
                        className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold transition border cursor-pointer min-h-[30px] ${
                          todo.description?.includes('تكليف تنفيذي')
                            ? 'bg-amber-100 text-amber-900 border-amber-400 hover:bg-amber-200 shadow-xs'
                            : 'bg-[#d4af37]/20 hover:bg-[#d4af37] text-[#05261e] border-[#d4af37]/40'
                        }`}
                        title={
                          todo.description?.includes('تكليف تنفيذي')
                            ? 'صدر بها أمر تكليف مسبقاً (انقر لتكليف مديريات إضافية)'
                            : 'تحويل هذه المهمة إلى تكليف رسمي وإسناده لإحدى مديريات الموانئ مع الحفاظ عليها في أجندتك'
                        }
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">
                          {todo.description?.includes('تكليف تنفيذي') ? 'مُكلّفة رسمياً ✓' : 'تحويل لتكليف تنفيذي'}
                        </span>
                      </button>
                    )}

                    {/* Quick Reorder Dropdown Menu (Move to top, Move to bottom) */}
                    {!todo.isCompleted && (
                      <div className="relative reorder-menu-popover" data-no-dnd="true">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveReorderMenuId(activeReorderMenuId === todo.id ? null : todo.id);
                          }}
                          className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-[#0c3e35] hover:bg-slate-100 transition cursor-pointer min-w-[30px] min-h-[30px] flex items-center justify-center"
                          title="خيارات نقل وترتيب المهمة"
                        >
                          <ArrowUpDown className="w-3.5 h-3.5" />
                        </button>

                        {activeReorderMenuId === todo.id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className={`absolute z-40 w-44 bg-white border border-[#d2d1c9] rounded-2xl shadow-2xl p-1.5 text-right animate-in fade-in zoom-in-95 duration-150 ${
                              dropdownPlacement === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                            } left-0`}
                          >
                            <span className="block px-2 py-1 text-[10px] font-extrabold text-[#8daaa2] border-b border-[#f4f3ed]">
                              ترتيب ونقل المهمة:
                            </span>
                            <button
                              type="button"
                              onClick={() => handleMoveToTop(todo.id)}
                              disabled={isFirstPending}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                                isFirstPending
                                  ? 'opacity-40 cursor-not-allowed text-slate-400'
                                  : 'text-[#05261e] hover:bg-[#0c3e35]/10 hover:text-[#0c3e35]'
                              }`}
                            >
                              <span className="flex items-center gap-1.5">
                                <ChevronsUp className="w-4 h-4 text-[#d4af37]" />
                                <span>نقل لأعلى القائمة</span>
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setActiveReorderMenuId(null);
                                handleMoveUp(todo.id);
                              }}
                              disabled={isFirstPending}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                                isFirstPending
                                  ? 'opacity-40 cursor-not-allowed text-slate-400'
                                  : 'text-[#05261e] hover:bg-[#0c3e35]/10 hover:text-[#0c3e35]'
                              }`}
                            >
                              <span className="flex items-center gap-1.5">
                                <ChevronUp className="w-4 h-4 text-[#0c3e35]" />
                                <span>تحريك للأعلى (خطوة)</span>
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setActiveReorderMenuId(null);
                                handleMoveDown(todo.id);
                              }}
                              disabled={isLastPending}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                                isLastPending
                                  ? 'opacity-40 cursor-not-allowed text-slate-400'
                                  : 'text-[#05261e] hover:bg-[#0c3e35]/10 hover:text-[#0c3e35]'
                              }`}
                            >
                              <span className="flex items-center gap-1.5">
                                <ChevronDown className="w-4 h-4 text-[#0c3e35]" />
                                <span>تحريك للأسفل (خطوة)</span>
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleMoveToBottom(todo.id)}
                              disabled={isLastPending}
                              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                                isLastPending
                                  ? 'opacity-40 cursor-not-allowed text-slate-400'
                                  : 'text-[#05261e] hover:bg-[#0c3e35]/10 hover:text-[#0c3e35]'
                              }`}
                            >
                              <span className="flex items-center gap-1.5">
                                <ChevronsDown className="w-4 h-4 text-[#5e736e]" />
                                <span>نقل لأسفل القائمة</span>
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Edit Button: Quick Inline Edit or Full Modal */}
                    <button
                      type="button"
                      onClick={() => {
                        if (!todo.isCompleted) {
                          handleStartInlineEdit(todo);
                        } else {
                          handleOpenEdit(todo);
                        }
                      }}
                      className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-[#0c3e35] hover:bg-slate-100 transition cursor-pointer min-w-[30px] min-h-[30px] flex items-center justify-center"
                      title={!todo.isCompleted ? 'تحرير سريع' : 'تعديل'}
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    {/* Delete Button */}
                    <button
                      type="button"
                      onClick={() => handleDeleteTodo(todo.id, todo.title)}
                      className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer min-w-[30px] min-h-[30px] flex items-center justify-center"
                      title="حذف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                  </div>

                </div>
              </div>
            </React.Fragment>
          );
        })
        )}
      </div>

      {/* Modal: Edit Todo */}
      {editingTodo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl sm:rounded-3xl bg-white border border-[#d2d1c9] shadow-2xl p-4 sm:p-6 overflow-hidden">
            
            <div className="flex items-center justify-between border-b border-[#d2d1c9]/60 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-[#0c3e35]/10 text-[#0c3e35]">
                  <Edit3 className="w-4 h-4" />
                </span>
                <h3 className="text-base font-extrabold text-[#05261e]">تعديل المهمة</h3>
              </div>
              <button
                onClick={() => setEditingTodo(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 overflow-y-auto flex-1 pr-1 pl-1 py-1">
              <div>
                <label className="block text-xs font-bold text-[#05261e] mb-1">عنوان المهمة</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-semibold rounded-xl border border-[#d2d1c9] focus:outline-hidden focus:ring-2 focus:ring-[#0c3e35] text-[#05261e]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#05261e] mb-1">ملاحظات وتفاصيل إضافية</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-[#d2d1c9] focus:outline-hidden focus:ring-2 focus:ring-[#0c3e35] text-[#05261e]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#05261e] mb-1">الأولوية</label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as Priority)}
                    className="w-full px-2.5 py-2 text-xs font-bold rounded-xl border border-[#d2d1c9] text-[#05261e] focus:outline-hidden"
                  >
                    <option value="LOW">منخفض</option>
                    <option value="NORMAL">عادي</option>
                    <option value="HIGH">هام</option>
                    <option value="URGENT">طارئ جداً</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#05261e] mb-1">التصنيف</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-bold rounded-xl border border-[#d2d1c9] text-[#05261e] focus:outline-hidden"
                  >
                    <option value="GENERAL">عام</option>
                    <option value="MEETING">اجتماع</option>
                    <option value="FOLLOWUP">متابعة عاجلة</option>
                    <option value="OFFICIAL">بريد ومعاملات</option>
                    <option value="CALL">اتصال هاتفي</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#05261e] mb-1">تاريخ الاستحقاق</label>
                  <CustomDatePicker
                    value={editDueDate ? (editDueDate.includes('T') ? editDueDate.split('T')[0] : editDueDate) : ''}
                    onChange={(val) => setEditDueDate(val)}
                    variant="input"
                    placeholder="اختر تاريخ الاستحقاق (اختياري)"
                    allowClear={true}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#d2d1c9]/60 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingTodo(null)}
                  className="px-4 py-2 text-xs font-bold rounded-xl border border-[#d2d1c9] text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingEdit || !editTitle.trim()}
                  className="flex items-center gap-1.5 px-5 py-2 text-xs font-extrabold rounded-xl bg-[#0c3e35] text-[#d4af37] hover:bg-[#05261e] transition shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>حفظ التعديلات</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Modal: Convert to Executive Task (For General Director) */}
      {convertingTodo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl sm:rounded-3xl bg-white border border-[#d2d1c9] shadow-2xl p-4 sm:p-6 overflow-hidden">
            
            <div className="flex items-center justify-between border-b border-[#d2d1c9]/60 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-[#d4af37]/20 text-[#0c3e35]">
                  <Layers className="w-4 h-4 text-[#d4af37]" />
                </span>
                <div>
                  <h3 className="text-base font-black text-[#05261e]">تحويل إلى تكليف تنفيذي رسمي</h3>
                  <p className="text-[11px] text-[#5e736e]">إسناد المهمة إلى مديرية أو عدة مديريات كأمر إداري ملزم مع الاحتفاظ بها في أجندتك</p>
                </div>
              </div>
              <button
                onClick={() => setConvertingTodo(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmExecConversion} className="space-y-4 overflow-y-auto flex-1 pr-1 pl-1 py-1">
              
              <div className="p-3 rounded-2xl bg-[#f4f3ed] border border-[#d2d1c9]/60 space-y-1">
                <span className="text-[10px] font-extrabold text-[#0c3e35]">المهمة المراد تكليفها:</span>
                <p className="text-sm font-black text-[#05261e]">{convertingTodo.title}</p>
                {convertingTodo.description && (
                  <p className="text-xs text-[#5e736e]">{convertingTodo.description}</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-[#05261e]">
                    اختر المديريات المعنية بالتكليف ({targetDirIds.length} مختارة)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (targetDirIds.length === directorates.length) {
                        setTargetDirIds([]);
                      } else {
                        setTargetDirIds(directorates.map((d) => d.id));
                      }
                    }}
                    className="text-[11px] font-bold text-[#0c3e35] hover:underline cursor-pointer"
                  >
                    {targetDirIds.length === directorates.length ? 'إلغاء التحديد' : 'تحديد كافة المديريات'}
                  </button>
                </div>

                <div className="max-h-36 sm:max-h-48 overflow-y-auto rounded-2xl border border-[#d2d1c9] p-2 space-y-1 bg-[#f8f9fa]">
                  {directorates.map((dir) => {
                    const isChecked = targetDirIds.includes(dir.id);
                    return (
                      <label
                        key={dir.id}
                        className={`flex items-center gap-2.5 p-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                          isChecked ? 'bg-[#0c3e35]/10 text-[#0c3e35]' : 'hover:bg-white text-[#5e736e]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setTargetDirIds([...targetDirIds, dir.id]);
                            } else {
                              setTargetDirIds(targetDirIds.filter((id) => id !== dir.id));
                            }
                          }}
                          className="size-4 rounded-md text-[#0c3e35] focus:ring-0"
                        />
                        <span>{dir.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#05261e] mb-1">
                  الموعد النهائي لتنفيذ التكليف (اختياري)
                </label>
                <CustomDatePicker
                  value={conversionDueDate}
                  onChange={(val) => setConversionDueDate(val)}
                  variant="input"
                  placeholder="حدد الموعد النهائي لتنفيذ التكليف"
                  allowClear={true}
                  className="w-full"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#d2d1c9]/60 shrink-0">
                <button
                  type="button"
                  onClick={() => setConvertingTodo(null)}
                  className="px-4 py-2 text-xs font-bold rounded-xl border border-[#d2d1c9] text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isConvertingExec || targetDirIds.length === 0}
                  className="flex items-center gap-1.5 px-5 py-2 text-xs font-extrabold rounded-xl bg-[#0c3e35] text-[#d4af37] hover:bg-[#05261e] transition shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {isConvertingExec ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>إصدار التكليف وإرساله فوراً</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Modal Dialog: Confirm Convert to Daily Plan (Replaces native browser alert) */}
      {planConversionTodo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md flex flex-col rounded-2xl sm:rounded-3xl bg-white border border-[#d2d1c9] shadow-2xl p-5 sm:p-6 overflow-hidden animate-in zoom-in-95 duration-200 text-right">
            
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-[#d2d1c9]/60 shrink-0">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-2xl bg-[#0c3e35]/10 text-[#0c3e35] border border-[#0c3e35]/20 shadow-xs">
                  <FileText className="w-5 h-5 text-[#0c3e35]" />
                </span>
                <div>
                  <h3 className="text-base font-black text-[#05261e]">إدراج المهمة في الخطة اليومية</h3>
                  <p className="text-[11px] font-bold text-[#5e736e]">
                    إضافة المهمة إلى الخطة الصباحية المعتمدة لمديريتك
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPlanConversionTodo(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="py-4 space-y-3">
              {/* Task Preview Card */}
              <div className="p-3.5 rounded-2xl bg-[#f4f3ed] border border-[#d2d1c9]/80 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black text-[#8daaa2] uppercase tracking-wider">
                    المهمة المراد إدراجها:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${PRIORITY_BADGES[planConversionTodo.priority]?.color || ''}`}>
                      {PRIORITY_BADGES[planConversionTodo.priority]?.label || ''}
                    </span>
                    {planConversionTodo.category && CATEGORY_LABELS[planConversionTodo.category] && (
                      <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${CATEGORY_LABELS[planConversionTodo.category].color}`}>
                        {CATEGORY_LABELS[planConversionTodo.category].label}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm font-black text-[#05261e] leading-snug">
                  {planConversionTodo.title}
                </p>
                {getCleanTodoDescription(planConversionTodo.description) && (
                  <p className="text-xs text-[#5e736e] leading-relaxed">
                    {getCleanTodoDescription(planConversionTodo.description)}
                  </p>
                )}
              </div>

              {/* Info Notice */}
              <div className="p-3 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 flex items-start gap-2.5 text-xs text-emerald-900 leading-relaxed font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p>
                    سيتم إدراج هذه المهمة فوراً في جدول الخطة اليومية الرسمية للمديرية ليتمكن المدير العام من متابعتها ودعمكم.
                  </p>
                  <p className="text-[11px] font-bold text-emerald-800 mt-1">
                    ✓ ستبقى المهمة محفوظة ونشطة في مفكرتك وأجندتك الخاصة كما هي دون أي حذف.
                  </p>
                  {planConversionTodo.description?.includes('الخطة اليومية') && (
                    <p className="text-[11px] font-bold text-amber-800 bg-amber-100/70 p-1.5 rounded-lg mt-2 border border-amber-300/50">
                      ملاحظة: هذه المهمة مدرجة مسبقاً في الخطة. سيؤدي هذا الإجراء لإدراج نسخة إضافية منها في الخطة اليومية.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#d2d1c9]/60 shrink-0">
              <button
                type="button"
                onClick={() => setPlanConversionTodo(null)}
                disabled={isConvertingToPlan}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-[#d2d1c9] text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmPlanConversion}
                disabled={isConvertingToPlan}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-extrabold rounded-xl bg-[#0c3e35] text-white hover:bg-[#05261e] transition shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer"
              >
                {isConvertingToPlan ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#d4af37]" />
                    <span>جاري الإدراج...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 text-[#d4af37]" />
                    <span>تأكيد الإدراج في الخطة</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal Dialog: Confirm Delete Todo (Replaces native browser confirm) */}
      {deleteConfirmTodo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-sm flex flex-col rounded-2xl sm:rounded-3xl bg-white border border-[#d2d1c9] shadow-2xl p-5 overflow-hidden animate-in zoom-in-95 duration-200 text-right">
            <div className="flex items-start gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-red-50 text-red-600 border border-red-200 shrink-0 shadow-xs">
                <Trash2 className="w-5 h-5" />
              </span>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-black text-[#05261e]">حذف المهمة</h3>
                <p className="text-xs text-[#5e736e] mt-1">
                  هل أنت متأكد من رغبتك في حذف المهمة من أجندتك؟
                </p>
                <p className="text-xs font-black text-red-700 bg-red-50 p-2.5 rounded-xl border border-red-200 mt-2 truncate">
                  {deleteConfirmTodo.title}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-4 mt-3 border-t border-[#d2d1c9]/60 shrink-0">
              <button
                type="button"
                onClick={() => setDeleteConfirmTodo(null)}
                disabled={isDeletingTodo}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-[#d2d1c9] text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeletingTodo}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-extrabold rounded-xl bg-red-600 text-white hover:bg-red-700 transition shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isDeletingTodo ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>نعم، احذف المهمة</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Touch Drag Floating Preview Clone (Microsoft To Do Style) */}
      {isTouchDragging && touchGhostTodo && (
        <div
          style={{
            position: 'fixed',
            left: `${touchCurrentPos.x}px`,
            top: `${touchCurrentPos.y}px`,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 9999,
            width: 'min(88vw, 420px)',
          }}
          className="rounded-2xl border-2 border-[#d4af37] bg-white/95 backdrop-blur-md shadow-2xl p-3.5 text-[#05261e] ring-4 ring-[#d4af37]/30 flex items-center justify-between gap-3 animate-in fade-in duration-100"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-8 rounded-xl bg-[#0c3e35] text-[#d4af37] flex items-center justify-center shrink-0 shadow-xs">
              <ArrowUpDown className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="font-extrabold text-xs text-[#05261e] truncate">{touchGhostTodo.title}</p>
              <span className="text-[10px] font-bold text-[#8daaa2]">حرّك إصبعك لموضع الإفلات ثم ارفعه</span>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-[#d4af37] text-[#05261e] shrink-0 shadow-xs">
            جاري النقل
          </span>
        </div>
      )}

    </div>
  );
};
