
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
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
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

  // Helper to check permission
  const hasPermission = (view: View) => {
      return currentUser.allowedViews?.includes(view);
  };

  return (
    <div className="h-full w-full flex bg-cyber-bg text-cyber-text font-sans selection:bg-cyber-blue selection:text-black overflow-hidden">
      {/* Sidebar */}
      <aside 
        className={`${isCollapsed ? 'w-20' : 'w-20 md:w-64'} bg-cyber-card border-r border-cyber-blue/20 flex flex-col shadow-2xl z-20 transition-all duration-300 relative h-full`}
      >
        {/* Toggle Button */}
        <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="absolute -right-3 top-9 bg-cyber-card border border-cyber-blue text-cyber-blue rounded-full p-1 shadow-neon-blue hover:bg-cyber-blue hover:text-black transition-colors z-50 hidden md:flex"
            title={isCollapsed ? "展开菜单" : "收起菜单"}
        >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div className={`h-24 flex items-center ${isCollapsed ? 'justify-center' : 'justify-center md:justify-start md:px-6'} border-b border-cyber-blue/20 transition-all duration-300 overflow-hidden flex-shrink-0`}>
          <Cpu className="w-8 h-8 text-cyber-blue animate-pulse flex-shrink-0 shadow-neon-blue rounded-full" />
          
          <div className={`ml-3 transition-opacity duration-300 ${isCollapsed ? 'hidden' : 'hidden md:block'}`}>
            <span className="font-display font-bold text-xl tracking-widest text-white whitespace-nowrap">KEN<span className="text-cyber-blue">.MES</span></span>
            <div className="text-[10px] text-cyber-muted font-mono tracking-wider whitespace-nowrap">KM.26.V1</div>
          </div>
        </div>

        <nav className="flex-1 py-6 space-y-2 overflow-y-auto custom-scrollbar overflow-x-hidden">
          {hasPermission('DASHBOARD') && (
            <NavItem 
                icon={<LayoutDashboard size={20} />} 
                label="运营总览" 
                isActive={currentView === 'DASHBOARD'} 
                onClick={() => onNavigate('DASHBOARD')}
                isCollapsed={isCollapsed}
            />
          )}

          {hasPermission('WORK_SCHEDULE') && (
            <NavItem 
                icon={<CalendarRange size={20} />} 
                label="工作日排程" 
                isActive={currentView === 'WORK_SCHEDULE'} 
                onClick={() => onNavigate('WORK_SCHEDULE')} 
                isCollapsed={isCollapsed}
                badge="看板"
            />
          )}
          
          {hasPermission('WORKSTATION') && (
            <NavItem 
                icon={<Wrench size={20} />} 
                label="工作站" 
                isActive={currentView === 'WORKSTATION'} 
                onClick={() => onNavigate('WORKSTATION')} 
                isCollapsed={isCollapsed}
            />
          )}

          {hasPermission('ANOMALY_LIST') && (
            <NavItem 
                icon={<AlertOctagon size={20} />} 
                label="异常监控" 
                isActive={currentView === 'ANOMALY_LIST'} 
                onClick={() => onNavigate('ANOMALY_LIST')} 
                isCollapsed={isCollapsed}
            />
          )}

          {hasPermission('REPORT_DOWNLOAD') && (
            <NavItem 
                icon={<FileText size={20} />} 
                label="报表中心" 
                isActive={currentView === 'REPORT_DOWNLOAD'} 
                onClick={() => onNavigate('REPORT_DOWNLOAD')} 
                isCollapsed={isCollapsed}
            />
          )}
          
          <div className="my-4 border-t border-cyber-muted/10 mx-4"></div>
          
          {/* Databases - Only show section label if not collapsed and at least one permission exists */}
          {!isCollapsed && (hasPermission('ORDER_DB') || hasPermission('MODEL_DB') || hasPermission('HOLIDAY_DB') || hasPermission('USER_DB')) && (
              <div className="px-6 py-2 text-xs font-mono text-cyber-muted uppercase tracking-wider">
                  数据库管理
              </div>
          )}

          {hasPermission('ORDER_DB') && (
             <NavItem 
              icon={<Server size={20} />} 
              label="机台数据库" 
              isActive={currentView === 'ORDER_DB'} 
              onClick={() => onNavigate('ORDER_DB')} 
              isCollapsed={isCollapsed}
            />
          )}
          
          {hasPermission('MODEL_DB') && (
             <NavItem 
              icon={<Database size={20} />} 
              label="工艺数据库" 
              isActive={currentView === 'MODEL_DB'} 
              onClick={() => onNavigate('MODEL_DB')} 
              isCollapsed={isCollapsed}
            />
          )}
          
          {hasPermission('HOLIDAY_DB') && (
             <NavItem 
              icon={<CalendarClock size={20} />} 
              label="假日数据库" 
              isActive={currentView === 'HOLIDAY_DB'} 
              onClick={() => onNavigate('HOLIDAY_DB')} 
              isCollapsed={isCollapsed}
            />
          )}

          {hasPermission('USER_DB') && (
             <NavItem 
              icon={<UserCog size={20} />} 
              label="用户权限" 
              isActive={currentView === 'USER_DB'} 
              onClick={() => onNavigate('USER_DB')} 
              isCollapsed={isCollapsed}
            />
          )}
        </nav>

        <div className={`p-4 border-t border-cyber-blue/20 text-xs text-cyber-muted transition-all duration-300 overflow-hidden flex-shrink-0 ${isCollapsed ? 'hidden' : 'hidden md:block'} font-mono`}>
          <p className="text-white mb-2 tracking-wider text-sm uppercase whitespace-nowrap">
            大前机床(江苏)有限公司
          </p>
          <p className="text-cyber-orange text-sm tracking-widest mb-2 whitespace-nowrap">
            {formatTime(currentTime)}
          </p>
          <p className="mb-2 whitespace-nowrap">系统状态: <span className="text-green-400">在线</span></p>
          <div className="flex items-center gap-2 mb-2 whitespace-nowrap">
             <span>数据库状态:</span>
             {dbStatus === 'CONNECTING' && <span className="text-yellow-400 animate-pulse">连接中...</span>}
             {dbStatus === 'CONNECTED' && <span className="text-green-400 font-bold">🟢 连接成功</span>}
             {dbStatus === 'ERROR' && <span className="text-red-500 font-bold">🔴 连接失败</span>}
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-cyber-muted/10 whitespace-nowrap">
              <div className={`w-2 h-2 rounded-full ${lastSaveTime ? 'bg-green-500 shadow-[0_0_5px_#22c55e] animate-pulse' : 'bg-cyber-muted'}`}></div>
              <span className="text-[10px] opacity-70">
                  {lastSaveTime ? `已保存: ${lastSaveTime.toLocaleTimeString()}` : '等待数据...'}
              </span>
          </div>
        </div>
        
        {isCollapsed && (
            <div className="py-4 flex flex-col items-center gap-4 border-t border-cyber-blue/20 flex-shrink-0">
                <div title={`系统状态: 在线`} className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_5px_#22c55e]"></div>
                <div title={dbStatus === 'CONNECTED' ? '数据库: 已连接' : '数据库: 异常'} className={`w-2 h-2 rounded-full ${dbStatus === 'CONNECTED' ? 'bg-green-400' : 'bg-red-500'}`}></div>
            </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <div className="absolute inset-0 z-0 opacity-10 pointer-events-none" 
             style={{ backgroundImage: 'linear-gradient(rgba(0, 240, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 240, 255, 0.1) 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
        </div>

        <header className="h-28 bg-transparent flex items-start justify-between px-6 z-10 relative pt-2 pointer-events-none flex-shrink-0">
          <div className="w-1/6 pt-6 pointer-events-auto z-30 min-w-[200px]">
              <h1 className="text-xl font-display font-bold text-white tracking-wide uppercase flex items-center gap-2 drop-shadow-[0_0_5px_rgba(0,0,0,0.8)]">
                {currentView === 'DASHBOARD' && <><Activity className="text-cyber-orange" /> 生产总览</>}
                {currentView === 'WORK_SCHEDULE' && <><CalendarRange className="text-cyber-blue" /> 工作日排程</>}
                {currentView === 'WORKSTATION' && <><Wrench className="text-cyber-blue" /> 生产排程</>}
                {currentView === 'ANOMALY_LIST' && <><AlertOctagon className="text-cyber-orange" /> 异常监控</>}
                {currentView === 'REPORT_DOWNLOAD' && <><FileText className="text-cyber-blue" /> 报表中心</>}
                {currentView === 'ORDER_DB' && <><Server className="text-cyber-blue" /> 机台数据库</>}
                {currentView === 'MODEL_DB' && <><Database className="text-cyber-blue" /> 工艺数据库</>}
                {currentView === 'HOLIDAY_DB' && <><CalendarClock className="text-cyber-blue" /> 假日数据库</>}
                {currentView === 'USER_DB' && <><UserCog className="text-cyber-blue" /> 用户权限管理</>}
              </h1>
          </div>

          <div className="absolute left-0 top-0 w-full h-full pointer-events-none z-20 flex items-start justify-center">
            <div className="flex items-start mt-3.5 filter drop-shadow-[0_0_20px_rgba(0,0,0,0.6)] w-full justify-center max-w-[90%] lg:max-w-[70%] xl:max-w-[60%]">
                <div className="hidden 2xl:flex items-start pt-2 mr-[-5px] pointer-events-auto transform transition-transform hover:scale-105 origin-right">
                    <div className="relative h-12 w-48 bg-gradient-to-r from-blue-900/40 to-slate-900/90"
                         style={{ clipPath: 'polygon(10% 0, 100% 0, 90% 100%, 0% 100%)' }}>
                        <div className="absolute top-0 left-0 w-full h-[2px] bg-cyan-400/30"></div>
                        <div className="absolute bottom-0 left-0 w-full h-[3px] bg-cyan-400/50 shadow-[0_0_10px_#00f0ff]"></div>
                        <div className="flex items-center justify-center h-full w-full pr-4">
                            <span className="font-display font-black text-lg text-cyan-50 tracking-[0.2em] italic drop-shadow-md opacity-90">
                                日日精进
                            </span>
                        </div>
                    </div>
                </div>

                <div className="relative h-20 min-w-[320px] max-w-full pointer-events-auto transform transition-transform hover:scale-105 origin-top z-10 flex-shrink-0">
                    <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-[#0a1529] to-[#050b14]"
                         style={{ clipPath: 'polygon(0 0, 100% 0, 93% 100%, 7% 100%)' }}>
                         <div className="absolute bottom-0 left-0 right-0 h-[4px] bg-cyber-orange shadow-[0_0_15px_#ff8800]"></div>
                         <div className="absolute inset-0 opacity-20 bg-[linear-gradient(rgba(255,136,0,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,136,0,0.1)_1px,transparent_1px)] bg-[length:20px_20px]"></div>
                    </div>
                    <div className="relative z-10 h-full flex items-center justify-center pb-2 px-12 md:px-16">
                        <h1 className="text-2xl md:text-3xl lg:text-5xl font-display font-black tracking-[0.15em] text-white uppercase whitespace-nowrap"
                             style={{ textShadow: '0 0 10px rgba(255,136,0,0.6), 0 0 20px rgba(255,136,0,0.4)' }}>
                           大前机床生产管理看板
                        </h1>
                    </div>
                    <div className="absolute bottom-2 left-[12%] w-1.5 h-1.5 bg-cyber-orange rounded-full animate-pulse shadow-[0_0_5px_#ff8800]"></div>
                    <div className="absolute bottom-2 right-[12%] w-1.5 h-1.5 bg-cyber-orange rounded-full animate-pulse delay-75 shadow-[0_0_5px_#ff8800]"></div>
                </div>

                <div className="hidden 2xl:flex items-start pt-2 ml-[-5px] pointer-events-auto transform transition-transform hover:scale-105 origin-left">
                    <div className="relative h-12 w-48 bg-gradient-to-l from-blue-900/40 to-slate-900/90"
                         style={{ clipPath: 'polygon(0 0, 90% 0, 100% 100%, 10% 100%)' }}>
                        <div className="absolute top-0 left-0 w-full h-[2px] bg-cyan-400/30"></div>
                        <div className="absolute bottom-0 left-0 w-full h-[3px] bg-cyan-400/50 shadow-[0_0_10px_#00f0ff]"></div>
                        <div className="flex items-center justify-center h-full w-full pl-4">
                             <span className="font-display font-black text-lg text-cyan-50 tracking-[0.2em] italic drop-shadow-md opacity-90">
                                成就典范
                            </span>
                        </div>
                    </div>
                </div>
            </div>
          </div>

          <div className="flex items-center space-x-6 justify-end w-1/6 pt-6 pointer-events-auto z-30 min-w-[200px]">
             <div className="hidden sm:flex flex-col items-end font-mono">
                <span className="text-sm font-medium text-cyber-blue">{currentUser.name}</span>
                <span className="text-xs text-cyber-muted uppercase flex items-center gap-1">
                    {currentUser.role === UserRole.ADMIN && <span className="text-red-400">管理</span>}
                    {currentUser.role === UserRole.MANAGER && <span className="text-cyber-orange">生管</span>}
                    {currentUser.role === UserRole.OPERATOR && <span className="text-green-400">生产</span>}
                     | {currentUser.department || 'General'}
                </span>
             </div>
             <button 
                onClick={onLogout}
                className="h-10 w-10 rounded border border-cyber-blue bg-cyber-blueDim flex items-center justify-center text-cyber-blue font-bold shadow-neon-blue relative overflow-hidden group transition-all hover:bg-red-500/20 hover:border-red-500 hover:text-red-500"
                title="注销登录"
             >
                <div className="absolute inset-0 bg-cyber-blue/20 scale-0 group-hover:scale-100 transition-transform rounded-full"></div>
                <span className="relative z-10 group-hover:hidden">{currentUser.name.charAt(0)}</span>
                <LogOut size={16} className="relative z-10 hidden group-hover:block" />
             </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-8 z-10 custom-scrollbar mt-2">
          {children}
        </div>
      </main>
    </div>
  );
};

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  isCollapsed: boolean;
  badge?: string;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, isActive, onClick, isCollapsed, badge }) => {
  return (
    <button
      onClick={onClick}
      title={isCollapsed ? label : ''}
      className={`w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'justify-center md:justify-start px-4 md:px-6'} py-4 transition-all duration-200 border-l-2 group relative ${
        isActive 
          ? 'bg-gradient-to-r from-cyber-blueDim to-transparent text-cyber-blue border-cyber-blue shadow-[inset_10px_0_20px_-10px_rgba(0,240,255,0.3)]' 
          : 'text-cyber-muted border-transparent hover:text-white hover:bg-white/5'
      }`}
    >
      <span className={`flex-shrink-0 ${isActive ? 'animate-pulse' : ''}`}>{icon}</span>
      <span className={`ml-3 font-mono font-medium tracking-wider transition-all duration-300 overflow-hidden whitespace-nowrap ${isCollapsed ? 'w-0 opacity-0 hidden' : 'hidden md:block w-auto opacity-100'}`}>
          {label}
      </span>
      {badge && !isCollapsed && (
          <span className="ml-2 px-1.5 py-0.5 bg-cyber-blue text-black text-[9px] font-bold rounded animate-pulse shadow-neon-blue">
              {badge}
          </span>
      )}
    </button>
  );
};
