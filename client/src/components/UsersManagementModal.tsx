'use client';

import React, { useState, useEffect } from 'react';
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

  if (!isOpen) return null;

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
    if (!form.fullName.trim() || !form.username.trim() || !form.email.trim() || !form.password) {
      setFormError('يرجى ملء كافة الحقول الإلزامية');
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#031814]/60 backdrop-blur-xs animate-fadeIn font-sans">
      <div className="relative w-full max-w-6xl max-h-[90vh] flex flex-col bg-[#edece4] border border-[#d2d1c9] rounded-[28px] shadow-2xl overflow-hidden text-right">
        
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
              className="w-full pl-3 pr-10 py-2 rounded-xl bg-[#f4f3ed] border border-[#d2d1c9] text-[#0c3e35] text-xs focus:outline-none focus:border-[#0c3e35] font-medium"
            />
            <Search className="w-4 h-4 text-[#5e736e] absolute right-3.5 top-2.5" />
          </div>

          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white font-bold text-xs shadow-md transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة مدير / مستخدم جديد</span>
          </button>
        </div>

        {/* Users Table */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-16 text-[#0c3e35]">
              <div className="w-8 h-8 border-3 border-[#0c3e35] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              جاري تحميل قائمة المستخدمين...
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-[#d2d1c9] overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs min-w-[700px]">
                  <thead>
                    <tr className="bg-[#edece4] border-b border-[#d2d1c9] text-[#0c3e35] font-bold">
                      <th className="p-3.5 whitespace-nowrap min-w-[180px]">المستخدم / الاسم</th>
                      <th className="p-3.5 whitespace-nowrap min-w-[150px]">المسمى الوظيفي</th>
                      <th className="p-3.5 whitespace-nowrap min-w-[180px]">المديرية المسندة</th>
                      <th className="p-3.5 whitespace-nowrap min-w-[130px]">اسم المستخدم للدخول</th>
                      <th className="p-3.5 whitespace-nowrap min-w-[110px] text-center">الصلاحية</th>
                      <th className="p-3.5 whitespace-nowrap min-w-[120px] text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5e4dc]">
                    {filteredUsers.map((u) => {
                      const isExec = u.role === 'GENERAL_DIRECTOR' || u.role === 'ASSISTANT_DIRECTOR';

                      return (
                        <tr key={u.id} className="hover:bg-[#f4f3ed] transition">
                          <td className="p-3.5 font-bold text-[#0c3e35] whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-[#edece4] border border-[#d2d1c9] flex items-center justify-center text-[#0c3e35] font-bold text-xs shrink-0">
                                {isExec ? <Shield className="w-4 h-4 text-[#d4af37]" /> : <Ship className="w-4 h-4 text-[#0c3e35]" />}
                              </div>
                              <div>
                                <span className="block font-bold">{u.fullName}</span>
                                {u.phone && <span className="block text-[10px] text-[#5e736e] font-medium font-mono">{u.phone}</span>}
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5 text-[#5e736e] font-medium whitespace-nowrap">{u.title}</td>
                          <td className="p-3.5 text-[#0c3e35] font-bold whitespace-nowrap">
                            {u.directorate?.name || (isExec ? 'الإدارة المركزية' : '-')}
                          </td>
                          <td className="p-3.5 text-[#5e736e] font-mono font-medium whitespace-nowrap">
                            <code className="bg-[#f4f3ed] px-2 py-0.5 rounded border border-[#d2d1c9]">{u.username}</code>
                          </td>
                          <td className="p-3.5 whitespace-nowrap text-center">
                            {isExec ? (
                              <span className="inline-block text-[11px] font-bold px-3 py-1 rounded-lg bg-[#05261e] text-[#d4af37] border border-[#d4af37]/30 whitespace-nowrap shadow-xs">
                                إشراف عام
                              </span>
                            ) : (
                              <span className="inline-block text-[11px] font-bold px-3 py-1 rounded-lg bg-[#edece4] text-[#0c3e35] border border-[#d2d1c9] whitespace-nowrap shadow-xs">
                                مدير مديرية
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 whitespace-nowrap text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleOpenReset(u)}
                                className="p-1.5 rounded-lg bg-[#edece4] hover:bg-[#d2d1c9] text-[#0c3e35] transition cursor-pointer"
                                title="تعيين كلمة مرور جديدة"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleOpenEdit(u)}
                                className="p-1.5 rounded-lg bg-[#edece4] hover:bg-[#d2d1c9] text-[#0c3e35] transition cursor-pointer"
                                title="تعديل بيانات المستخدم"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              {u.role !== 'GENERAL_DIRECTOR' && (
                                <button
                                  onClick={() => handleDeleteUser(u)}
                                  className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 transition cursor-pointer"
                                  title="حذف المستخدم"
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
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-[#031814]/70 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-[#edece4] border border-[#d2d1c9] rounded-[28px] shadow-2xl overflow-hidden text-right">
            <div className="p-5 bg-[#05261e] text-white flex items-center justify-between border-b border-[#d2d1c9]">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#d4af37]" />
                إضافة مدير أو مستخدم جديد
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-[#8daaa2] hover:text-white">
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
                  <label className="block text-[#0c3e35] font-bold mb-1">الاسم الكامل:</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: م. كمال نجار"
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
                  className="px-4 py-2 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] hover:bg-[#edece4] font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white font-bold shadow-md transition"
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
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-[#031814]/70 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-[#edece4] border border-[#d2d1c9] rounded-[28px] shadow-2xl overflow-hidden text-right">
            <div className="p-5 bg-[#05261e] text-white flex items-center justify-between border-b border-[#d2d1c9]">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#d4af37]" />
                تعديل بيانات: {selectedUser.fullName}
              </h3>
              <button onClick={() => setShowEditModal(false)} className="text-[#8daaa2] hover:text-white">
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
                  <label className="block text-[#0c3e35] font-bold mb-1">الاسم الكامل:</label>
                  <input
                    type="text"
                    required
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
                  className="px-4 py-2 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] hover:bg-[#edece4] font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white font-bold shadow-md transition"
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
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-[#031814]/70 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#edece4] border border-[#d2d1c9] rounded-[28px] shadow-2xl overflow-hidden text-right">
            <div className="p-5 bg-[#05261e] text-white flex items-center justify-between border-b border-[#d2d1c9]">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#d4af37]" />
                تعيين كلمة مرور جديدة للمدير
              </h3>
              <button onClick={() => setShowResetModal(false)} className="text-[#8daaa2] hover:text-white">
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
                  className="px-4 py-2 rounded-xl bg-white border border-[#d2d1c9] text-[#0c3e35] hover:bg-[#edece4] font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-[#0c3e35] hover:bg-[#072923] text-white font-bold shadow-md transition"
                >
                  {actionLoading ? 'جاري التعيين...' : 'تعيين كلمة المرور فوراً'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
