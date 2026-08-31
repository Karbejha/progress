'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { User, Directorate } from '../types';
import { api } from '../services/api';
import {
  Users,
  Plus,
  Search,
  Edit2,
  KeyRound,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  Shield,
  Ship,
  Phone,
  Mail,
  UserCheck,
} from 'lucide-react';

interface UsersManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UsersManagementModal: React.FC<UsersManagementModalProps> = ({ isOpen, onClose }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [directorates, setDirectorates] = useState<Directorate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [mounted, setMounted] = useState(false);
  
  // Dialog states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Form states
  const [form, setForm] = useState({
    fullName: '',
    title: '',
    username: '',
    email: '',
    password: '',
    phone: '',
    role: 'DIRECTOR',
    directorateId: '',
  });

  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAddModal) setShowAddModal(false);
        else if (showEditModal) setShowEditModal(false);
        else if (showResetModal) setShowResetModal(false);
        else onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, showAddModal, showEditModal, showResetModal, onClose]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [uList, dList] = await Promise.all([
        api.getAllUsers(),
        api.getDirectorates(),
      ]);
      setUsers(uList);
      setDirectorates(dList);
    } catch (err) {
      console.error('Failed to load users and directorates', err);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleOpenAdd = () => {
    setForm({
      fullName: '',
      title: '',
      username: '',
      email: '',
      password: '',
      phone: '',
      role: 'DIRECTOR',
      directorateId: directorates[0]?.id || '',
    });
    setFormError(null);
    setShowAddModal(true);
  };

  const handleOpenEdit = (u: User) => {
    setSelectedUser(u);
    setForm({
      fullName: u.fullName,
      title: u.title,
      username: u.username,
      email: u.email,
      password: '',
      phone: u.phone || '',
      role: u.role,
      directorateId: u.directorateId || '',
    });
    setFormError(null);
    setShowEditModal(true);
  };

  const handleOpenReset = (u: User) => {
    setSelectedUser(u);
    setResetPasswordValue('');
    setFormError(null);
    setShowResetModal(true);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username.trim() || !form.email.trim() || !form.password || !form.title.trim()) {
      setFormError('يرجى ملء المسمى الوظيفي واسم المستخدم والبريد وكلمة المرور');
      return;
    }

    try {
      setActionLoading(true);
      setFormError(null);
      await api.createUser({
        fullName: form.fullName.trim(),
        title: form.title.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        phone: form.phone.trim() || undefined,
        directorateId: form.role === 'DIRECTOR' ? form.directorateId : undefined,
      });
      setShowAddModal(false);
      showToast('تمت إضافة المستخدم / المدير بنجاح!');
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'حدث خطأ أثناء إضافة المستخدم');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    try {
      setActionLoading(true);
      setFormError(null);
      await api.updateUser(selectedUser.id, {
        fullName: form.fullName.trim(),
        title: form.title.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        role: form.role,
        directorateId: form.role === 'DIRECTOR' ? form.directorateId : undefined,
      });
      setShowEditModal(false);
      showToast('تم تحديث بيانات المستخدم بنجاح!');
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'حدث خطأ أثناء تحديث البيانات');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !resetPasswordValue || resetPasswordValue.length < 6) {
      setFormError('كلمة المرور يجب أن تكون 6 خانات أو أكثر');
      return;
    }

    try {
      setActionLoading(true);
      setFormError(null);
      await api.adminResetPassword(selectedUser.id, resetPasswordValue);
      setShowResetModal(false);
      showToast(`تم تعيين كلمة المرور الجديدة للمستخدم (${selectedUser.fullName}) بنجاح!`);
    } catch (err: any) {
      setFormError(err.message || 'حدث خطأ أثناء تعيين كلمة المرور');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async (u: User) => {
    if (!confirm(`هل أنت متأكد من رغبتك في حذف حساب "${u.fullName}"؟`)) {
      return;
    }

    try {
      await api.deleteUser(u.id);
      showToast(`تم حذف حساب ${u.fullName} بنجاح`);
      loadData();
    } catch (err: any) {
      alert(err.message || 'فشل حذف الحساب');
    }
  };

  const filteredUsers = users.filter((u) => {
    return (
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.title.toLowerCase().includes(search.toLowerCase()) ||
      (u.directorate?.name && u.directorate.name.toLowerCase().includes(search.toLowerCase()))
    );
  });

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-[#031814]/80 backdrop-blur-sm animate-fadeIn font-sans"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-6xl max-h-[90vh] flex flex-col bg-[#edece4] border border-[#d2d1c9] rounded-[28px] shadow-2xl overflow-hidden text-right"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Toast */}
        {toastMsg && (
          <div className="absolute top-4 left-4 z-50 flex items-center gap-2 bg-[#0c3e35] text-white px-4 py-2.5 rounded-xl shadow-lg border border-[#d4af37] text-xs font-bold animate-bounce">
            <CheckCircle2 className="w-4 h-4 text-[#d4af37]" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Header */}
        <div className="p-6 border-b border-[#d2d1c9] bg-[#05261e] text-white flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#0c3e35] border border-[#d4af37]/40 flex items-center justify-center text-[#d4af37]">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">إدارة المستخدمين وحسابات المدراء</h2>
              <p className="text-xs text-[#8daaa2] mt-0.5">
                إضافة مدراء جدد، تعديل بياناتهم، وتعيين أو تغيير كلمات المرور مباشرة من قبل المدير العام
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#8daaa2] hover:text-white hover:bg-[#0c3e35] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls */}
        <div className="p-4 border-b border-[#d2d1c9] bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <input
              type="text"
              placeholder="ابحث بالاسم، المديرية، أو اسم المستخدم..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-4 pr-11 py-2.5 rounded-xl bg-[#f4f3ed] border border-[#d2d1c9] text-[#0c3e35] placeholder-[#8daaa2] focus:outline-none focus:border-[#0c3e35] text-xs transition font-medium"
            />
            <Search className="w-4 h-4 text-[#5e736e] absolute right-3.5 top-3" />
          </div>

          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white font-bold text-xs shadow-md transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة مدير أو حساب جديد</span>
          </button>
        </div>

        {/* Table List */}
        <div className="flex-1 overflow-y-auto p-4 max-h-[60vh]">
          {loading ? (
            <div className="text-center py-12 text-[#0c3e35]">
              <div className="w-8 h-8 border-3 border-[#0c3e35] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              جاري تحميل بيانات المستخدمين...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-[#5e736e] text-xs">
              لا توجد حسابات مطابقة لبحثك
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[#d2d1c9] bg-white shadow-xs">
              <table className="w-full text-right text-xs">
                <thead className="bg-[#edece4] text-[#0c3e35] border-b border-[#d2d1c9] font-bold">
                  <tr>
                    <th className="p-3.5">الاسم والصفة</th>
                    <th className="p-3.5">اسم المستخدم</th>
                    <th className="p-3.5">المديرية المسندة</th>
                    <th className="p-3.5">معلومات الاتصال</th>
                    <th className="p-3.5">الدور والصلاحية</th>
                    <th className="p-3.5 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e5e4dc]">
                  {filteredUsers.map((u) => {
                    const isExec = u.role === 'GENERAL_DIRECTOR' || u.role === 'ASSISTANT_DIRECTOR';

                    return (
                      <tr key={u.id} className="hover:bg-[#f4f3ed] transition">
                        <td className="p-3.5 font-bold text-[#0c3e35]">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-[#edece4] text-[#0c3e35] flex items-center justify-center font-bold">
                              {isExec ? <Shield className="w-4 h-4 text-[#d4af37]" /> : <Ship className="w-4 h-4 text-[#0c3e35]" />}
                            </div>
                            <div>
                              <div>
                                {u.fullName?.trim() ? (
                                  <span>{u.fullName}</span>
                                ) : (
                                  <span className="text-[#8daaa2] font-normal italic">غير محدد</span>
                                )}
                              </div>
                              <div className="text-[11px] text-[#5e736e] font-medium">{u.title}</div>
                            </div>
                          </div>
                        </td>

                        <td className="p-3.5 font-mono text-[#0c3e35]">
                          <code className="bg-[#edece4] px-2 py-0.5 rounded text-[11px] font-bold">
                            {u.username}
                          </code>
                        </td>

                        <td className="p-3.5 font-bold text-[#0c3e35]">
                          {u.directorate?.name || <span className="text-slate-400">الإدارة المركزية</span>}
                        </td>

                        <td className="p-3.5 text-[#5e736e]">
                          {u.phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="w-3 h-3 text-[#8daaa2]" />
                              <span>{u.phone}</span>
                            </div>
                          )}
                          {u.email && (
                            <div className="flex items-center gap-1 text-[11px]">
                              <Mail className="w-3 h-3 text-[#8daaa2]" />
                              <span>{u.email}</span>
                            </div>
                          )}
                        </td>

                        <td className="p-3.5">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                              isExec
                                ? 'bg-[#d4af37]/20 text-[#8a7a52] border-[#d4af37]/40'
                                : 'bg-[#0c3e35]/10 text-[#0c3e35] border-[#0c3e35]/20'
                            }`}
                          >
                            {u.role === 'GENERAL_DIRECTOR'
                              ? 'مدير عام'
                              : u.role === 'ASSISTANT_DIRECTOR'
                              ? 'معاون مدير عام'
                              : 'مدير مديرية'}
                          </span>
                        </td>

                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenEdit(u)}
                              className="p-1.5 rounded-lg bg-[#edece4] text-[#0c3e35] hover:bg-[#0c3e35] hover:text-white transition cursor-pointer"
                              title="تعديل البيانات"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleOpenReset(u)}
                              className="p-1.5 rounded-lg bg-[#edece4] text-[#0c3e35] hover:bg-[#d4af37] hover:text-[#031814] transition cursor-pointer"
                              title="تغيير كلمة المرور"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>

                            {!isExec && (
                              <button
                                onClick={() => handleDeleteUser(u)}
                                className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition cursor-pointer"
                                title="حذف الحساب"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#d2d1c9] bg-white flex items-center justify-between text-xs text-[#5e736e]">
          <span>إجمالي المستخدمين المسجلين: <strong className="text-[#0c3e35]">{users.length}</strong> مستخدم</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[#edece4] text-[#0c3e35] hover:bg-[#d2d1c9] font-bold transition cursor-pointer"
          >
            إغلاق
          </button>
        </div>

      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#031814]/80 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="w-full max-w-lg bg-[#edece4] border border-[#d2d1c9] rounded-[28px] shadow-2xl overflow-hidden text-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 bg-[#05261e] text-white flex items-center justify-between border-b border-[#d2d1c9]">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#d4af37]" />
                إضافة مدير أو مستخدم جديد
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-[#8daaa2] hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-3.5 text-xs">
              {formError && (
                <div className="p-2.5 rounded-xl bg-red-50 text-red-800 border border-red-200 font-medium">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#0c3e35] font-bold mb-1">الاسم الكامل للمدير (اختياري):</label>
                  <input
                    type="text"
                    placeholder="أدخل الاسم أو اتركه للتحديد لاحقاً"
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] focus:outline-none focus:border-[#0c3e35]"
                  />
                </div>
                <div>
                  <label className="block text-[#0c3e35] font-bold mb-1">المسمى الوظيفي:</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: مدير التفتيش البحري"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] focus:outline-none focus:border-[#0c3e35]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#0c3e35] font-bold mb-1">اسم المستخدم للدخول:</label>
                  <input
                    type="text"
                    required
                    placeholder="dir_inspection"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] focus:outline-none focus:border-[#0c3e35]"
                  />
                </div>
                <div>
                  <label className="block text-[#0c3e35] font-bold mb-1">البريد الإلكتروني:</label>
                  <input
                    type="email"
                    required
                    placeholder="inspection@ports.gov.sy"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] focus:outline-none focus:border-[#0c3e35]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#0c3e35] font-bold mb-1">كلمة المرور الابتدائية:</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] focus:outline-none focus:border-[#0c3e35]"
                  />
                </div>
                <div>
                  <label className="block text-[#0c3e35] font-bold mb-1">رقم الهاتف (اختياري):</label>
                  <input
                    type="text"
                    placeholder="0944000123"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] focus:outline-none focus:border-[#0c3e35]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#0c3e35] font-bold mb-1">نوع الصلاحية:</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] font-bold focus:outline-none focus:border-[#0c3e35]"
                  >
                    <option value="DIRECTOR">مدير مديرية / مكتب</option>
                    <option value="ASSISTANT_DIRECTOR">معاون المدير العام</option>
                    <option value="GENERAL_DIRECTOR">مدير عام</option>
                  </select>
                </div>
                {form.role === 'DIRECTOR' && (
                  <div>
                    <label className="block text-[#0c3e35] font-bold mb-1">المديرية المسندة:</label>
                    <select
                      value={form.directorateId}
                      onChange={(e) => setForm({ ...form, directorateId: e.target.value })}
                      className="w-full p-2.5 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] font-bold focus:outline-none focus:border-[#0c3e35]"
                    >
                      {directorates.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#d2d1c9]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] hover:bg-[#edece4] font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white font-bold shadow-md transition cursor-pointer"
                >
                  {actionLoading ? 'جاري الحفظ...' : 'إضافة المستخدم'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#031814]/80 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowEditModal(false)}
        >
          <div
            className="w-full max-w-lg bg-[#edece4] border border-[#d2d1c9] rounded-[28px] shadow-2xl overflow-hidden text-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 bg-[#05261e] text-white flex items-center justify-between border-b border-[#d2d1c9]">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#d4af37]" />
                تعديل بيانات: {selectedUser.fullName || selectedUser.title}
              </h3>
              <button onClick={() => setShowEditModal(false)} className="text-[#8daaa2] hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="p-6 space-y-3.5 text-xs">
              {formError && (
                <div className="p-2.5 rounded-xl bg-red-50 text-red-800 border border-red-200 font-medium">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#0c3e35] font-bold mb-1">الاسم الكامل للمدير (اختياري):</label>
                  <input
                    type="text"
                    placeholder="أدخل الاسم الكامل للمدير..."
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] focus:outline-none focus:border-[#0c3e35]"
                  />
                </div>
                <div>
                  <label className="block text-[#0c3e35] font-bold mb-1">المسمى الوظيفي:</label>
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] focus:outline-none focus:border-[#0c3e35]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#0c3e35] font-bold mb-1">البريد الإلكتروني:</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] focus:outline-none focus:border-[#0c3e35]"
                  />
                </div>
                <div>
                  <label className="block text-[#0c3e35] font-bold mb-1">رقم الهاتف:</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] focus:outline-none focus:border-[#0c3e35]"
                  />
                </div>
              </div>

              {form.role === 'DIRECTOR' && (
                <div>
                  <label className="block text-[#0c3e35] font-bold mb-1">المديرية المسندة:</label>
                  <select
                    value={form.directorateId}
                    onChange={(e) => setForm({ ...form, directorateId: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] font-bold focus:outline-none focus:border-[#0c3e35]"
                  >
                    {directorates.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#d2d1c9]">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] hover:bg-[#edece4] font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white font-bold shadow-md transition cursor-pointer"
                >
                  {actionLoading ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetModal && selectedUser && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#031814]/80 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowResetModal(false)}
        >
          <div
            className="w-full max-w-md bg-[#edece4] border border-[#d2d1c9] rounded-[28px] shadow-2xl overflow-hidden text-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 bg-[#05261e] text-white flex items-center justify-between border-b border-[#d2d1c9]">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#d4af37]" />
                تعيين كلمة مرور جديدة للمدير
              </h3>
              <button onClick={() => setShowResetModal(false)} className="text-[#8daaa2] hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="p-6 space-y-4 text-xs">
              {formError && (
                <div className="p-2.5 rounded-xl bg-red-50 text-red-800 border border-red-200 font-medium">
                  {formError}
                </div>
              )}

              <div>
                <p className="text-[#5e736e] mb-2 font-medium">
                  أنت تقوم بتعيين كلمة مرور جديدة لحساب: <strong className="text-[#0c3e35]">{selectedUser.fullName}</strong> ({selectedUser.username})
                </p>
                <label className="block text-[#0c3e35] font-bold mb-1.5">كلمة المرور الجديدة (6 خانات على الأقل):</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={resetPasswordValue}
                  onChange={(e) => setResetPasswordValue(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] focus:outline-none focus:border-[#0c3e35]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#d2d1c9]">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="px-4 py-2 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] hover:bg-[#edece4] font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white font-bold shadow-md transition cursor-pointer"
                >
                  {actionLoading ? 'جاري التعيين...' : 'تعيين كلمة المرور فوراً'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>,
    document.body
  );
};
