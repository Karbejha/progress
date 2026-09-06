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

  // Quick inline popover states for changing priority / category on the fly
  const [activePriorityDropdownId, setActivePriorityDropdownId] = useState<string | null>(null);
  const [activeCategoryDropdownId, setActiveCategoryDropdownId] = useState<string | null>(null);
  const [dropdownPlacement, setDropdownPlacement] = useState<'down' | 'up'>('down');
  const [dropdownAlign, setDropdownAlign] = useState<'right' | 'left'>('right');

  // Close popovers on click outside or escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.priority-popover') && !target.closest('.category-popover')) {
        setActivePriorityDropdownId(null);
        setActiveCategoryDropdownId(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActivePriorityDropdownId(null);
        setActiveCategoryDropdownId(null);
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

      showToastMsg('تمت إضافة المهمة بنجاح', `تم إدراج "${created.title}" في أجندتك.`);
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

  // Unified Reorder Function (Used by both Desktop Drag-and-Drop and Mobile Long-Press)
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

    setDragOverId(targetId);
    setDropPosition(isTop ? 'top' : 'bottom');
    dragOverIdRef.current = targetId;
    dropPositionRef.current = isTop ? 'top' : 'bottom';
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

  // Mobile Touch Long-Press Drag-and-Drop Handlers
  const handleWindowTouchMove = useCallback((e: TouchEvent) => {
    if (!isTouchDraggingRef.current) return;

    if (e.cancelable) {
      e.preventDefault();
    }

    const touch = e.touches[0];
    if (!touch) return;

    // Edge auto-scroll
    const edgeMargin = 70;
    if (touch.clientY < edgeMargin) {
      window.scrollBy({ top: -8, behavior: 'auto' });
    } else if (touch.clientY > window.innerHeight - edgeMargin) {
      window.scrollBy({ top: 8, behavior: 'auto' });
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
          setDragOverId(targetId);
          setDropPosition(pos);
          dragOverIdRef.current = targetId;
          dropPositionRef.current = pos;
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
    draggedIdRef.current = null;
    dragOverIdRef.current = null;
    setDraggedId(null);
    setDragOverId(null);
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
      draggedIdRef.current = todo.id;
      setDraggedId(todo.id);
      document.body.style.userSelect = 'none';

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(40);
        } catch (_) {}
      }

      window.addEventListener('touchmove', handleWindowTouchMove, { passive: false });
      window.addEventListener('touchend', handleWindowTouchEnd);
      window.addEventListener('touchcancel', handleWindowTouchEnd);
    }, 280);
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

  // Delete Todo
  const handleDeleteTodo = async (id: string, title: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف المهمة: "${title}"؟`)) return;

    try {
      setTodos((prev) => prev.filter((t) => t.id !== id));
      await api.deleteTodo(id);
      showToastMsg('تم الحذف', `تم حذف "${title}" من الأجندة.`);
      window.dispatchEvent(new CustomEvent('ports:todos_updated'));
    } catch (err) {
      console.error('Failed to delete todo', err);
      loadTodos();
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (todo: UserTodo) => {
    setEditingTodo(todo);
    setEditTitle(todo.title);
    setEditDesc(todo.description || '');
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
      const updated = await api.updateTodo(editingTodo.id, {
        title: editTitle.trim(),
        description: editDesc.trim() || undefined,
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

  // Convert to Daily Plan Task (For Directorate Directors)
  const handleConvertToPlan = async (todo: UserTodo) => {
    if (!window.confirm(`هل تريد إدراج "${todo.title}" رسمياً في الخطة اليومية الصباحية لمديريتك؟`)) {
      return;
    }

    try {
      const res = await api.convertTodoToPlanTask(todo.id);
      showToastMsg('تم الإدراج بالخطة اليومية', res.message);
      // Reload todos to reflect update
      loadTodos();
      window.dispatchEvent(new CustomEvent('ports:todos_updated'));
    } catch (err: any) {
      console.error('Failed to convert to plan task', err);
      alert(err.message || 'تعذر تحويل المهمة إلى الخطة اليومية');
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
            <span className="hidden sm:inline">يمكنك سحب وإفلات أي مهمة لإعادة ترتيبها للأعلى أو الأسفل</span>
            <span className="inline sm:hidden">اضغط مطولاً مع السحب لإعادة ترتيب المهمة</span>
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
                  draggable={!todo.isCompleted}
                  onDragStart={(e) => handleDragStart(e, todo.id)}
                  onDragOver={(e) => handleDragOver(e, todo.id)}
                  onDrop={(e) => handleDrop(e, todo.id)}
                  onDragEnd={handleDragEnd}
                  onTouchStart={(e) => handleTouchStart(e, todo)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEndOrCancel}
                  onTouchCancel={handleTouchEndOrCancel}
                  className={`group rounded-2xl border transition-all duration-200 p-4 relative ${
                    isDragging
                      ? 'opacity-70 scale-[1.02] shadow-xl border-2 border-[#d4af37] bg-amber-50/60 z-30 ring-4 ring-[#d4af37]/20 cursor-move'
                      : isDragOver
                      ? dropPosition === 'top'
                        ? 'border-t-4 border-t-[#0c3e35] bg-[#0c3e35]/5 ring-2 ring-[#0c3e35]/20 cursor-move'
                        : 'border-b-4 border-b-[#0c3e35] bg-[#0c3e35]/5 ring-2 ring-[#0c3e35]/20 cursor-move'
                      : todo.isCompleted
                      ? 'bg-slate-50/80 border-slate-200 opacity-75'
                      : 'bg-white border-[#d2d1c9] shadow-xs hover:shadow-md hover:border-[#0c3e35]/40 cursor-grab active:cursor-grabbing'
                  }`}
                >
                  {isDragging && (
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-[#0c3e35] text-[#d4af37] text-[10px] font-bold px-3 py-0.5 rounded-full shadow-md flex items-center gap-1.5 z-40 animate-pulse pointer-events-none select-none">
                      <ArrowUpDown className="w-3 h-3" />
                      <span>اسحب للموضع المطلوب للأعلى أو الأسفل</span>
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-2 sm:gap-3">
                    
                    {/* Left: Drag Handle + Checkbox + Title + Metadata */}
                    <div className="flex items-start gap-2 sm:gap-2.5 flex-1 min-w-0">
                      
                      {/* Drag / Touch Handle */}
                      <div
                        className={`flex items-center mt-1 text-slate-300 transition shrink-0 select-none ${
                          todo.isCompleted
                            ? 'opacity-20 cursor-not-allowed'
                            : 'cursor-grab active:cursor-grabbing group-hover:text-[#0c3e35] hover:scale-110'
                        }`}
                        title={todo.isCompleted ? 'المهام المكتملة مستقرة في الأسفل' : 'اسحب أو اضغط مطولاً لإعادة الترتيب'}
                      >
                        <GripVertical className="w-4 h-4" />
                      </div>

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
                        <div className="flex items-center gap-2 flex-wrap">
                          
                          <h4
                            className={`text-sm font-extrabold leading-snug transition ${
                              todo.isCompleted
                                ? 'line-through text-slate-400'
                                : 'text-[#05261e]'
                            }`}
                          >
                            {todo.title}
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

                          {/* Due Date Indicator - Editable on the fly via system CustomDatePicker */}
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

                          {todo.isCompleted && todo.completedAt && (
                            <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
                              <CheckCheck className="w-3 h-3" />
                              <span>أنجزت {new Date(todo.completedAt).toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' })}</span>
                            </span>
                          )}

                        </div>

                        {/* Description */}
                        {todo.description && (
                          <p className={`text-xs whitespace-pre-line leading-relaxed ${
                            todo.isCompleted ? 'text-slate-400' : 'text-[#5e736e]'
                          }`}>
                            {todo.description}
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
                        className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl bg-[#0c3e35]/10 hover:bg-[#0c3e35] text-[#0c3e35] hover:text-white text-[11px] font-bold transition border border-[#0c3e35]/20 cursor-pointer min-h-[30px]"
                        title="إدراج هذه المهمة فوراً في الخطة الصباحية الرسمية لليوم"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">إدراج بالخطة اليومية</span>
                      </button>
                    )}

                    {/* Smart Conversion: For General Director -> Convert to Executive Task */}
                    {isGeneralDirector && !todo.isCompleted && (
                      <button
                        type="button"
                        onClick={() => handleOpenExecConversion(todo)}
                        className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl bg-[#d4af37]/20 hover:bg-[#d4af37] text-[#05261e] text-[11px] font-extrabold transition border border-[#d4af37]/40 cursor-pointer min-h-[30px]"
                        title="تحويل هذه المهمة إلى تكليف رسمي وإسناده لإحدى مديريات الموانئ"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">تحويل لتكليف تنفيذي</span>
                      </button>
                    )}

                    {/* Edit Button */}
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(todo)}
                      className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-[#0c3e35] hover:bg-slate-100 transition cursor-pointer min-w-[30px] min-h-[30px] flex items-center justify-center"
                      title="تعديل"
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
                  <p className="text-[11px] text-[#5e736e]">إسناد المهمة إلى مديرية أو عدة مديريات كأمر إداري ملزم</p>
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

    </div>
  );
};
