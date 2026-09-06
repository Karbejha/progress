'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { User, UserTodo, Priority } from '../types';
import { api } from '../services/api';
import { CustomDatePicker } from './CustomDatePicker';
import {
  X,
  Plus,
  Check,
  CheckCircle2,
  Calendar,
  ListTodo,
  ExternalLink,
  Loader2,
  Trash2,
  Flame,
} from 'lucide-react';

interface QuickTodoDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onOpenFullView: () => void;
}

export const QuickTodoDrawer: React.FC<QuickTodoDrawerProps> = ({
  isOpen,
  onClose,
  currentUser,
  onOpenFullView,
}) => {
  const [todos, setTodos] = useState<UserTodo[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadTodos();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleUpdated = () => {
      if (isOpen) loadTodos();
    };
    window.addEventListener('ports:todos_updated', handleUpdated);
    return () => window.removeEventListener('ports:todos_updated', handleUpdated);
  }, [isOpen]);

  const loadTodos = async () => {
    try {
      setLoading(true);
      const res = await api.getTodos();
      setTodos(res.todos || []);
    } catch (err) {
      console.error('Failed to load drawer todos', err);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      setIsSubmitting(true);
      const created = await api.createTodo({
        title: newTitle.trim(),
        priority: 'NORMAL',
        category: 'GENERAL',
      });
      setTodos((prev) => [created, ...prev]);
      setNewTitle('');
      window.dispatchEvent(new CustomEvent('ports:todos_updated'));
    } catch (err) {
      console.error('Failed to quick add todo', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (todo: UserTodo) => {
    try {
      setTodos((prev) =>
        prev.map((t) =>
          t.id === todo.id ? { ...t, isCompleted: !t.isCompleted } : t
        )
      );
      const updated = await api.toggleTodo(todo.id);
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      window.dispatchEvent(new CustomEvent('ports:todos_updated'));
    } catch (err) {
      console.error('Failed to toggle todo', err);
      loadTodos();
    }
  };

  const handleQuickChangeDueDate = async (todoId: string, newDate: string | null) => {
    const cleanDate = newDate && newDate.trim() ? newDate.trim() : null;
    setTodos((prev) =>
      prev.map((t) => (t.id === todoId ? { ...t, dueDate: cleanDate } : t))
    );
    try {
      await api.updateTodo(todoId, { dueDate: cleanDate });
      window.dispatchEvent(new CustomEvent('ports:todos_updated'));
    } catch (err) {
      console.error('Failed to update due date in drawer', err);
      loadTodos();
    }
  };

  const pendingTodos = todos.filter((t) => !t.isCompleted);
  const completedTodos = todos.filter((t) => t.isCompleted);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Container (Sliding from Left in RTL so it enters from edge) */}
      <div className="relative ml-auto w-full max-w-md bg-white shadow-2xl flex flex-col h-full z-10 animate-in slide-in-from-right duration-300">
        
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 pt-[calc(1rem+env(safe-area-inset-top,0px))] bg-gradient-to-r from-[#05261e] to-[#0c3e35] text-white flex items-center justify-between border-b border-[#0c3e35]">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-[#d4af37]/20 border border-[#d4af37]/30 text-[#d4af37]">
              <ListTodo className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-1.5">
                مفكرة المهام السريعة
                {pendingTodos.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-[#d4af37] text-[#05261e] text-[10px] font-black">
                    {pendingTodos.length}
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-[#8daaa2]">تدوين وشطب فوري لمهامك اليومية</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Add Form */}
        <div className="p-3.5 bg-[#f8f9fa] border-b border-[#d2d1c9]">
          <form onSubmit={handleQuickAdd} className="flex items-center gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="اكتب مهمة سريعة ثم Enter..."
              className="flex-1 px-3 py-2 text-xs font-semibold rounded-xl bg-white border border-[#d2d1c9] focus:outline-hidden focus:ring-1 focus:ring-[#0c3e35] text-[#05261e]"
            />
            <button
              type="submit"
              disabled={isSubmitting || !newTitle.trim()}
              className="px-3.5 py-2 rounded-xl bg-[#0c3e35] text-[#d4af37] text-xs font-bold hover:bg-[#05261e] disabled:opacity-50 transition cursor-pointer shrink-0"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </button>
          </form>
        </div>

        {/* Tasks List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {loading ? (
            <div className="py-16 text-center space-y-2">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#0c3e35]" />
              <p className="text-xs text-[#5e736e]">جاري التحميل...</p>
            </div>
          ) : todos.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <div className="size-12 rounded-2xl bg-[#0c3e35]/10 text-[#0c3e35] flex items-center justify-center mx-auto">
                <ListTodo className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-[#05261e]">لا توجد مهام مسجلة حالياً</p>
              <p className="text-[11px] text-[#5e736e]">اكتب مهمتك في الحقل أعلاه لبدء تنظيم يومك.</p>
            </div>
          ) : (
            <>
              {/* Pending Tasks */}
              {pendingTodos.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-black text-[#0c3e35] uppercase tracking-wider block">
                    قيد الانتظار ({pendingTodos.length})
                  </span>
                  {pendingTodos.map((todo) => {
                    const isUrgent = todo.priority === 'URGENT' || todo.priority === 'HIGH';
                    return (
                      <div
                        key={todo.id}
                        className={`p-3 rounded-2xl border transition flex items-start gap-2.5 bg-white ${
                          isUrgent ? 'border-amber-300 shadow-xs' : 'border-[#d2d1c9]/80 hover:border-[#0c3e35]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleToggle(todo)}
                          className="mt-0.5 size-5 rounded-md border border-[#d2d1c9] hover:border-[#0c3e35] flex items-center justify-center text-transparent hover:text-slate-400 cursor-pointer shrink-0"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-extrabold text-[#05261e] leading-snug break-words">
                            {todo.title}
                          </p>
                          {todo.description && (
                            <p className="text-[11px] text-[#5e736e] mt-0.5 line-clamp-2">
                              {todo.description}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 mt-1.5">
                            {isUrgent && (
                              <span className="px-1.5 py-0.2 rounded-md bg-red-50 text-red-700 text-[9px] font-black border border-red-200">
                                عاجل
                              </span>
                            )}
                            {(todo.dueDate || !todo.isCompleted) && (
                              <CustomDatePicker
                                value={todo.dueDate ? new Date(todo.dueDate).toISOString().split('T')[0] : ''}
                                onChange={(newDate) => handleQuickChangeDueDate(todo.id, newDate)}
                                variant="badge"
                                placeholder="+ موعد"
                                allowClear={true}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Completed Tasks */}
              {completedTodos.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-[#d2d1c9]/60">
                  <span className="text-[11px] font-bold text-[#8daaa2] uppercase tracking-wider block">
                    المنجزة مؤخراً ({completedTodos.length})
                  </span>
                  {completedTodos.slice(0, 8).map((todo) => (
                    <div
                      key={todo.id}
                      className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center gap-2.5 opacity-70"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggle(todo)}
                        className="w-[18px] h-[18px] rounded-md bg-emerald-600 text-white flex items-center justify-center cursor-pointer shrink-0"
                      >
                        <Check className="w-3 h-3 stroke-[3]" />
                      </button>
                      <p className="text-xs font-bold text-slate-500 line-through truncate flex-1">
                        {todo.title}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

        </div>

        {/* Drawer Footer */}
        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] bg-white border-t border-[#d2d1c9] flex items-center justify-between gap-3">
          <button
            onClick={() => {
              onClose();
              onOpenFullView();
            }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-black rounded-xl bg-[#0c3e35] text-[#d4af37] hover:bg-[#05261e] transition shadow-md cursor-pointer"
          >
            <ExternalLink className="w-4 h-4" />
            <span>فتح شاشة الأجندة الكاملة</span>
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
};
