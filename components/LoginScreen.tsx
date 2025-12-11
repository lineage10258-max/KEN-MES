import React, { useState } from 'react';
import { userService } from '../services/userService';
import { AppUser } from '../types';
import { Cpu, Lock, User, ChevronRight, AlertTriangle } from 'lucide-react';

interface LoginScreenProps {
    onLoginSuccess: (user: AppUser) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        
        try {
            const user = await userService.login(username, password);
            if (user) {
                onLoginSuccess(user);
            } else {
                setError('用户名或密码错误');
            }
        } catch (err: any) {
            console.error("Login screen caught error:", err);
            // Handle different error shapes safely
            const msg = err.message || (typeof err === 'string' ? err : '系统错误，请重试');
            setError(`登录失败: ${msg}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-cyber-bg flex items-center justify-center relative overflow-hidden font-sans">
            {/* Background Effects */}
            <div className="absolute inset-0 z-0 pointer-events-none" 
             style={{ backgroundImage: 'linear-gradient(rgba(0, 240, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 240, 255, 0.05) 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
            </div>
            
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyber-blue/10 rounded-full blur-[100px] animate-pulse"></div>
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyber-orange/10 rounded-full blur-[100px] animate-pulse delay-1000"></div>

            {/* Login Card - Inverted Trapezoid Shape Hint */}
            <div className="relative z-10 w-full max-w-md p-1">
                <div className="bg-cyber-card border border-cyber-blue/30 shadow-neon-blue backdrop-blur-md relative overflow-hidden">
                    {/* Decorative Lines */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyber-blue to-transparent"></div>
                    <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyber-orange to-transparent"></div>
                    
                    <div className="p-8 md:p-10">
                        <div className="flex flex-col items-center mb-10">
                            <div className="w-16 h-16 bg-cyber-bg border border-cyber-blue rounded-full flex items-center justify-center shadow-[0_0_15px_#00f0ff] mb-4 relative group">
                                <div className="absolute inset-0 rounded-full border border-cyber-blue/50 animate-ping opacity-20"></div>
                                <Cpu size={32} className="text-cyber-blue" />
                            </div>
                            <h1 className="text-3xl font-display font-bold text-white tracking-widest uppercase text-center">
                                KEN<span className="text-cyber-blue">.MES</span>
                            </h1>
                            <p className="text-cyber-muted font-mono text-xs tracking-[0.3em] mt-2">v.2.1.0 INTERNAL</p>
                        </div>

                        <form onSubmit={handleLogin} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-xs font-mono text-cyber-blue uppercase tracking-wider flex items-center gap-2">
                                    <User size={12}/> 账号
                                </label>
                                <input 
                                    type="text" 
                                    value={username}
                                    onChange={(e) => { setUsername(e.target.value); setError(''); }}
                                    className="w-full bg-cyber-bg/50 border border-cyber-muted/30 p-3 text-white focus:border-cyber-blue focus:shadow-[0_0_10px_rgba(0,240,255,0.3)] focus:outline-none transition-all font-mono"
                                    placeholder="请输入用户名"
                                />
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-xs font-mono text-cyber-blue uppercase tracking-wider flex items-center gap-2">
                                    <Lock size={12}/> 密码
                                </label>
                                <input 
                                    type="password" 
                                    value={password}
                                    onChange={(e) => { setPassword(e.target.value); setError(''); }}
                                    className="w-full bg-cyber-bg/50 border border-cyber-muted/30 p-3 text-white focus:border-cyber-blue focus:shadow-[0_0_10px_rgba(0,240,255,0.3)] focus:outline-none transition-all font-mono"
                                    placeholder="请输入密码"
                                />
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 text-red-500 text-xs font-mono bg-red-500/10 p-2 border border-red-500/20 break-all">
                                    <AlertTriangle size={14} className="flex-shrink-0" /> 
                                    <span>{error}</span>
                                </div>
                            )}

                            <button 
                                type="submit" 
                                disabled={loading}
                                className="w-full bg-cyber-blue hover:bg-white text-black font-display font-bold py-4 shadow-neon-blue transition-all uppercase tracking-widest flex items-center justify-center gap-2 group mt-4 hover:scale-[1.02]"
                            >
                                {loading ? '验证中...' : '登录系统'}
                                {!loading && <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform"/>}
                            </button>
                        </form>
                        
                        <div className="mt-8 text-center">
                             <p className="text-[10px] text-cyber-muted font-mono">
                                 安全连接至内部生产数据库 <br/> ID: {new Date().getTime().toString(36).toUpperCase()}
                             </p>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Corner Text */}
            <div className="absolute bottom-4 left-4 text-cyber-muted/30 font-mono text-xs">
                SYSTEM STATUS: ONLINE
            </div>
        </div>
    );
};