'use client';

import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { api } from '../services/api';
import { Shield, Search, X, Check, UserCircle2, ArrowRight } from 'lucide-react';
import { DynamicIcon } from './Icons';

interface QuickUserSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onSelectUser: (user: User) => void;
}

export const QuickUserSwitcher: React.FC<QuickUserSwitcherProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSelectUser,
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'ALL' | 'EXECUTIVE' | 'OPERATIONAL' | 'ADMIN'>('ALL');

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const res = await api.getAllUsers();
      setUsers(res);
    } catch (err) {
      console.error('Failed to load users for switcher', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleSelect = async (u: User) => {
    try {
      setLoading(true);
      const res = await api.login({
        usernameOrEmail: u.username,
        directUserId: u.id,
      });
      onSelectUser(res.user);
      onClose();
    } catch (err) {
      console.error('Login failed', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      u.title.toLowerCase().includes(search.toLowerCase()) ||
      (u.directorate?.name && u.directorate.name.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;

    if (activeTab === 'EXECUTIVE') {
      return u.role === 'GENERAL_DIRECTOR' || u.role === 'ASSISTANT_DIRECTOR';
    }
    if (activeTab === 'OPERATIONAL') {
      return u.directorate?.category === 'OPERATIONAL';
    }
    if (activeTab === 'ADMIN') {
      return (
        u.directorate?.category === 'ADMINISTRATIVE' ||
        u.directorate?.category === 'AUDIT_LEGAL' ||
        u.directorate?.category === 'TECHNICAL' ||
        u.directorate?.category === 'LOGISTICS'
      );
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#031814]/60 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-3xl max-h-[85vh] flex flex-col bg-[#edece4] border border-[#d2d1c9] rounded-[28px] shadow-2xl overflow-hidden text-right">
        
        {/* Header */}
        <div className="p-6 border-b border-[#d2d1c9] bg-[#05261e] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0c3e35] border border-[#d4af37]/40 flex items-center justify-center text-[#d4af37]">
              <UserCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                تبديل المستخدم التجريبي (استعراض الصلاحيات)
              </h2>
              <p className="text-xs text-[#8daaa2] mt-0.5">
                اختر المدير العام للاطلاع الشامل، أو اختر أي مدير مديرية لرؤية شاشته الخاصة فقط.
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

        {/* Search & Tabs */}
        <div className="p-4 border-b border-[#d2d1c9] bg-white space-y-3">
          <div className="relative">
            <input
              type="text"
              placeholder="ابحث بالاسم أو اسم المديرية أو المسمى الوظيفي..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-4 pr-11 py-2.5 rounded-xl bg-[#f4f3ed] border border-[#d2d1c9] text-[#0c3e35] placeholder-[#8daaa2] focus:outline-none focus:border-[#0c3e35] text-xs transition font-medium"
            />
            <Search className="w-4 h-4 text-[#5e736e] absolute right-3.5 top-3" />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1.5 rounded-lg transition font-bold whitespace-nowrap cursor-pointer ${
                activeTab === 'ALL'
                  ? 'bg-[#0c3e35] text-white shadow-xs'
                  : 'bg-[#edece4] text-[#5e736e] hover:bg-[#d2d1c9]'
              }`}
            >
              كافة الحسابات ({users.length})
            </button>
            <button
              onClick={() => setActiveTab('EXECUTIVE')}
              className={`px-3 py-1.5 rounded-lg transition font-bold whitespace-nowrap cursor-pointer ${
                activeTab === 'EXECUTIVE'
                  ? 'bg-[#0c3e35] text-white shadow-xs'
                  : 'bg-[#edece4] text-[#5e736e] hover:bg-[#d2d1c9]'
              }`}
            >
              الإدارة العليا (المدير العام ومعاونه)
            </button>
            <button
              onClick={() => setActiveTab('OPERATIONAL')}
              className={`px-3 py-1.5 rounded-lg transition font-bold whitespace-nowrap cursor-pointer ${
                activeTab === 'OPERATIONAL'
                  ? 'bg-[#0c3e35] text-white shadow-xs'
                  : 'bg-[#edece4] text-[#5e736e] hover:bg-[#d2d1c9]'
              }`}
            >
              المديريات التشغيلية والبحرية
            </button>
            <button
              onClick={() => setActiveTab('ADMIN')}
              className={`px-3 py-1.5 rounded-lg transition font-bold whitespace-nowrap cursor-pointer ${
                activeTab === 'ADMIN'
                  ? 'bg-[#0c3e35] text-white shadow-xs'
                  : 'bg-[#edece4] text-[#5e736e] hover:bg-[#d2d1c9]'
              }`}
            >
              المديريات الإدارية والفنية
            </button>
          </div>
        </div>

        {/* Users List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 max-h-[50vh]">
          {loading ? (
            <div className="text-center py-12 text-[#0c3e35]">
              <div className="w-8 h-8 border-3 border-[#0c3e35] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              جاري تحميل المستخدمين...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-[#5e736e] text-xs">
              لا توجد نتائج مطابقة لبحثك
            </div>
          ) : (
            filteredUsers.map((u) => {
              const isCurrent = currentUser?.id === u.id;
              const isExec = u.role === 'GENERAL_DIRECTOR' || u.role === 'ASSISTANT_DIRECTOR';

              return (
                <div
                  key={u.id}
                  onClick={() => handleSelect(u)}
                  className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                    isCurrent
                      ? 'bg-[#0c3e35] text-white border-[#0c3e35] shadow-md'
                      : isExec
                      ? 'bg-white border-[#d4af37] hover:border-[#0c3e35] shadow-xs'
                      : 'bg-white border-[#d2d1c9] hover:border-[#0c3e35] shadow-xs'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                        isCurrent
                          ? 'bg-white/10 text-[#d4af37]'
                          : isExec
                          ? 'bg-[#05261e] text-[#d4af37]'
                          : 'bg-[#edece4] text-[#0c3e35]'
                      }`}
                    >
                      {isExec ? (
                        <Shield className="w-5 h-5" />
                      ) : (
                        <DynamicIcon name={u.directorate?.icon} className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className={`text-xs font-bold ${isCurrent ? 'text-white' : 'text-[#0c3e35]'}`}>
                          {u.fullName}
                        </h3>
                        {isExec && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#d4af37]/20 border border-[#d4af37]/40 text-[#8a7a52]">
                            إشراف كامل
                          </span>
                        )}
                      </div>
                      <p className={`text-xs mt-0.5 font-medium ${isCurrent ? 'text-[#8daaa2]' : 'text-[#5e736e]'}`}>
                        {u.title}
                      </p>
                      {u.directorate && (
                        <p className={`text-[11px] font-semibold mt-0.5 ${isCurrent ? 'text-[#d4af37]' : 'text-[#0c3e35]'}`}>
                          {u.directorate.name}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isCurrent ? (
                      <span className="flex items-center gap-1 text-xs font-bold text-[#d4af37] px-3 py-1.5 rounded-xl bg-white/10">
                        <Check className="w-3.5 h-3.5" />
                        الحالي
                      </span>
                    ) : (
                      <button className="flex items-center gap-1 text-xs font-bold text-[#0c3e35] px-3.5 py-1.5 rounded-xl bg-[#edece4] hover:bg-[#0c3e35] hover:text-white transition cursor-pointer">
                        <span>دخول</span>
                        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#d2d1c9] bg-white flex items-center justify-between text-xs text-[#5e736e]">
          <span>كلمة المرور الافتراضية للمدراء: <code className="text-[#0c3e35] font-bold bg-[#edece4] px-1.5 py-0.5 rounded">password123</code> وللمدير العام: <code className="text-[#0c3e35] font-bold bg-[#edece4] px-1.5 py-0.5 rounded">admin123</code></span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[#edece4] text-[#0c3e35] hover:bg-[#d2d1c9] font-bold transition cursor-pointer"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
