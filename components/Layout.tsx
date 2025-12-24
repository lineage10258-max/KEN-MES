
import React, { useState, useEffect } from 'react';
import { View, AppUser, UserRole } from '../types';
import { LayoutDashboard, Wrench, Database, Activity, Cpu, Server, CalendarClock, UserCog, LogOut, AlertOctagon, ChevronLeft, ChevronRight, FileText, CalendarRange } from 'lucide-react';

interface LayoutProps {
  currentView: View;
  onNavigate: (view: View) => void;
  children: React.ReactNode;
  lastSync?: Date;
  lastSaveTime?: Date;
  dbStatus?: 'CONNECTING' | 'CONNECTED' | 'ERROR';
  currentUser: AppUser;
  onLogout: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ currentView, onNavigate, children, lastSync, lastSaveTime, dbStatus, currentUser, onLogout }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const h = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');
    return `${y}年${m}月${d}日 ${h}:${min}`;
  };

  const hasPermission = (view: View) => currentUser.allowedViews?.includes(view);

  return (
    <div className="flex h-full w-full bg-cyber-bg text-cyber-text font-sans overflow-hidden">
      {/* Sidebar - 固定高度填滿父容器 */}
      <aside 
        className={`${isCollapsed ? 'w-20' : 'w-20 md:w-64'} bg-cyber-card border-r border-cyber-blue/20 flex flex-col shadow-2xl z-20 transition-all duration-300 relative shrink-0 h-full`}
      >
        <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="absolute -right-3 top-9 bg-cyber-card border border-cyber-blue text-cyber-blue rounded-full p-1 shadow-neon-blue hover:bg-cyber-blue hover:text-black transition-colors z-50 hidden md:flex"
        >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div className={`h-24 flex items-center ${isCollapsed ? 'justify-center' : 'md:px-6 justify-center md:justify-start'} border-b border-cyber-blue/20 shrink-0`}>
          <Cpu className="w-8 h-8 text-cyber-blue animate-pulse shrink-0 shadow-neon-blue rounded-full" />
          <div className={`ml-3 transition-opacity duration-300 ${isCollapsed ? 'hidden' : 'hidden md:block'}`}>
            <span className="font-display font-bold text-xl tracking-widest text-white">KEN<span className="text-cyber-blue">.MES</span></span>
            <div className="text-[10px] text-cyber-muted font-mono">KM.26.V1</div>
          </div>
        </div>

        <nav className="flex-1 py-6 space-y-2 overflow-y-auto custom-scrollbar overflow-x-hidden">
          {hasPermission('DASHBOARD') && (
            <NavItem icon={<LayoutDashboard size={20} />} label="運營總覽" isActive={currentView === 'DASHBOARD'} onClick={() => onNavigate('DASHBOARD')} isCollapsed={isCollapsed} />
          )}
          {hasPermission('WORK_SCHEDULE') && (
            <NavItem icon={<CalendarRange size={20} />} label="工作日排程" isActive={currentView === 'WORK_SCHEDULE'} onClick={() => onNavigate('WORK_SCHEDULE')} isCollapsed={isCollapsed} badge="看板" />
          )}
          {hasPermission('WORKSTATION') && (
            <NavItem icon={<Wrench size={20} />} label="工作站" isActive={currentView === 'WORKSTATION'} onClick={() => onNavigate('WORKSTATION')} isCollapsed={isCollapsed} />
          )}
          {hasPermission('ANOMALY_LIST') && (
            <NavItem icon={<AlertOctagon size={20} />} label="異常監控" isActive={currentView === 'ANOMALY_LIST'} onClick={() => onNavigate('ANOMALY_LIST')} isCollapsed={isCollapsed} />
          )}
          {hasPermission('REPORT_DOWNLOAD') && (
            <NavItem icon={<FileText size={20} />} label="報表中心" isActive={currentView === 'REPORT_DOWNLOAD'} onClick={() => onNavigate('REPORT_DOWNLOAD')} isCollapsed={isCollapsed} />
          )}
          
          <div className="my-4 border-t border-cyber-muted/10 mx-4"></div>
          
          {/* 數據庫管理分類標籤 */}
          {!isCollapsed && (hasPermission('ORDER_DB') || hasPermission('MODEL_DB') || hasPermission('HOLIDAY_DB') || hasPermission('USER_DB')) && (
              <div className="px-6 py-2 text-[10px] font-mono text-cyber-muted uppercase tracking-[0.2em]">數據庫管理</div>
          )}
          
          {hasPermission('ORDER_DB') && (
             <NavItem icon={<Server size={20} />} label="機台數據庫" isActive={currentView === 'ORDER_DB'} onClick={() => onNavigate('ORDER_DB')} isCollapsed={isCollapsed} />
          )}
          {hasPermission('MODEL_DB') && (
             <NavItem icon={<Database size={20} />} label="工藝數據庫" isActive={currentView === 'MODEL_DB'} onClick={() => onNavigate('MODEL_DB')} isCollapsed={isCollapsed} />
          )}
          {hasPermission('HOLIDAY_DB') && (
             <NavItem icon={<CalendarClock size={20} />} label="假日數據庫" isActive={currentView === 'HOLIDAY_DB'} onClick={() => onNavigate('HOLIDAY_DB')} isCollapsed={isCollapsed} />
          )}
          {hasPermission('USER_DB') && (
             <NavItem icon={<UserCog size={20} />} label="用戶權限" isActive={currentView === 'USER_DB'} onClick={() => onNavigate('USER_DB')} isCollapsed={isCollapsed} />
          )}
        </nav>

        <div className={`p-4 border-t border-cyber-blue/20 text-xs text-cyber-muted shrink-0 ${isCollapsed ? 'hidden' : 'hidden md:block'} font-mono`}>
          <p className="text-white mb-2 tracking-wider uppercase text-[10px]">大前機床(江蘇)有限公司</p>
          <p className="text-cyber-orange text-[11px] mb-2">{formatTime(currentTime)}</p>
          <div className="flex items-center gap-2 text-[10px]">
             <span>數據庫:</span>
             {dbStatus === 'CONNECTED' ? <span className="text-green-400 font-bold">🟢 已連接</span> : <span className="text-red-500 font-bold">🔴 異常</span>}
          </div>
        </div>
      </aside>

      {/* 主內容容器 */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-10 pointer-events-none" 
             style={{ backgroundImage: 'linear-gradient(rgba(0, 240, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 240, 255, 0.1) 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
        </div>

        {/* 頁面標題列 */}
        <header className="h-28 shrink-0 flex items-start justify-between px-6 z-10 relative pt-2 pointer-events-none">
          <div className="w-1/6 pt-6 pointer-events-auto z-30 min-w-[200px]">
              <h1 className="text-xl font-display font-bold text-white tracking-wide uppercase flex items-center gap-2 drop-shadow-md">
                {currentView === 'DASHBOARD' && <Activity className="text-cyber-orange" />}
                {currentView === 'WORKSTATION' && <Wrench className="text-cyber-blue" />}
                {currentView === 'ANOMALY_LIST' && <AlertOctagon className="text-cyber-orange" />}
                {currentView === 'HOLIDAY_DB' && <CalendarClock className="text-cyber-blue" />}
                {currentView === 'USER_DB' && <UserCog className="text-cyber-blue" />}
                <span className="truncate">{
                    currentView === 'DASHBOARD' ? '運營總覽' :
                    currentView === 'WORKSTATION' ? '工作站' :
                    currentView === 'ANOMALY_LIST' ? '異常監控' :
                    currentView === 'ORDER_DB' ? '機台數據庫' :
                    currentView === 'MODEL_DB' ? '工藝數據庫' :
                    currentView === 'HOLIDAY_DB' ? '假日數據庫' :
                    currentView === 'USER_DB' ? '用戶權限管理' : currentView
                }</span>
              </h1>
          </div>

          {/* 中央大標題 */}
          <div className="absolute left-0 top-0 w-full h-full pointer-events-none z-20 flex items-start justify-center">
            <div className="relative h-20 min-w-[320px] pointer-events-auto mt-3.5 shrink-0">
                <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-[#0a1529] to-[#050b14]"
                     style={{ clipPath: 'polygon(0 0, 100% 0, 93% 100%, 7% 100%)' }}>
                     <div className="absolute bottom-0 left-0 right-0 h-[4px] bg-cyber-orange shadow-[0_0_15px_#ff8800]"></div>
                </div>
                <div className="relative z-10 h-full flex items-center justify-center px-12 md:px-16">
                    <h1 className="text-2xl md:text-3xl lg:text-5xl font-display font-black tracking-widest text-white uppercase whitespace-nowrap"
                         style={{ textShadow: '0 0 10px rgba(255,136,0,0.6)' }}>
                       大前機床生產管理看板
                    </h1>
                </div>
            </div>
          </div>

          <div className="flex items-center space-x-6 justify-end w-1/6 pt-6 pointer-events-auto z-30 min-w-[200px]">
             <div className="hidden sm:flex flex-col items-end font-mono">
                <span className="text-sm font-medium text-cyber-blue">{currentUser.name}</span>
                <span className="text-[10px] text-cyber-muted uppercase tracking-tighter">{currentUser.department}</span>
             </div>
             <button onClick={onLogout} className="h-10 w-10 rounded border border-cyber-blue bg-cyber-blueDim flex items-center justify-center text-cyber-blue font-bold shadow-neon-blue group transition-all hover:bg-red-500/20 hover:border-red-500 hover:text-red-500">
                <span className="group-hover:hidden">{currentUser.name.charAt(0)}</span>
                <LogOut size={16} className="hidden group-hover:block" />
             </button>
          </div>
        </header>

        {/* 可滾動區域 - 使用 flex-1 與 min-h-0 修復滾動條失效問題 */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8 z-10 custom-scrollbar min-h-0">
          {children}
        </div>
      </main>
    </div>
  );
};

interface NavItemProps { icon: React.ReactNode; label: string; isActive: boolean; onClick: () => void; isCollapsed: boolean; badge?: string; }
const NavItem: React.FC<NavItemProps> = ({ icon, label, isActive, onClick, isCollapsed, badge }) => {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'px-4 md:px-6'} py-4 transition-all duration-200 border-l-2 group relative ${
        isActive 
          ? 'bg-gradient-to-r from-cyber-blueDim to-transparent text-cyber-blue border-cyber-blue shadow-[inset:10px_0_20px_-10px_rgba(0,240,255,0.3)]' 
          : 'text-cyber-muted border-transparent hover:text-white hover:bg-white/5'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className={`ml-3 font-mono font-medium tracking-wider transition-all duration-300 overflow-hidden whitespace-nowrap ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>
          {label}
      </span>
      {badge && !isCollapsed && <span className="ml-2 px-1.5 py-0.5 bg-cyber-blue text-black text-[9px] font-bold rounded animate-pulse shadow-neon-blue">{badge}</span>}
    </button>
  );
};
