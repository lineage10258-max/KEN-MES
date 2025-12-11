


import React, { useState, useEffect } from 'react';
import { AppUser, UserRole, View } from '../types';
import { userService } from '../services/userService';
import { Users, Plus, Edit, Trash2, Shield, Save, X, UserCog, CheckSquare, Square, Loader2 } from 'lucide-react';

export const UserDatabase: React.FC = () => {
    const [users, setUsers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false); // Add saving state
    const [deletingId, setDeletingId] = useState<string | null>(null); // Track which user is being deleted
    
    // Form State
    const [editId, setEditId] = useState<string | null>(null);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [role, setRole] = useState<UserRole>(UserRole.OPERATOR);
    const [department, setDepartment] = useState('');
    const [allowedViews, setAllowedViews] = useState<View[]>([]);

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        setLoading(true);
        try {
            const data = await userService.getAll();
            setUsers(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setIsEditing(false);
        setEditId(null);
        setUsername('');
        setPassword('');
        setName('');
        setRole(UserRole.OPERATOR);
        setDepartment('');
        setAllowedViews(['DASHBOARD', 'WORKSTATION']); // Default
    };

    const handleEdit = (user: AppUser) => {
        setEditId(user.id);
        setUsername(user.username);
        setPassword(user.password || '');
        setName(user.name);
        setRole(user.role);
        setDepartment(user.department || '');
        // Critical: Ensure we load the user's existing permissions
        setAllowedViews(user.allowedViews && user.allowedViews.length > 0 ? user.allowedViews : []);
        
        setIsEditing(true);
    };

    const handleSave = async () => {
        if (!username || !name) {
            alert('请填写用户名和姓名');
            return;
        }

        setIsSaving(true);
        try {
            if (editId) {
                // Update
                const updated = await userService.update({
                    id: editId,
                    username,
                    password,
                    name,
                    role,
                    department,
                    allowedViews: allowedViews
                });
                setUsers(prev => prev.map(u => u.id === editId ? updated : u));
            } else {
                // Create
                const created = await userService.create({
                    id: '', // Service handles ID
                    username,
                    password,
                    name,
                    role,
                    department,
                    allowedViews: allowedViews
                });
                setUsers(prev => [created, ...prev]); // Prepend new user
            }
            resetForm();
        } catch (e: any) {
            console.error("Save failed:", e);
            const msg = e instanceof Error ? e.message : String(e);
            
            // Helpful message for missing schema
            if (msg.includes('allowed_views')) {
                alert(`保存成功(部分): 基本信息已更新，但权限配置失败。\n\n原因: 数据库缺少 [allowed_views] 字段。\n请联系管理员执行 SQL 升级脚本。`);
            } else {
                alert(`保存失败: ${msg}`);
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!id) return;
        if (!confirm('确定删除此用户吗？此操作不可恢复。')) return;

        setDeletingId(id); // Start Loading
        try {
            await userService.delete(id);
            setUsers(prev => prev.filter(u => u.id !== id));
        } catch (e: any) {
            console.error("Delete error:", e);
            const msg = e instanceof Error ? e.message : String(e);
            alert(`删除失败: ${msg}`);
        } finally {
            setDeletingId(null); // End Loading
        }
    };

    const togglePermission = (view: View) => {
        setAllowedViews(prev => {
            if (prev.includes(view)) {
                return prev.filter(v => v !== view);
            } else {
                return [...prev, view];
            }
        });
    };

    const getRoleLabel = (r: UserRole) => {
        switch (r) {
            case UserRole.ADMIN: return '管理员 (ADMIN)';
            case UserRole.MANAGER: return '生管 (MANAGER)';
            case UserRole.OPERATOR: return '生产 (OPERATOR)';
            default: return r;
        }
    };

    // Permission Dictionary
    const PERMISSIONS: { id: View; label: string; desc: string }[] = [
        { id: 'DASHBOARD', label: '运营总览', desc: '查看工厂KPI和生产进度' },
        { id: 'WORKSTATION', label: '工作站', desc: '执行工序、查看图纸、报工' },
        { id: 'ANOMALY_LIST', label: '异常监控', desc: '全厂异常清单与筛选' },
        { id: 'REPORT_DOWNLOAD', label: '报表中心', desc: '导出工单、异常及日志报表' },
        { id: 'ORDER_DB', label: '机台数据库', desc: '管理机台订单、排程与投产' },
        { id: 'MODEL_DB', label: '工艺数据库', desc: '管理机型工艺蓝图与工序' },
        { id: 'HOLIDAY_DB', label: '假日数据库', desc: '设置工厂行事历与假日' },
        { id: 'USER_DB', label: '用户权限管理', desc: '添加用户与配置权限' },
    ];

    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
             {/* Header */}
            <div className="flex items-center gap-4 border-b border-cyber-blue/30 pb-6">
                <div className="p-4 bg-cyber-blue/10 rounded-full border border-cyber-blue/30 shadow-neon-blue">
                    <UserCog size={32} className="text-cyber-blue" />
                </div>
                <div>
                    <h2 className="text-2xl font-display font-bold text-white">用户权限管理</h2>
                    <p className="text-cyber-muted font-mono text-sm mt-1">配置系统用户、角色及部门归属。</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* User List */}
                <div className="lg:col-span-2 bg-cyber-card border border-cyber-muted/20">
                    <div className="flex justify-between items-center p-4 border-b border-cyber-blue/20 bg-cyber-bg/50">
                        <div className="flex items-center gap-2 text-cyber-blue font-mono text-sm">
                            <Users size={16} /> 
                            <span>用户列表 ({users.length})</span>
                        </div>
                        <button 
                            onClick={() => { resetForm(); setIsEditing(true); }}
                            className="text-xs flex items-center gap-1 bg-cyber-blue/10 hover:bg-cyber-blue text-cyber-blue hover:text-black px-3 py-1.5 border border-cyber-blue/50 transition-colors"
                        >
                            <Plus size={12} /> 新增用户
                        </button>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full text-left font-mono">
                            <thead>
                                <tr className="border-b border-cyber-muted/20 text-cyber-muted text-xs uppercase tracking-wider bg-cyber-bg/30">
                                    <th className="p-4">姓名 / 账号</th>
                                    <th className="p-4">角色标签</th>
                                    <th className="p-4">部门</th>
                                    <th className="p-4">权限数</th>
                                    <th className="p-4 text-right">操作</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm divide-y divide-cyber-muted/10">
                                {users.map(user => (
                                    <tr key={user.id} className="hover:bg-cyber-blue/5 transition-colors">
                                        <td className="p-4">
                                            <div className="text-white font-bold">{user.name}</div>
                                            <div className="text-xs text-cyber-muted opacity-70">@{user.username}</div>
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-0.5 text-[10px] border rounded ${
                                                user.role === UserRole.ADMIN ? 'border-red-500 text-red-500' :
                                                user.role === UserRole.MANAGER ? 'border-cyber-orange text-cyber-orange' :
                                                'border-green-500 text-green-500'
                                            }`}>
                                                {getRoleLabel(user.role)}
                                            </span>
                                        </td>
                                        <td className="p-4 text-cyber-muted">{user.department || '-'}</td>
                                        <td className="p-4">
                                            <span className="text-cyber-blue font-bold">
                                                {user.allowedViews?.length || 0}
                                            </span>
                                            <span className="text-cyber-muted text-[10px] ml-1">項</span>
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => handleEdit(user)} className="p-1 text-cyber-blue hover:bg-cyber-blue/20 rounded">
                                                    <Edit size={16} />
                                                </button>
                                                <button 
                                                    onClick={() => handleDelete(user.id)} 
                                                    disabled={deletingId === user.id}
                                                    className="p-1 text-cyber-muted hover:text-red-500 hover:bg-red-500/10 rounded disabled:opacity-50 transition-colors"
                                                    title="删除用户"
                                                >
                                                    {deletingId === user.id ? <Loader2 size={16} className="animate-spin text-red-500" /> : <Trash2 size={16} />}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Edit/Create Form */}
                <div className={`bg-cyber-card border border-cyber-blue/30 p-6 relative shadow-lg transition-all ${isEditing ? 'opacity-100 translate-x-0' : 'opacity-50 pointer-events-none'}`}>
                     {/* Tech Corners */}
                    <div className="absolute top-0 left-0 w-3 h-3 border-l border-t border-cyber-blue"></div>
                    <div className="absolute top-0 right-0 w-3 h-3 border-r border-t border-cyber-blue"></div>
                    <div className="absolute bottom-0 left-0 w-3 h-3 border-l border-b border-cyber-blue"></div>
                    <div className="absolute bottom-0 right-0 w-3 h-3 border-r border-b border-cyber-blue"></div>

                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            {editId ? <Edit size={18} className="text-cyber-orange"/> : <Plus size={18} className="text-cyber-blue"/>}
                            {editId ? '编辑用户' : '新建用户'}
                        </h3>
                        {isEditing && (
                            <button onClick={resetForm} className="text-cyber-muted hover:text-white">
                                <X size={18} />
                            </button>
                        )}
                    </div>

                    <div className="space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar pr-2">
                        <div>
                            <label className="block text-xs font-mono text-cyber-blue mb-2">用户名 (登录账号)</label>
                            <input 
                                type="text" 
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-mono text-cyber-blue mb-2">密码</label>
                            <input 
                                type="text" 
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-mono text-cyber-blue mb-2">真实姓名</label>
                            <input 
                                type="text" 
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"
                            />
                        </div>
                        
                         <div>
                            <label className="block text-xs font-mono text-cyber-blue mb-2">所属部门</label>
                            <input 
                                type="text" 
                                value={department}
                                onChange={(e) => setDepartment(e.target.value)}
                                className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-mono text-cyber-blue mb-2">角色身份 (仅作标识)</label>
                            <select 
                                value={role}
                                onChange={(e) => setRole(e.target.value as UserRole)}
                                className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"
                            >
                                <option value={UserRole.ADMIN}>管理员 (Admin)</option>
                                <option value={UserRole.MANAGER}>生管 (Manager)</option>
                                <option value={UserRole.OPERATOR}>生产 (Operator)</option>
                            </select>
                        </div>

                        {/* Permission Checkboxes */}
                        <div className="pt-2">
                             <div className="flex justify-between items-end border-b border-cyber-muted/20 pb-1 mb-3">
                                 <label className="text-xs font-mono text-cyber-orange">
                                     功能页面存取权限
                                 </label>
                                 <span className="text-[10px] text-cyber-muted">
                                     已选: {allowedViews.length}
                                 </span>
                             </div>
                             
                             <div className="space-y-2">
                                 {PERMISSIONS.map((perm) => {
                                     const isChecked = allowedViews.includes(perm.id);
                                     return (
                                         <div 
                                            key={perm.id}
                                            onClick={() => togglePermission(perm.id)}
                                            className={`flex items-start gap-3 p-2 border rounded cursor-pointer transition-all hover:scale-[1.02] ${
                                                isChecked 
                                                ? 'bg-cyber-blue/10 border-cyber-blue shadow-[0_0_5px_rgba(0,240,255,0.1)]' 
                                                : 'bg-cyber-bg border-cyber-muted/20 hover:border-cyber-muted'
                                            }`}
                                         >
                                             <div className={`mt-0.5 transition-colors ${isChecked ? 'text-cyber-blue' : 'text-cyber-muted'}`}>
                                                 {isChecked ? <CheckSquare size={16}/> : <Square size={16}/>}
                                             </div>
                                             <div>
                                                 <div className={`text-sm font-bold transition-colors ${isChecked ? 'text-white' : 'text-cyber-muted'}`}>
                                                     {perm.label}
                                                 </div>
                                                 <div className="text-[10px] text-cyber-muted opacity-70">
                                                     {perm.desc}
                                                 </div>
                                             </div>
                                         </div>
                                     );
                                 })}
                             </div>
                        </div>

                        <div className="pt-4 flex gap-3 border-t border-cyber-muted/20 mt-4">
                            <button 
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex-1 bg-cyber-blue hover:bg-white text-black font-bold py-3 px-4 shadow-neon-blue transition-all flex items-center justify-center gap-2 uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                {isSaving ? '保存中...' : '保存用户配置'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};