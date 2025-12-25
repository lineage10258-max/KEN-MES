
import React, { useMemo, useState } from 'react';
import { WorkOrder, MachineModel, MachineStatus, ProcessStep, StepState } from '../types';
import { Calendar, MapPin, Brain, Sparkles, RefreshCw, Factory, AlertTriangle, CheckCircle2, BarChart3, AlertOctagon } from 'lucide-react';
import { generateFactoryInsight } from '../services/geminiService';
import { calculateOrderCompletionDate } from '../services/holidayService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface DashboardProps {
  orders: WorkOrder[];
  models: MachineModel[];
}

/**
 * Shared Helper to calculate the real-time dynamic production completion date.
 * Uses standardized order completion date logic.
 */
const getDynamicProjectedDate = (order: WorkOrder, models: MachineModel[]) => {
  const model = models.find(m => m.id === order.modelId);
  if (!model) return new Date(order.estimatedCompletionDate);
  if (order.status === MachineStatus.COMPLETED) return new Date(order.estimatedCompletionDate);
  return calculateOrderCompletionDate(order, model);
};

export const Dashboard: React.FC<DashboardProps> = ({ orders, models }) => {
  const [workshopTab, setWorkshopTab] = useState<'ALL' | 'K1廠' | 'K2廠' | 'K3廠'>('ALL');
  const [realtimeTab, setRealtimeTab] = useState<'ALL' | 'K1廠' | 'K2廠' | 'K3廠'>('ALL');
  const [scheduleMode, setScheduleMode] = useState<'START' | 'COMPLETE'>('START');
  
  const [aiInsight, setAiInsight] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);

  const formatMMDD = (date: Date | string | undefined) => {
    if (!date) return '-';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '-';
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const handleGenerateInsight = async () => {
    setIsAiLoading(true);
    setAiInsight('');
    try {
        const insight = await generateFactoryInsight(orders, models);
        setAiInsight(insight);
    } catch (error) {
        setAiInsight("系统连接错误，无法生成诊断。");
    } finally {
        setIsAiLoading(false);
    }
  };
  
  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const isThisMonth = (dateStr?: string | Date) => {
        if (!dateStr) return false;
        const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    };
    const isThisYear = (dateStr?: string) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        return d.getFullYear() === currentYear;
    };

    const monthlyPlanned = orders.filter(o => isThisMonth(o.businessClosingDate)).length;
    const monthlyActual = orders.filter(o => o.status === MachineStatus.COMPLETED && isThisMonth(o.estimatedCompletionDate)).length;
    const monthlyRate = monthlyPlanned > 0 ? Math.round((monthlyActual / monthlyPlanned) * 100) : 0;

    const yearlyPlanned = orders.filter(o => isThisYear(o.businessClosingDate)).length;
    const yearlyActual = orders.filter(o => o.status === MachineStatus.COMPLETED && isThisMonth(o.estimatedCompletionDate)).length;
    const yearlyRate = yearlyPlanned > 0 ? Math.round((yearlyActual / yearlyPlanned) * 100) : 0;

    const monthlyStarts = orders
        .filter(o => isThisMonth(o.startDate))
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    
    const monthlyCompletes = orders
        .map(o => ({ order: o, dynamicDate: getDynamicProjectedDate(o, models) }))
        .filter(item => isThisMonth(item.dynamicDate))
        .sort((a, b) => a.dynamicDate.getTime() - b.dynamicDate.getTime())
        .map(item => ({ ...item.order, dynamicProjectedDate: item.dynamicDate.toISOString() }));

    return { 
        monthly: { planned: monthlyPlanned, actual: monthlyActual, target: 100, rate: monthlyRate },
        yearly: { planned: yearlyPlanned, actual: yearlyActual, target: 100, rate: yearlyRate },
        monthlyStarts,
        monthlyCompletes
    };
  }, [orders, models]);

  const anomalyChartData = useMemo(() => {
    const today = new Date();
    const resultData: any[] = [];
    const departments = new Set<string>();

    for (let i = 2; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const year = d.getFullYear();
        const month = d.getMonth();
        const label = `${month + 1}月`;
        const monthData: any = { name: label };

        orders.forEach(order => {
            if (order.anomalies) {
                order.anomalies.forEach(anomaly => {
                    const anomalyDate = new Date(anomaly.startTime);
                    if (anomalyDate.getFullYear() === year && anomalyDate.getMonth() === month) {
                        const dept = anomaly.department || '未分类';
                        departments.add(dept);
                        const days = parseFloat(anomaly.durationDays || '0');
                        monthData[dept] = (monthData[dept] || 0) + days;
                    }
                });
            }
        });
        resultData.push(monthData);
    }
    return { data: resultData, activeDepartments: Array.from(departments) };
  }, [orders]);

  const DEPT_COLORS: Record<string, string> = {
      '生产': '#ef4444', '电控': '#eab308', 'KA': '#3b82f6', '采购': '#10b981', '生管': '#8b5cf6',
      '设计': '#f97316', '仓库': '#6366f1', '业务': '#ec4899', '应用': '#14b8a6', '未分类': '#94a3b8'
  };
  const getDeptColor = (dept: string, index: number) => DEPT_COLORS[dept] || ['#06b6d4', '#84cc16', '#d946ef'][index % 3];

  const activeScheduleList = scheduleMode === 'START' ? stats.monthlyStarts : stats.monthlyCompletes;

  const displayedSchedule = activeScheduleList.filter(order => {
      if (workshopTab === 'ALL') return true;
      return order.workshop === workshopTab;
  });

  const getWorkshopCount = (tab: string) => {
      if (tab === 'ALL') return activeScheduleList.length;
      return activeScheduleList.filter(o => o.workshop === tab).length;
  };

  const filteredRealtimeOrders = orders
      .filter(o => (realtimeTab === 'ALL' || o.workshop === realtimeTab) && (o.status === MachineStatus.IN_PROGRESS || o.status === MachineStatus.HALTED))
      .sort((a, b) => {
          const dateA = a.businessClosingDate ? new Date(a.businessClosingDate).getTime() : Number.MAX_SAFE_INTEGER;
          const dateB = b.businessClosingDate ? new Date(b.businessClosingDate).getTime() : Number.MAX_SAFE_INTEGER;
          return dateA - dateB;
      });

  return (
    <div className="space-y-6 w-full">
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="当月计划完工" value={stats.monthly.planned} unit="台" theme="blue" />
            <StatCard title="当月实际完工" value={stats.monthly.actual} unit="台" theme="blue" />
            <StatCard title="月度达成率" value={`${stats.monthly.rate}%`} theme="blue" />
            <StatCard title="月度目标值" value="100%" theme="blue" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="当年累计计划完工" value={stats.yearly.planned} unit="台" theme="orange" />
            <StatCard title="当年累计实际完工" value={stats.yearly.actual} unit="台" theme="orange" />
            <StatCard title="年度达成率" value={`${stats.yearly.rate}%`} theme="orange" />
            <StatCard title="年度目标值" value="100%" theme="orange" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 border-b border-cyber-blue/30 pb-2 gap-4">
                <div className="flex items-center gap-6">
                    <h2 className="text-lg font-display font-bold text-cyber-blue tracking-wider">实时生产动态</h2>
                    <div className="flex bg-cyber-bg/30 rounded p-1 border border-cyber-blue/20">
                        {['ALL', 'K1廠', 'K2廠', 'K3廠'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setRealtimeTab(tab as any)}
                                className={`px-3 py-1 text-xs font-mono transition-all rounded ${
                                    realtimeTab === tab ? 'bg-cyber-blue/20 text-cyber-blue shadow-neon-blue' : 'text-cyber-muted hover:text-white hover:bg-white/5'
                                }`}
                            >
                                {tab === 'ALL' ? '总览' : tab}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {filteredRealtimeOrders.length === 0 ? (
                <div className="p-12 text-center bg-cyber-card/50 border border-dashed border-cyber-muted/30 rounded text-cyber-muted font-mono flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-cyber-muted/10 flex items-center justify-center mb-3">
                        <Factory className="opacity-50" />
                    </div>
                    <p>{realtimeTab === 'ALL' ? '当前无正在进行中的生产任务' : `${realtimeTab} 当前无正在进行中的生产任务`}</p>
                </div>
            ) : (
                filteredRealtimeOrders.map(order => <OrderCard key={order.id} order={order} models={models} formatMMDD={formatMMDD} />)
            )}
            
            <h2 className="text-lg font-display font-bold text-cyber-muted mt-8 border-b border-cyber-muted/30 pb-2">归档日志</h2>
             {orders.filter(o => o.status === MachineStatus.COMPLETED).map(order => (
                <OrderCard key={order.id} order={order} models={models} compact formatMMDD={formatMMDD} />
            ))}
        </div>

        <div className="space-y-6">
          <div className="bg-cyber-card border border-cyber-blue/30 relative overflow-hidden flex flex-col">
             <div className="p-3 border-b border-cyber-blue/20 bg-cyber-bg/50 flex items-center gap-2">
                <BarChart3 size={16} className="text-cyber-orange"/>
                <span className="font-display font-bold text-white text-sm">各部門異常天數 (近3個月)</span>
             </div>
             <div className="p-4 w-full h-[300px] text-xs">
                 {anomalyChartData.activeDepartments.length === 0 ? (
                     <div className="h-full flex flex-col items-center justify-center text-cyber-muted opacity-50">
                         <AlertTriangle size={32} className="mb-2"/>
                         <p>近三月无异常记录</p>
                     </div>
                 ) : (
                     <ResponsiveContainer width="100%" height="100%">
                         <BarChart data={anomalyChartData.data} margin={{ top: 10, right: 10, left: -5, bottom: 0 }}>
                             <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                             <XAxis dataKey="name" stroke="#94a3b8" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                             <YAxis 
                                stroke="#94a3b8" 
                                tick={{fontSize: 10}} 
                                axisLine={false} 
                                tickLine={false} 
                                width={35} 
                                type="number"
                                domain={[0, 180]}
                                ticks={[45, 90, 135, 180]}
                                interval={0}
                             />
                             <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9', fontSize: '12px' }} itemStyle={{ padding: 0 }} cursor={{fill: 'rgba(255,255,255,0.05)'}} formatter={(value: number, name: string) => [`${value.toFixed(1)}天`, `${name}`]} />
                             <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} iconType="circle" />
                             {anomalyChartData.activeDepartments.map((dept, index) => (
                                 <Bar key={dept} dataKey={dept} fill={getDeptColor(dept, index)} radius={[2, 2, 0, 0]} barSize={12} animationDuration={1000} />
                             ))}
                         </BarChart>
                     </ResponsiveContainer>
                 )}
             </div>
          </div>
          
          <div className="bg-cyber-card border border-cyber-blue/30 relative overflow-hidden flex flex-col min-h-[400px]">
             <div className="absolute top-0 left-0 w-2 h-2 border-l border-t border-cyber-blue"></div>
             <div className="absolute top-0 right-0 w-2 h-2 border-r border-t border-cyber-blue"></div>
             <div className="absolute bottom-0 left-0 w-2 h-2 border-l border-b border-cyber-blue"></div>
             <div className="absolute bottom-0 right-0 w-2 h-2 border-r border-b border-cyber-blue"></div>

             <div className="p-3 border-b border-cyber-blue/20 bg-cyber-bg/50 flex justify-between items-center">
                <div className="flex bg-cyber-bg border border-cyber-muted/30 rounded p-0.5 w-full">
                     <button 
                        onClick={() => { setScheduleMode('START'); setWorkshopTab('ALL'); }}
                        className={`flex-1 px-2 py-1.5 text-xs rounded transition-all flex items-center justify-center gap-1 ${scheduleMode === 'START' ? 'bg-cyber-blue/20 text-cyber-blue font-bold shadow-neon-blue' : 'text-cyber-muted hover:text-white'}`}
                     >
                         <Calendar size={12}/> 上线计划
                     </button>
                     <button 
                        onClick={() => { setScheduleMode('COMPLETE'); setWorkshopTab('ALL'); }}
                        className={`flex-1 px-2 py-1.5 text-xs rounded transition-all flex items-center justify-center gap-1 ${scheduleMode === 'COMPLETE' ? 'bg-green-500/20 text-green-400 font-bold shadow-[0_0_10px_rgba(74,222,128,0.3)]' : 'text-cyber-muted hover:text-white'}`}
                     >
                         <CheckCircle2 size={12}/> 完工计划
                     </button>
                </div>
             </div>

             <div className="flex border-b border-cyber-blue/20 bg-cyber-bg/30">
                {['ALL', 'K1廠', 'K2廠', 'K3廠'].map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setWorkshopTab(tab as any)}
                        className={`flex-1 py-2 text-[10px] font-mono transition-colors relative flex items-center justify-center gap-1 ${workshopTab === tab ? 'text-cyber-text bg-white/5' : 'text-cyber-muted hover:text-white hover:bg-white/5'}`}
                    >
                        <span className={`${workshopTab === tab ? (scheduleMode === 'START' ? 'text-cyber-blue' : 'text-green-400') : ''}`}>{tab === 'ALL' ? '总览' : tab}</span>
                        <span className="opacity-60">({getWorkshopCount(tab)}台)</span>
                        {workshopTab === tab && <div className={`absolute bottom-0 left-0 w-full h-0.5 ${scheduleMode === 'START' ? 'bg-cyber-blue shadow-neon-blue' : 'bg-green-500 shadow-[0_0_5px_#22c55e]'}`}></div>}
                    </button>
                ))}
             </div>

             <div className="p-2 overflow-y-auto max-h-[400px] custom-scrollbar flex-1">
                {displayedSchedule.length === 0 ? (
                    <div className="p-6 text-center text-cyber-muted font-mono text-sm flex flex-col items-center justify-center h-full">
                        <Calendar className="mb-2 opacity-30" size={24}/>
                        <span>本月{scheduleMode === 'START' ? '无上线计划' : '无完工计划'}</span>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {displayedSchedule.map((order: any) => {
                             const dateToDisplay = scheduleMode === 'START' ? order.startDate : (order.dynamicProjectedDate || order.estimatedCompletionDate);
                             return (
                                <div key={order.id} className="bg-cyber-bg/40 border border-cyber-muted/20 p-3 hover:border-cyber-blue/50 transition-colors group animate-fade-in">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="font-bold font-mono text-white text-sm group-hover:text-cyber-blue transition-colors">{order.id}</span>
                                        <span className={`text-xs font-mono border px-1 ${scheduleMode === 'START' ? 'text-cyber-orange border-cyber-orange/30 bg-cyber-orange/5' : 'text-green-400 border-green-500/30 bg-green-500/5'}`}>
                                            {formatMMDD(dateToDisplay)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs font-mono text-cyber-muted">
                                        <div className="flex items-center gap-1"><MapPin size={10} />{order.workshop}</div>
                                        <span className="opacity-60">{models.find(m => m.id === order.modelId)?.name.split('-')[0] || 'Unknown'}</span>
                                    </div>
                                </div>
                             )
                        })}
                    </div>
                )}
             </div>
          </div>

          <div className="bg-cyber-card border border-cyber-blue/30 relative overflow-hidden flex flex-col animate-fade-in">
             <div className="p-4 border-b border-cyber-blue/20 bg-gradient-to-r from-cyber-blue/10 to-transparent flex justify-between items-center">
                <h3 className="font-display font-bold text-white flex items-center gap-2">
                    <Brain size={18} className="text-cyber-blue animate-pulse"/> AI 智能诊断
                </h3>
                <button onClick={handleGenerateInsight} disabled={isAiLoading} className="p-1.5 rounded bg-cyber-blue/10 border border-cyber-blue/50 text-cyber-blue hover:bg-cyber-blue hover:text-black transition-all disabled:opacity-50">
                    <RefreshCw size={14} className={isAiLoading ? "animate-spin" : ""} />
                </button>
             </div>
             <div className="p-4 min-h-[150px] font-mono text-sm">
                 {isAiLoading ? (
                     <div className="flex flex-col items-center justify-center h-full text-cyber-blue py-8">
                         <Sparkles className="animate-spin mb-2" size={24} />
                         <span className="animate-pulse">正在 analysis 全厂数据...</span>
                     </div>
                 ) : aiInsight ? (
                     <div className="prose prose-invert prose-sm max-w-none">
                         <div className="whitespace-pre-wrap text-cyber-text/90 leading-relaxed border-l-2 border-cyber-blue pl-3">{aiInsight}</div>
                         <p className="text-[10px] text-cyber-muted mt-3 text-right">* 基于实时生产数据库生成</p>
                     </div>
                 ) : (
                     <div className="flex flex-col items-center justify-center text-cyber-muted py-6 text-center">
                         <Brain size={32} className="mb-2 opacity-50" />
                         <p>点击上方刷新按钮</p>
                     </div>
                 )}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface StatCardProps { title: string; value: number | string; unit?: string; theme: 'blue' | 'orange'; }
const StatCard: React.FC<StatCardProps> = ({ title, value, unit, theme }) => {
    const borderColor = theme === 'blue' ? 'border-cyber-blue' : 'border-cyber-orange';
    const textColor = theme === 'blue' ? 'text-cyber-blue' : 'text-cyber-orange';
    return (
        <div className={`bg-cyber-card/90 border-[0.5px] ${borderColor} h-[54px] flex items-center justify-between px-4 py-1.5 shadow-lg relative overflow-hidden transition-all hover:scale-[1.02] group`}>
            <div className={`absolute inset-0 bg-gradient-to-r ${theme === 'blue' ? 'from-cyber-blue/10' : 'from-cyber-orange/10'} to-transparent opacity-0 group-hover:opacity-100 transition-opacity`}></div>
            <span className={`text-sm font-display font-bold tracking-wide ${textColor} drop-shadow-md`}>{title}</span>
            <div className="flex items-baseline gap-1 relative z-10">
                <span className="text-3xl font-mono font-normal text-white drop-shadow-md">{value}</span>
                {unit && <span className="text-[10px] text-white font-mono opacity-80">{unit}</span>}
            </div>
        </div>
    );
};

interface OrderCardProps { order: WorkOrder; models: MachineModel[]; compact?: boolean; formatMMDD: (d: any) => string; }
const OrderCard: React.FC<OrderCardProps> = ({ order, models, compact = false, formatMMDD }) => {
    const model = models.find(m => m.id === order.modelId);
    const totalSteps = model?.steps.length || 0;
    
    const doneCount = useMemo(() => {
        return (Object.values(order.stepStates || {}) as StepState[]).filter(s => s.status === 'COMPLETED' || s.status === 'SKIPPED').length;
    }, [order.stepStates]);

    const progress = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0;
    
    const currentStepName = useMemo(() => {
        if (!model) return '工艺配置缺失';
        if (order.status === 'COMPLETED') return '待出貨';
        const nextStep = model?.steps.find(s => {
            const state = order.stepStates?.[s.id];
            return !state || (state.status !== 'COMPLETED' && state.status !== 'SKIPPED');
        });
        return nextStep?.name || '機台整改';
    }, [order.status, order.stepStates, model]);

    const projectedDate = getDynamicProjectedDate(order, models);
    const closingDate = order.businessClosingDate ? new Date(order.businessClosingDate) : null;
    
    let variance = 0;
    if (closingDate) {
        const p = new Date(projectedDate); p.setHours(0,0,0,0);
        const c = new Date(closingDate); c.setHours(0,0,0,0);
        const diffTime = p.getTime() - c.getTime();
        variance = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    const anomalySummary = useMemo(() => {
        if (!order.anomalies || order.anomalies.length === 0) return null;
        const deptMap: Record<string, number> = {};
        order.anomalies.forEach(a => {
            const dept = a.department || '未分类';
            const days = parseFloat(a.durationDays || '0');
            deptMap[dept] = (deptMap[dept] || 0) + days;
        });
        const sortedEntries = Object.entries(deptMap).sort((a, b) => b[1] - a[1]);
        const formatDays = (d: number) => d % 1 === 0 ? d.toString() : d.toFixed(1);
        const displayStr = sortedEntries
            .map(([dept, days]) => `${dept}${formatDays(days)}`)
            .join('/');
        const tooltipStr = "異常責任明細：\n" + sortedEntries
            .map(([dept, days]) => `• ${dept}: ${formatDays(days)} 天`)
            .join('\n');
        return { displayStr, tooltipStr };
    }, [order.anomalies]);

    if (compact) {
        return (
            <div className="bg-cyber-card/40 border border-cyber-muted/20 p-3 flex justify-between items-center opacity-60 hover:opacity-100 transition-opacity">
                <div>
                     <span className="text-sm font-mono text-cyber-blue">{order.id}</span>
                     <span className="text-xs font-mono text-cyber-muted ml-2">{model?.name || '未知模型'}</span>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono border border-green-500/30 text-green-400 bg-green-500/10 uppercase">完成</span>
            </div>
        )
    }

    return (
        <div className={`bg-cyber-card/60 border px-3 py-1.5 relative overflow-hidden transition-all hover:border-cyber-blue hover:shadow-neon-blue group ${!model ? 'border-red-500/50' : 'border-cyber-blue/30'}`}>
            <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(0,240,255,0.02)_50%,transparent_75%,transparent_100%)] bg-[length:20px_20px]"></div>
            <div className="flex justify-between items-center mb-1 relative z-10">
                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                        {order.clientName && <span className="bg-cyber-blue/20 text-cyber-blue text-[10px] px-1.5 py-0.5 rounded border border-cyber-blue/30 font-mono">{order.clientName.charAt(0)}</span>}
                        <h4 className="text-base font-display font-bold text-white tracking-wide">{order.id}</h4>
                        <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono border ml-1 ${
                            progress === 100 && order.status === 'IN_PROGRESS' 
                            ? 'border-green-400 text-green-400 bg-green-400/20 shadow-[0_0_10px_rgba(74,222,128,0.3)] animate-pulse'
                            : order.status === 'IN_PROGRESS' ? 'border-cyber-blue/50 text-cyber-blue bg-cyber-blue/10' : order.status === 'HALTED' ? 'border-red-500 text-red-500 bg-red-500/10' : 'border-cyber-muted/50 text-cyber-muted bg-white/5'
                        }`}>
                            [{progress === 100 && order.status === 'IN_PROGRESS' ? '待歸檔/完工' : order.status === 'IN_PROGRESS' ? '进行中' : order.status === 'PLANNED' ? '计划中' : order.status === 'HALTED' ? '已暂停' : order.status}]
                        </span>
                    </div>
                    <span className="flex items-baseline gap-1 text-[10px] font-mono text-cyber-muted leading-none">
                        {order.zAxisTravel && <span className="text-cyber-muted/80">(Z{order.zAxisTravel.replace(/mm/gi, '').trim()})</span>}
                        <span className="opacity-70 ml-1">{[order.axisHead, order.toolHolderSpec, order.magazineCount].filter(Boolean).join('/')}</span>
                        {!model && <span className="text-red-500 ml-2 font-bold flex items-center gap-1"><AlertTriangle size={10}/> 找不到工藝配置 ({order.modelId})</span>}
                    </span>
                </div>
                <div className="flex gap-1.5 items-center">
                    <div className={`flex flex-col items-center justify-center min-w-[84px] h-10 px-2 rounded border shadow-sm transition-all cursor-help ${anomalySummary ? 'border-red-500/50 bg-red-500/10' : 'border-cyber-muted/20 bg-cyber-bg/20 opacity-40'}`} title={anomalySummary?.tooltipStr || '目前無異常記錄'}>
                        <span className={`text-[9px] font-bold block leading-none mb-1 ${anomalySummary ? 'text-red-400' : 'text-cyber-muted'}`}>異常(天)</span>
                        <div className={`text-[10px] font-bold leading-none truncate max-w-[150px] ${anomalySummary ? 'text-red-500 animate-pulse' : 'text-cyber-muted'}`}>{anomalySummary ? anomalySummary.displayStr : '0'}</div>
                    </div>
                    <div className={`flex flex-col items-center justify-center w-16 h-10 rounded border shadow-sm ${variance > 0 ? 'border-cyber-orange/40 bg-cyber-orange/10' : 'border-green-500/40 bg-green-500/10'}`}>
                        <span className="text-[10px] text-white font-bold block drop-shadow-md leading-none mb-0.5">差異天數</span>
                        <div className={`flex items-center gap-0.5 text-sm font-bold leading-none ${variance > 0 ? 'text-cyber-orange' : 'text-green-400'}`}>{variance > 0 && <AlertTriangle size={10}/>}{variance > 0 ? `+${variance}` : variance}</div>
                    </div>
                    <div className="flex flex-col items-center justify-center w-16 h-10 rounded border border-cyber-blue/30 bg-cyber-bg/40 shadow-[0_0_5px_rgba(0,240,255,0.05)]">
                        <span className="text-[10px] text-cyan-200/70 font-bold block drop-shadow-md leading-none mb-0.5">生產完工</span>
                        <span className="text-sm font-bold text-cyber-blue leading-none">{formatMMDD(projectedDate)}</span>
                    </div>
                    <div className={`flex flex-col items-center justify-center w-16 h-10 rounded border shadow-[0_0_5px_rgba(0,240,255,0.05)] ${variance > 0 ? 'border-cyber-orange/30 bg-cyber-orange/5' : 'border-cyber-blue/30 bg-cyber-bg/40'}`}>
                        <span className="text-[10px] text-cyan-200/70 font-bold block drop-shadow-md leading-none mb-0.5">业务结关</span>
                        <span className={`text-sm font-bold leading-none ${variance > 0 ? 'text-cyber-orange' : 'text-white'}`}>{closingDate ? formatMMDD(closingDate) : '-'}</span>
                    </div>
                    <div className="flex flex-col items-center justify-center w-16 h-10 rounded border border-cyber-muted/30 bg-cyber-bg/40 shadow-[0_0_5px_rgba(0,240,255,0.05)]">
                        <span className="text-[10px] text-cyan-200/70 font-bold block drop-shadow-md leading-none mb-0.5">計畫上線</span>
                        <span className="text-sm font-bold text-white drop-shadow-md leading-none">{formatMMDD(order.startDate)}</span>
                    </div>
                </div>
            </div>
            <div className="relative z-10">
                <div className="flex mb-0.5 items-center font-mono text-[10px] gap-3">
                     <div className="text-cyber-muted flex items-center gap-1 opacity-90 border border-cyber-muted/30 px-1.5 py-0 rounded bg-cyber-bg/50"><Factory size={10} />{order.workshop}</div>
                    <div className={`font-bold text-xs ${progress === 100 ? 'text-green-400' : progress > 0 ? 'text-cyber-orange' : 'text-cyber-muted'}`}>{progress}%</div>
                     <div className="flex items-center gap-2 overflow-hidden">
                         <span className="text-cyber-blue opacity-80 whitespace-nowrap">已完工 {doneCount}/{totalSteps}</span>
                        <span className={`font-medium truncate ${!model ? 'text-red-500' : 'text-white'}`}>{currentStepName}</span>
                     </div>
                </div>
                <div className="overflow-hidden h-1 text-[10px] flex bg-cyber-bg border border-cyber-blue/20">
                    <div 
                        style={{ width: `${progress}%` }} 
                        className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all duration-500 ${
                            progress === 100 ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 
                            progress > 0 ? 'bg-cyber-blue shadow-[0_0_10px_#00f0ff]' : 
                            'bg-transparent'
                        }`}
                    ></div>
                </div>
            </div>
        </div>
    );
};
