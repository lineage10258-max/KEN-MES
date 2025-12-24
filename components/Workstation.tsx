import React, { useState, useMemo, useEffect } from 'react';
import { WorkOrder, MachineModel, MachineStatus, ProcessStep, StepStatusEnum, StepState, AnomalyRecord, HolidayRule, HolidayType } from '../types';
import { calculateProjectedDate, isWorkingDay, DEFAULT_HOLIDAY_RULES } from '../services/holidayService';
import { CheckCircle, Play, AlertCircle, Clock, Filter, Layers, Settings, X, Activity, User, Plus, ChevronDown, ChevronUp, AlertTriangle, Save, RotateCcw, Search, Table, Ban, Eye, Lock, Zap, PauseOctagon } from 'lucide-react';

interface WorkstationProps {
  orders: WorkOrder[];
  models: MachineModel[];
  holidayRules?: Record<HolidayType, HolidayRule>; 
  onUpdateStepStatus: (orderId: string, stepId: string, status: StepStatusEnum) => void;
  onStatusChange: (orderId: string, status: MachineStatus) => void;
  onAddAnomaly: (orderId: string, anomaly: AnomalyRecord) => void;
  isReadOnly?: boolean; 
}

export const Workstation: React.FC<WorkstationProps> = ({ orders, models, holidayRules = DEFAULT_HOLIDAY_RULES, onUpdateStepStatus, onStatusChange, onAddAnomaly, isReadOnly = false }) => {
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  
  // Step Interaction State
  const [selectedStep, setSelectedStep] = useState<ProcessStep | null>(null);
  
  // Anomaly Modal State
  const [showAnomalyModal, setShowAnomalyModal] = useState(false);
  const [stepSearchTerm, setStepSearchTerm] = useState(''); 
  const [newAnomaly, setNewAnomaly] = useState<{
      stepName: string;
      reason: string;
      department: string;
      anomalyStatus: 'CONTINUOUS' | 'HALTED';
      startTime: string;
      endTime: string;
      durationDays: string;
  }>({
      stepName: '',
      reason: '',
      department: '',
      anomalyStatus: 'CONTINUOUS',
      startTime: '',
      endTime: '',
      durationDays: '0'
  });
  
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const [isAnomaliesCollapsed, setIsAnomaliesCollapsed] = useState(false);

  // Filter States
  const [workshopTab, setWorkshopTab] = useState<'ALL' | 'K1' | 'K2' | 'K3'>('ALL');
  const [statusTab, setStatusTab] = useState<'ALL' | MachineStatus>(MachineStatus.IN_PROGRESS);

  const formatMMDD = (date: Date | string | undefined) => {
    if (!date) return '-';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '-';
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${m}/${day < 10 ? '0' + day : day}`;
  };

  const filteredOrders = orders.filter(o => {
      const matchWorkshop = workshopTab === 'ALL' || (o.workshop?.startsWith(workshopTab) ?? false);
      const matchStatus = statusTab === 'ALL' || o.status === statusTab;
      return matchWorkshop && matchStatus;
  }).sort((a, b) => {
      const dateA = a.businessClosingDate ? new Date(a.businessClosingDate).getTime() : Number.MAX_SAFE_INTEGER;
      const dateB = b.businessClosingDate ? new Date(b.businessClosingDate).getTime() : Number.MAX_SAFE_INTEGER;
      return dateA - dateB;
  });

  const getStatusCount = (key: 'ALL' | MachineStatus) => {
      return orders.filter(o => {
          const matchWorkshop = workshopTab === 'ALL' || (o.workshop?.startsWith(workshopTab) ?? false);
          const matchStatus = key === 'ALL' || o.status === key;
          return matchWorkshop && matchStatus;
      }).length;
  };

  const selectedOrder = orders.find(o => o.id === selectedOrderId);
  const selectedModel = selectedOrder ? models.find(m => m.id === selectedOrder.modelId) : null;

  const getGroupedSteps = () => {
      if (!selectedModel) return {};
      const groups: Record<string, (ProcessStep & { index: number })[]> = {};
      selectedModel.steps.forEach((step, index) => {
          const pMod = step.parallelModule || '通用工序';
          if (!groups[pMod]) groups[pMod] = [];
          groups[pMod].push({ ...step, index });
      });
      const sortedKeys = Object.keys(groups).sort((a, b) => {
          const diff = groups[a].length - groups[b].length;
          if (diff !== 0) return diff;
          return a.localeCompare(b);
      });
      return sortedKeys.reduce((acc, key) => {
          acc[key] = groups[key];
          return acc;
      }, {} as Record<string, (ProcessStep & { index: number })[]>);
  };

  const groupedSteps = getGroupedSteps();

  const calculateOrderMetrics = (order: WorkOrder) => {
      const model = models.find(m => m.id === order.modelId);
      if (!model) return { variance: 0, projectedDate: new Date(), closingDate: null };

      let remainingHours = 0;
      const getRemainingHoursForStep = (s: ProcessStep) => {
          const status = order.stepStates?.[s.id]?.status;
          const isDone = status === 'COMPLETED' || status === 'SKIPPED';
          return isDone ? 0 : s.estimatedHours;
      };

      if (model.scheduleCalculationModule) {
          const moduleSteps = model.steps.filter(s => s.parallelModule === model.scheduleCalculationModule);
          remainingHours = moduleSteps.reduce((acc, s) => acc + getRemainingHoursForStep(s), 0);
      } else {
          const moduleRemaining: Record<string, number> = {};
          model.steps.forEach(s => {
              const key = s.parallelModule || '通用';
              const h = getRemainingHoursForStep(s);
              moduleRemaining[key] = (moduleRemaining[key] || 0) + h;
          });
          remainingHours = Math.max(0, ...Object.values(moduleRemaining));
      }

      const now = new Date();
      const holidayType = order.holidayType || 'DOUBLE';
      const projected = calculateProjectedDate(now, remainingHours, holidayType);
      const closing = order.businessClosingDate ? new Date(order.businessClosingDate) : null;
      let variance = 0;
      if (closing) {
          const p = new Date(projected); p.setHours(0,0,0,0);
          const c = new Date(closing); c.setHours(0,0,0,0);
          const diff = p.getTime() - c.getTime();
          variance = Math.ceil(diff / (1000 * 60 * 60 * 24));
      }
      return { variance, projectedDate: projected, closingDate: closing };
  };

  const handleStepClick = (step: ProcessStep) => {
      if (!selectedOrder) return;
      setSelectedStep(step);
  };

  const handleCloseModal = () => {
      setSelectedStep(null);
  };

  const handleUpdateCurrentStepStatus = (status: StepStatusEnum) => {
      if (isReadOnly) return;
      if (selectedOrder && selectedStep) {
          onUpdateStepStatus(selectedOrder.id, selectedStep.id, status);
          handleCloseModal();
      }
  };

  const handleStartOrder = (id: string) => {
    if (isReadOnly) return;
    onStatusChange(id, MachineStatus.IN_PROGRESS);
    setSelectedOrderId(id);
  }

  const toggleModule = (modName: string) => {
    setExpandedModules(prev => ({
        ...prev,
        [modName]: !prev[modName]
    }));
  };
  
  const calculateDuration = () => {
      if (newAnomaly.startTime && newAnomaly.endTime) {
          const start = new Date(newAnomaly.startTime);
          const end = new Date(newAnomaly.endTime);
          if (start >= end) {
              setNewAnomaly(prev => ({ ...prev, durationDays: '0' }));
              return;
          }
          const WORK_START_HOUR = 8;
          const WORK_START_MIN = 30;
          const WORK_END_HOUR = 17;
          const WORK_END_MIN = 30;
          const HOURS_PER_DAY = 9; 
          let totalMilliseconds = 0;
          const current = new Date(start);
          current.setHours(0,0,0,0);
          const endDateMidnight = new Date(end);
          endDateMidnight.setHours(0,0,0,0);
          while (current <= endDateMidnight) {
              const shiftStart = new Date(current);
              shiftStart.setHours(WORK_START_HOUR, WORK_START_MIN, 0, 0);
              const shiftEnd = new Date(current);
              shiftEnd.setHours(WORK_END_HOUR, WORK_END_MIN, 0, 0);
              const overlapStart = start > shiftStart ? start : shiftStart;
              const overlapEnd = end < shiftEnd ? end : shiftEnd;
              if (overlapStart < overlapEnd) {
                  totalMilliseconds += overlapEnd.getTime() - overlapStart.getTime();
              }
              current.setDate(current.getDate() + 1);
          }
          const totalHours = totalMilliseconds / (1000 * 60 * 60);
          const totalDays = totalHours / HOURS_PER_DAY;
          const formattedDays = parseFloat(totalDays.toFixed(1)).toString();
          setNewAnomaly(prev => ({ ...prev, durationDays: formattedDays }));
      } else {
          setNewAnomaly(prev => ({ ...prev, durationDays: '0' }));
      }
  };

  useEffect(() => {
      calculateDuration();
  }, [newAnomaly.startTime, newAnomaly.endTime]);

  const getDefaultTimeStr = (hour: number, minute: number) => {
    const now = new Date();
    now.setHours(hour, minute, 0, 0);
    const pad = (num: number) => num.toString().padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  };

  const handleOpenAnomalyModal = () => {
    if (isReadOnly) return;
    setNewAnomaly({
        stepName: '', reason: '', department: '',
        anomalyStatus: 'CONTINUOUS',
        startTime: getDefaultTimeStr(8, 30),
        endTime: getDefaultTimeStr(17, 30),
        durationDays: '0'
    });
    setStepSearchTerm('');
    setShowAnomalyModal(true);
  };

  const handleSaveAnomaly = () => {
      if (isReadOnly) return;
      if (!selectedOrderId || !newAnomaly.stepName || !newAnomaly.reason || !newAnomaly.startTime) {
          alert("请填写必要信息");
          return;
      }
      const record: AnomalyRecord = {
          id: crypto.randomUUID(), 
          stepName: newAnomaly.stepName,
          reason: newAnomaly.reason,
          department: newAnomaly.department,
          anomalyStatus: newAnomaly.anomalyStatus,
          startTime: new Date(newAnomaly.startTime).toISOString(),
          endTime: newAnomaly.endTime ? new Date(newAnomaly.endTime).toISOString() : '',
          durationDays: newAnomaly.durationDays,
          reportedAt: new Date().toISOString()
      };
      onAddAnomaly(selectedOrderId, record);
      setShowAnomalyModal(false);
  };

  const completedStepsCount = selectedOrder ? Object.values(selectedOrder.stepStates || {}).filter((s: StepState) => s.status === 'COMPLETED' || s.status === 'SKIPPED').length : 0;
  const totalSteps = selectedModel?.steps.length || 1;
  const progressPercentage = Math.round((completedStepsCount / totalSteps) * 100);

  const dateMetrics = useMemo(() => {
    if (!selectedOrder) return null;
    const m = calculateOrderMetrics(selectedOrder);
    return {
        startDate: selectedOrder.startDate ? new Date(selectedOrder.startDate) : null,
        projectedDate: m.projectedDate,
        closingDate: m.closingDate,
        varianceDays: m.variance,
        materialRate: selectedOrder.issuanceRate || '0%' 
    };
  }, [selectedOrder, models]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full relative">
      {selectedStep && selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
              <div className="bg-cyber-card border border-cyber-blue shadow-neon-blue max-w-lg w-full relative">
                  <div className="bg-cyber-blue/10 p-4 border-b border-cyber-blue/30 flex justify-between items-center">
                      <h3 className="text-xl font-bold text-white tracking-wider flex items-center gap-2">
                          <Layers size={20} className="text-cyber-blue"/> 
                          {selectedStep.parallelModule} / <span className="text-cyber-blue">{selectedStep.module}</span>
                      </h3>
                      <button onClick={handleCloseModal} className="text-cyber-muted hover:text-white transition-colors">
                          <X size={24} />
                      </button>
                  </div>
                  <div className="p-6">
                       <h2 className="text-2xl font-bold text-white mb-4">{selectedStep.name}</h2>
                       <div className="grid grid-cols-2 gap-4 mb-6 text-sm text-cyber-muted">
                           <div className="flex items-center gap-2 border border-cyber-muted/20 p-2 bg-cyber-bg/50">
                               <Clock size={16} className="text-cyber-orange"/>
                               预计工时: <span className="text-white">{selectedStep.estimatedHours} H</span>
                           </div>
                           <div className="flex items-center gap-2 border border-cyber-muted/20 p-2 bg-cyber-bg/50">
                               <User size={16} className="text-cyber-blue"/>
                               负责人: <span className="text-white">--</span>
                           </div>
                       </div>
                       <div className="mb-8">
                           <div className="text-xs uppercase tracking-widest text-cyber-muted mb-2">当前状态</div>
                           {(() => {
                               const status = selectedOrder.stepStates?.[selectedStep.id]?.status || 'PENDING';
                               if (status === 'COMPLETED') return <div className="text-green-400 font-bold border border-green-500/30 bg-green-500/10 p-3 text-center flex items-center justify-center gap-2"><CheckCircle/> 已完工</div>
                               if (status === 'SKIPPED') return <div className="text-cyber-orange font-bold border border-cyber-orange/30 bg-cyber-orange/10 p-3 text-center flex items-center justify-center gap-2 opacity-80"><Ban size={18}/> ⛔ 已忽略</div>
                               if (status === 'IN_PROGRESS') return <div className="text-cyber-blue font-bold border border-cyber-blue/30 bg-cyber-blue/10 p-3 text-center flex items-center justify-center gap-2 animate-pulse"><Activity/> 正在进行中...</div>
                               return <div className="text-cyber-muted font-bold border border-cyber-muted/30 bg-cyber-bg/50 p-3 text-center">待开工</div>
                           })()}
                       </div>
                       
                       {!isReadOnly ? (
                        <div className="flex gap-4">
                            {(!selectedOrder.stepStates?.[selectedStep.id] || selectedOrder.stepStates?.[selectedStep.id]?.status === 'PENDING') && (
                                <>
                                    <button onClick={() => handleUpdateCurrentStepStatus('IN_PROGRESS')} className="flex-1 bg-cyber-blue hover:bg-white text-black font-bold py-3 px-4 shadow-neon-blue transition-all flex items-center justify-center gap-2"><Play size={18} fill="currentColor" /> 开始作业</button>
                                    <button onClick={() => handleUpdateCurrentStepStatus('SKIPPED')} className="flex-1 bg-transparent border border-cyber-muted text-cyber-muted hover:text-cyber-muted hover:text-white font-bold py-3 px-4 transition-all flex items-center justify-center gap-2" title="忽略此作业，將剩餘工時設為0以滿足出貨需求"><Ban size={18} /> 忽略作业</button>
                                </>
                            )}
                            {selectedOrder.stepStates?.[selectedStep.id]?.status === 'IN_PROGRESS' && (
                                    <>
                                        <button onClick={() => handleUpdateCurrentStepStatus('PENDING')} className="flex-1 bg-transparent border border-cyber-orange text-cyber-orange hover:bg-cyber-orange hover:text-black font-bold py-3 px-4 shadow-[0_0_10px_rgba(255,136,0,0.3)] transition-all flex items-center justify-center gap-2"><RotateCcw size={18} /> 退回待开工</button>
                                        <button onClick={() => handleUpdateCurrentStepStatus('COMPLETED')} className="flex-1 bg-green-500 hover:bg-green-400 text-black font-bold py-3 px-4 shadow-[0_0_15px_rgba(34,197,94,0.5)] transition-all flex items-center justify-center gap-2"><CheckCircle size={18} /> 确认完工</button>
                                    </>
                            )}
                            {(selectedOrder.stepStates?.[selectedStep.id]?.status === 'COMPLETED' || selectedOrder.stepStates?.[selectedStep.id]?.status === 'SKIPPED') && (
                                    <button onClick={() => handleUpdateCurrentStepStatus('IN_PROGRESS')} className="flex-1 bg-transparent border border-cyber-muted text-cyber-muted hover:text-white hover:border-white py-3 px-4 transition-all">重置为进行中 (返工)</button>
                            )}
                        </div>
                       ) : (
                           <div className="text-center p-4 border border-cyber-muted/20 bg-cyber-bg/50 text-cyber-muted text-xs uppercase tracking-widest flex items-center justify-center gap-2">
                               <Lock size={14} className="text-cyber-orange" /> 唯读看板: 仅供进度查看
                           </div>
                       )}
                  </div>
              </div>
          </div>
      )}
      
      {showAnomalyModal && !isReadOnly && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
              <div className="bg-cyber-card border border-cyber-orange shadow-neon-orange max-w-lg w-full relative">
                  <div className="bg-cyber-orange/10 p-4 border-b border-cyber-orange/30 flex justify-between items-center">
                      <h3 className="text-xl font-bold text-white tracking-wider flex items-center gap-2"><AlertTriangle size={20} className="text-cyber-orange"/> 新增异常反馈</h3>
                      <button onClick={() => setShowAnomalyModal(false)} className="text-cyber-muted hover:text-white transition-colors"><X size={24} /></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div>
                          <label className="block text-xs text-cyber-blue mb-2 uppercase tracking-wider">关联工序名称</label>
                          <div className="relative mb-1 group">
                             <Search className="absolute left-2 top-2.5 text-cyber-muted group-focus-within:text-cyber-orange transition-colors" size={14} />
                             <input type="text" value={stepSearchTerm} onChange={(e) => setStepSearchTerm(e.target.value)} placeholder="搜索工序..." className="w-full bg-cyber-bg border border-cyber-muted/40 pl-8 p-2 text-white focus:border-cyber-orange focus:outline-none text-sm transition-all"/>
                          </div>
                          <select value={newAnomaly.stepName} onChange={(e) => setNewAnomaly({...newAnomaly, stepName: e.target.value})} className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-orange focus:outline-none text-sm">
                              <option value="">-- 请选择工序 --</option>
                              {selectedModel?.steps.filter(s => s.name.toLowerCase().includes(stepSearchTerm.toLowerCase())).map(s => (
                                  <option key={s.id} value={s.name}>{s.name} ({s.parallelModule})</option>
                              ))}
                              <option value="OTHER">其他/整机</option>
                          </select>
                      </div>
                      <div>
                          <label className="block text-xs text-cyber-blue mb-2 uppercase tracking-wider">异常原因描述</label>
                          <textarea value={newAnomaly.reason} onChange={(e) => setNewAnomaly({...newAnomaly, reason: e.target.value})} rows={3} placeholder="请详细描述异常情况..." className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-orange focus:outline-none text-sm"/>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-cyber-blue mb-2 uppercase tracking-wider">责任单位</label>
                            <select value={newAnomaly.department} onChange={(e) => setNewAnomaly({...newAnomaly, department: e.target.value})} className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-orange focus:outline-none text-sm">
                                    <option value="">-- 请选择部门 --</option>
                                    <option value="生产">生产</option><option value="品管">品管</option><option value="电控">电控</option><option value="KA">KA</option><option value="应用">应用</option><option value="采购">采购</option><option value="生管">生管</option><option value="仓库">仓库</option><option value="设计">设计</option><option value="业务">业务</option><option value="其他">其他</option>
                                </select>
                        </div>
                        <div>
                            <label className="block text-xs text-cyber-blue mb-2 uppercase tracking-wider">異常狀態</label>
                            <div className="flex bg-cyber-bg border border-cyber-muted/30 rounded p-1 gap-1">
                                <button 
                                    onClick={() => setNewAnomaly({...newAnomaly, anomalyStatus: 'CONTINUOUS'})}
                                    className={`flex-1 py-1 text-[10px] font-bold rounded flex items-center justify-center gap-1 transition-all ${newAnomaly.anomalyStatus === 'CONTINUOUS' ? 'bg-cyber-blue text-black shadow-neon-blue' : 'text-cyber-muted hover:text-white'}`}
                                >
                                    <Zap size={10} /> 持續生產
                                </button>
                                <button 
                                    onClick={() => setNewAnomaly({...newAnomaly, anomalyStatus: 'HALTED'})}
                                    className={`flex-1 py-1 text-[10px] font-bold rounded flex items-center justify-center gap-1 transition-all ${newAnomaly.anomalyStatus === 'HALTED' ? 'bg-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'text-cyber-muted hover:text-white'}`}
                                >
                                    <PauseOctagon size={10} /> 停工
                                </button>
                            </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div><label className="block text-xs text-cyber-blue mb-2 uppercase tracking-wider">发生时间</label><input type="datetime-local" value={newAnomaly.startTime} onChange={(e) => setNewAnomaly({...newAnomaly, startTime: e.target.value})} className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-orange focus:outline-none text-sm"/></div>
                          <div><label className="block text-xs text-cyber-blue mb-2 uppercase tracking-wider">结束时间</label><input type="datetime-local" value={newAnomaly.endTime} onChange={(e) => setNewAnomaly({...newAnomaly, endTime: e.target.value})} className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-orange focus:outline-none text-sm"/></div>
                      </div>
                      <div className="bg-cyber-bg/50 p-3 border border-cyber-muted/20 flex justify-between items-center">
                          <span className="text-xs text-cyber-muted uppercase">自动计算异常天数 (8:30-17:30)</span>
                          <span className="text-lg font-bold text-cyber-orange">{newAnomaly.durationDays} 天</span>
                      </div>
                      <button onClick={handleSaveAnomaly} className="w-full bg-cyber-orange hover:bg-white text-black font-bold py-3 px-4 shadow-neon-orange transition-all flex items-center justify-center gap-2 mt-4"><Save size={18} /> 提交异常记录</button>
                  </div>
              </div>
          </div>
      )}

      <div className="lg:col-span-1 flex flex-col h-[calc(100vh-140px)]">
        <div className="flex flex-col gap-3 mb-4">
            <div className="flex justify-between items-end border-b border-cyber-blue/30 pb-2">
                <h2 className="font-bold text-cyber-blue text-lg tracking-wide uppercase flex items-center gap-2">
                    {isReadOnly ? <Activity size={18} className="text-green-400" /> : <Settings size={18} />}
                    {isReadOnly ? '生产进度看板' : '選擇機台'}
                </h2>
                <div className="flex gap-1">
                    {['ALL', 'K1', 'K2', 'K3'].map(tab => (
                        <button key={tab} onClick={() => setWorkshopTab(tab as any)} className={`text-[10px] px-2 py-1 transition-colors rounded-t ${workshopTab === tab ? 'bg-cyber-blue text-black font-bold' : 'text-cyber-muted hover:text-white bg-cyber-bg/50'}`}>{tab === 'ALL' ? '总览' : tab}</button>
                    ))}
                </div>
            </div>
            <div className="flex gap-2 bg-cyber-card/50 p-1 rounded border border-cyber-muted/20">
                {[
                    { key: 'ALL', label: '全部' },
                    { key: MachineStatus.IN_PROGRESS, label: '进行中' },
                    { key: MachineStatus.PLANNED, label: '排隊中' },
                    { key: MachineStatus.COMPLETED, label: '已完成' },
                ].map((status) => (
                    <button key={status.key} onClick={() => setStatusTab(status.key as any)} className={`flex-1 text-[10px] py-1.5 text-center transition-all rounded ${statusTab === status.key ? 'bg-cyber-blue/20 text-cyber-blue shadow-neon-blue border border-cyber-blue/30' : 'text-cyber-muted hover:text-white hover:bg-white/5'}`}>{status.label} <span className="opacity-80 font-mono">({getStatusCount(status.key as any)}台)</span></button>
                ))}
            </div>
        </div>
        <div className="bg-cyber-card rounded-none shadow-sm border border-cyber-blue/30 flex-1 relative flex flex-col min-h-0 overflow-hidden">
             <div className="absolute top-0 left-0 w-6 h-6 border-l-2 border-t-2 border-cyber-blue z-20 pointer-events-none"></div>
             <div className="absolute top-0 right-0 w-6 h-6 border-r-2 border-t-2 border-cyber-blue z-20 pointer-events-none"></div>
             <div className="overflow-y-auto custom-scrollbar flex-1">
                {filteredOrders.length === 0 ? (
                    <div className="p-8 text-center flex flex-col items-center justify-center h-full text-cyber-muted opacity-60"><Filter size={32} className="mb-2" /><p className="text-sm">无符合条件的机台</p></div>
                ) : (
                    filteredOrders.map(order => {
                        const { variance, projectedDate, closingDate } = calculateOrderMetrics(order);
                        const modelName = models.find(m => m.id === order.modelId)?.name.split(' ')[0] || '';
                        return (
                            <button key={order.id} onClick={() => setSelectedOrderId(order.id)} className={`w-full text-left p-4 border-b border-cyber-muted/10 hover:bg-cyber-blue/5 transition-all focus:outline-none group relative ${selectedOrderId === order.id ? 'bg-gradient-to-r from-cyber-blue/10 to-transparent border-l-4 border-l-cyber-blue' : 'border-l-4 border-l-transparent'}`}>
                                <div className="flex justify-between items-start">
                                    <div className="flex flex-col items-start gap-1">
                                        <div className="flex items-baseline gap-1"><span className={`font-bold text-sm tracking-wide ${selectedOrderId === order.id ? 'text-white' : 'text-cyber-muted group-hover:text-white'}`}>{order.id}</span></div>
                                        <div className="flex items-center gap-2 text-[10px]"><span className={`font-medium ${selectedOrderId === order.id ? 'text-cyber-blue' : 'text-cyber-muted opacity-80'}`}>{modelName}</span><span className="text-cyber-muted/30">|</span><span className={`${selectedOrderId === order.id ? 'text-white/50' : 'text-cyber-muted/50'}`}>{order.workshop}</span></div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1 ml-auto">
                                        <div className="flex items-center gap-2 justify-end">
                                            <div className="flex gap-1 justify-end">
                                                <div className={`flex flex-col items-center justify-center w-14 h-10 rounded border shadow-sm ${variance > 0 ? 'border-cyber-orange/40 bg-cyber-orange/10' : 'border-green-500/40 bg-green-500/10'}`}><span className="text-[10px] text-white font-bold mb-0.5 block drop-shadow-md">差异</span><div className={`flex items-center gap-0.5 text-xs font-bold leading-none ${variance > 0 ? 'text-cyber-orange' : 'text-green-400'}`}>{variance > 0 && <AlertTriangle size={8}/>}{variance > 0 ? `+${variance}` : variance}</div></div>
                                                <div className="flex flex-col items-center justify-center w-14 h-10 rounded border border-cyber-blue/30 bg-cyber-bg/40 shadow-[0_0_5px_rgba(0,240,255,0.05)]"><span className="text-[10px] text-white font-bold mb-0.5 block drop-shadow-md">完工</span><span className="text-xs font-bold text-cyber-blue leading-none">{formatMMDD(projectedDate)}</span></div>
                                                <div className={`flex flex-col items-center justify-center w-14 h-10 rounded border shadow-[0_0_5px_rgba(0,240,255,0.05)] ${variance > 0 ? 'border-cyber-orange/30 bg-cyber-orange/5' : 'border-cyber-blue/30 bg-cyber-bg/40'}`}><span className="text-[10px] text-white font-bold mb-0.5 block drop-shadow-md">结关</span><span className={`text-xs font-bold leading-none ${variance > 0 ? 'text-cyber-orange' : 'text-cyber-muted'}`}>{closingDate ? formatMMDD(closingDate) : '-'}</span></div>
                                            </div>
                                            <span className={`h-10 flex items-center justify-center px-2 text-[10px] rounded uppercase border flex-shrink-0 ${order.status === MachineStatus.IN_PROGRESS ? 'border-cyber-blue/40 text-cyber-blue' : order.status === MachineStatus.PLANNED ? 'border-cyber-orange/40 text-cyber-orange' : 'border-green-500/40 text-green-500'}`}>{order.status === MachineStatus.IN_PROGRESS ? '进行中' : order.status === MachineStatus.PLANNED ? '排隊中' : '完成'}</span>
                                        </div>
                                    </div>
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </div>
      </div>

      <div className="lg:col-span-3 h-[calc(100vh-140px)]">
        {selectedOrder && selectedModel ? (
            <div className="bg-cyber-card rounded-none shadow-neon-blue border border-cyber-blue/50 h-full flex flex-col relative overflow-hidden animate-fade-in">
                 <div className="absolute right-0 top-0 w-64 h-64 border-r border-t border-cyber-blue/10 opacity-30 rounded-tr-[100px] pointer-events-none"></div>
                <div className="border-b border-cyber-blue/20 p-5 bg-cyber-bg/50 backdrop-blur-sm z-20">
                    <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
                        <div className="min-w-[200px]">
                            <div className="flex items-center gap-3 mb-1">
                                 <h2 className="text-3xl font-bold text-white tracking-widest">{selectedOrder.id}</h2>
                                 <span className="px-2 py-0.5 text-xs bg-cyber-bg border border-cyber-muted text-cyber-muted rounded">{selectedOrder.workshop}</span>
                                 {!isReadOnly && (
                                     <button onClick={handleOpenAnomalyModal} className="ml-2 bg-cyber-orange/10 border border-cyber-orange text-cyber-orange hover:bg-cyber-orange hover:text-black px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded flex items-center gap-1 transition-all shadow-neon-orange"><Plus size={12}/> 新增异常</button>
                                 )}
                            </div>
                            <div className="flex items-center gap-2"><p className="text-cyber-blue text-lg">{selectedModel.name}</p><span className="text-[10px] text-cyber-orange border border-cyber-orange/30 px-1 rounded bg-cyber-orange/5">{selectedOrder.holidayType === 'DOUBLE' ? '双休' : selectedOrder.holidayType === 'SINGLE' ? '单休' : selectedOrder.holidayType === 'ALTERNATE' ? '隔周休' : '无休'}</span></div>
                        </div>
                        {dateMetrics && (
                            <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 w-full xl:w-auto">
                                <div className="bg-cyber-card/80 border border-cyber-blue/30 p-2 rounded flex flex-col items-center justify-center min-w-[90px] shadow-[0_0_10px_rgba(0,240,255,0.1)]"><span className="text-[11px] text-cyan-200/70 uppercase tracking-wider mb-1 font-bold">上线日</span><span className="text-sm font-bold text-white drop-shadow-md">{formatMMDD(dateMetrics.startDate)}</span></div>
                                <div className={`bg-cyber-card/80 border p-2 rounded flex flex-col items-center justify-center min-w-[90px] shadow-sm ${dateMetrics.varianceDays > 0 ? 'border-cyber-orange/40 bg-cyber-orange/5' : 'border-green-500/40 bg-green-500/10'}`}><span className="text-[11px] text-cyan-200/70 uppercase tracking-wider mb-1 font-bold">差异天数</span><div className={`flex items-center gap-1 text-sm font-bold drop-shadow-md ${dateMetrics.varianceDays > 0 ? 'text-cyber-orange' : 'text-green-400'}`}>{dateMetrics.varianceDays > 0 && <AlertTriangle size={12}/>}{dateMetrics.varianceDays > 0 ? `+${dateMetrics.varianceDays}` : dateMetrics.varianceDays}</div></div>
                                <div className="bg-cyber-card/80 border border-cyber-blue/30 p-2 rounded flex flex-col items-center justify-center min-w-[90px] shadow-[0_0_10px_rgba(0,240,255,0.1)]"><span className="text-[11px] text-cyan-200/70 uppercase tracking-wider mb-1 font-bold">生产完工</span><span className="text-sm font-bold text-cyber-blue drop-shadow-md">{formatMMDD(dateMetrics.projectedDate)}</span></div>
                                <div className="bg-cyber-card/80 border border-cyber-blue/30 p-2 rounded flex flex-col items-center justify-center min-w-[90px] shadow-[0_0_10px_rgba(0,240,255,0.1)]"><span className="text-[11px] text-cyan-200/70 uppercase tracking-wider mb-1 font-bold">业务结关</span><span className="text-sm font-bold text-white drop-shadow-md">{formatMMDD(dateMetrics.closingDate)}</span></div>
                                <div className="bg-cyber-card/80 border border-cyber-blue/30 p-2 rounded flex flex-col items-center justify-center min-w-[90px] shadow-[0_0_10px_rgba(0,240,255,0.1)]"><span className="text-[11px] text-cyan-200/70 uppercase tracking-wider mb-1 font-bold">发料率</span><span className="text-sm font-bold text-white drop-shadow-md">{dateMetrics.materialRate}</span></div>
                                <div className="bg-cyber-card/80 border border-cyber-blue/30 p-2 rounded flex flex-col items-center justify-center min-w-[90px] shadow-[0_0_10px_rgba(0,240,255,0.1)]"><span className="text-[11px] text-cyan-200/70 uppercase tracking-wider mb-1 font-bold">生产进度</span><span className={`text-sm font-bold drop-shadow-md ${progressPercentage === 100 ? 'text-green-400' : 'text-cyber-blue'}`}>{progressPercentage}%</span></div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 relative z-10">
                    {selectedOrder.anomalies && selectedOrder.anomalies.length > 0 && (
                        <div className={`relative rounded-lg transition-all duration-300 mb-6 ${isAnomaliesCollapsed ? 'h-px bg-transparent border-0 border-t border-cyber-orange/30 mt-8' : 'p-4 pt-8 border border-cyber-orange/30 bg-cyber-orange/5 shadow-[0_0_15px_rgba(255,136,0,0.1)]'}`}>
                            <div onClick={() => setIsAnomaliesCollapsed(!isAnomaliesCollapsed)} className="absolute -top-3 left-4 bg-cyber-card px-2 py-0.5 text-xs font-bold rounded uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all z-10 select-none shadow-[0_0_10px_rgba(0,0,0,0.5)] text-cyber-orange border border-cyber-orange hover:bg-cyber-orange hover:text-black"><AlertTriangle size={12}/> 异常反馈 ({selectedOrder.anomalies.length})<div className="ml-2 pl-2 border-l border-cyber-orange/30 flex items-center">{isAnomaliesCollapsed ? <ChevronDown size={14}/> : <ChevronUp size={14}/>}</div></div>
                             {!isAnomaliesCollapsed && (
                                 <div className="space-y-2 animate-fade-in">
                                     {selectedOrder.anomalies.map((anomaly) => (
                                         <div key={anomaly.id} className={`bg-cyber-bg border p-3 rounded flex items-center justify-between text-xs hover:border-cyber-orange transition-colors ${anomaly.anomalyStatus === 'HALTED' ? 'border-red-500/50' : 'border-cyber-orange/30'}`}>
                                             <div className="flex items-center gap-3">
                                                 <div className={`p-1.5 rounded-full ${anomaly.anomalyStatus === 'HALTED' ? 'bg-red-500/20 text-red-500 animate-pulse' : 'bg-cyber-blue/20 text-cyber-blue'}`}>
                                                    {anomaly.anomalyStatus === 'HALTED' ? <PauseOctagon size={16} /> : <Zap size={16} />}
                                                 </div>
                                                 <div>
                                                     <div className="font-bold text-white flex items-center gap-2">
                                                         异常反馈: {anomaly.stepName}
                                                         <span className={`text-[9px] px-1 rounded font-mono ${anomaly.anomalyStatus === 'HALTED' ? 'bg-red-500 text-white' : 'bg-cyber-blue/10 text-cyber-blue'}`}>
                                                             {anomaly.anomalyStatus === 'HALTED' ? '停工' : '持續生產'}
                                                         </span>
                                                     </div>
                                                     <div className="text-cyber-muted">原因: {anomaly.reason} | 责任: {anomaly.department}</div>
                                                 </div>
                                             </div>
                                             <div className="text-right">
                                                 <div className="text-cyber-orange font-bold font-mono">{anomaly.durationDays} 天</div>
                                                 <div className="text-cyber-muted opacity-60 text-[10px]">{new Date(anomaly.startTime).toLocaleDateString()}</div>
                                             </div>
                                         </div>
                                     ))}
                                 </div>
                             )}
                        </div>
                    )}

                    {selectedOrder.status === MachineStatus.PLANNED ? (
                         <div className="text-center py-20 flex flex-col items-center justify-center h-full">
                            <div className="w-24 h-24 bg-cyber-orange/10 rounded-full flex items-center justify-center mb-6 border border-cyber-orange/30 shadow-[0_0_30px_rgba(255,136,0,0.2)]"><AlertCircle className="w-12 h-12 text-cyber-orange animate-pulse" /></div>
                            <h3 className="text-xl text-white font-bold mb-2">{isReadOnly ? '尚未投产' : '准备投产'}</h3>
                            {!isReadOnly ? (
                                <button onClick={() => handleStartOrder(selectedOrder.id)} className="mt-6 group bg-cyber-blue hover:bg-white text-black font-bold py-4 px-12 shadow-neon-blue transition-all flex items-center justify-center tracking-wider hover:scale-105"><Play size={20} className="mr-3 group-hover:text-black" /> 启动生产流程</button>
                            ) : (
                                <p className="text-cyber-muted text-sm mt-4 font-mono uppercase tracking-widest border border-cyber-muted/30 px-6 py-2 rounded">Awaiting production start by manager</p>
                            )}
                         </div>
                    ) : (
                        <div className="space-y-8 pb-10">
                            {Object.entries(groupedSteps).map(([parallelMod, steps]) => {
                                const moduleCompleted = steps.filter(s => selectedOrder.stepStates?.[s.id]?.status === 'COMPLETED' || selectedOrder.stepStates?.[s.id]?.status === 'SKIPPED').length;
                                const moduleActive = steps.filter(s => selectedOrder.stepStates?.[s.id]?.status === 'IN_PROGRESS').length;
                                const isExpanded = !!expandedModules[parallelMod]; 
                                const isModuleFullyComplete = steps.length > 0 && moduleCompleted === steps.length;
                                
                                const rule = holidayRules[selectedOrder.holidayType] || DEFAULT_HOLIDAY_RULES['DOUBLE'];
                                
                                // Define dynamic item type for sorting
                                type CalendarItem = 
                                    | { type: 'ANOMALY'; data: AnomalyRecord; sortWeight: 0 }
                                    | { type: 'STEP'; step: ProcessStep; status: StepStatusEnum; partLabel: string; sortWeight: number };

                                const dailyItems: Record<string, CalendarItem[]> = {};

                                // 1. Allocate Steps
                                let dayCursor = selectedOrder.startDate ? new Date(selectedOrder.startDate) : new Date();
                                dayCursor.setHours(0,0,0,0);

                                steps.forEach(step => {
                                    const stepState = selectedOrder.stepStates?.[step.id] || { status: 'PENDING' };
                                    
                                    if (stepState.status === 'COMPLETED' || stepState.status === 'SKIPPED') {
                                        const endTime = new Date(stepState.endTime || stepState.startTime || new Date().toISOString());
                                        const dateKey = new Date(endTime); dateKey.setHours(0,0,0,0);
                                        const key = dateKey.toISOString();
                                        if (!dailyItems[key]) dailyItems[key] = [];
                                        
                                        dailyItems[key].push({
                                            type: 'STEP',
                                            step,
                                            status: stepState.status,
                                            partLabel: '',
                                            sortWeight: stepState.status === 'COMPLETED' ? 1 : 2
                                        });
                                        
                                        if (dateKey >= dayCursor) {
                                            dayCursor = new Date(dateKey);
                                            dayCursor.setDate(dayCursor.getDate() + 1);
                                        }
                                    } else {
                                        let hoursRemaining = step.estimatedHours;
                                        while (hoursRemaining > 0) {
                                            let safety = 0;
                                            while (!isWorkingDay(dayCursor, rule) && safety < 60) {
                                                dayCursor.setDate(dayCursor.getDate() + 1);
                                                safety++;
                                            }
                                            const alloc = Math.min(hoursRemaining, 8);
                                            const key = dayCursor.toISOString();
                                            if (!dailyItems[key]) dailyItems[key] = [];
                                            
                                            dailyItems[key].push({
                                                type: 'STEP',
                                                step,
                                                status: stepState.status,
                                                partLabel: step.estimatedHours > 8 ? `(${alloc}H)` : '',
                                                sortWeight: stepState.status === 'IN_PROGRESS' ? 3 : 4
                                            });

                                            hoursRemaining -= alloc;
                                            dayCursor.setDate(dayCursor.getDate() + 1);
                                        }
                                    }
                                });

                                // 2. Allocate Anomalies (INTEGRATED FOR RANGE OF DAYS)
                                if (selectedOrder.anomalies) {
                                    selectedOrder.anomalies.forEach(anomaly => {
                                        // Only show anomalies associated with this module's steps OR general ones in the first module
                                        const isLinkedToThisModule = steps.some(s => s.name === anomaly.stepName);
                                        const isFirstModule = Object.keys(groupedSteps)[0] === parallelMod;
                                        const isGeneral = anomaly.stepName === 'OTHER' || !selectedModel?.steps.some(s => s.name === anomaly.stepName);

                                        if (isLinkedToThisModule || (isFirstModule && isGeneral)) {
                                            const startDate = new Date(anomaly.startTime);
                                            startDate.setHours(0,0,0,0);
                                            
                                            // Determine end range (if end date exists, use it; otherwise use TODAY)
                                            const endDate = anomaly.endTime ? new Date(anomaly.endTime) : new Date();
                                            endDate.setHours(23,59,59,999);
                                            
                                            // Loop through every day in the range
                                            const iterDate = new Date(startDate);
                                            // Max loop safety (90 days)
                                            let safety = 0;
                                            while (iterDate <= endDate && safety < 90) {
                                                const key = iterDate.toISOString();
                                                if (!dailyItems[key]) dailyItems[key] = [];
                                                
                                                // Prevent duplicate markers for same anomaly on same day
                                                if (!dailyItems[key].find(item => item.type === 'ANOMALY' && item.data.id === anomaly.id)) {
                                                    dailyItems[key].push({
                                                        type: 'ANOMALY',
                                                        data: anomaly,
                                                        sortWeight: 0 // HIGHEST PRIORITY
                                                    });
                                                }
                                                
                                                iterDate.setDate(iterDate.getDate() + 1);
                                                safety++;
                                            }
                                        }
                                    });
                                }

                                // 3. Build Weeks for rendering
                                const weeks: Record<string, { date: Date, items: CalendarItem[] }[]> = {};
                                Object.entries(dailyItems).forEach(([key, items]) => {
                                    const date = new Date(key);
                                    items.sort((a, b) => a.sortWeight - b.sortWeight);

                                    const day = date.getDay();
                                    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
                                    const monday = new Date(date.getTime());
                                    monday.setDate(diff);
                                    monday.setHours(0,0,0,0);
                                    const weekKey = monday.toISOString();

                                    if (!weeks[weekKey]) weeks[weekKey] = [];
                                    weeks[weekKey].push({ date, items });
                                });

                                const sortedWeekKeys = Object.keys(weeks).sort((a,b) => new Date(a).getTime() - new Date(b).getTime());

                                return (
                                    <div key={parallelMod} className={`relative rounded-lg transition-all duration-300 mb-6 ${!isExpanded ? 'h-px bg-transparent border-0 border-t border-cyber-muted/20 mt-8' : `p-0 pt-8 border ${isModuleFullyComplete ? 'border-green-500/50 bg-green-500/5 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 'border-cyber-muted/20 bg-cyber-card/30 hover:border-cyber-blue/30'}`}`}>
                                        <div onClick={() => toggleModule(parallelMod)} className={`absolute -top-3 left-4 bg-cyber-card px-2 py-0.5 text-xs font-bold rounded uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all z-10 select-none shadow-[0_0_10px_rgba(0,0,0,0.5)] ${isModuleFullyComplete ? 'text-green-500 border border-green-500 hover:bg-green-500/10' : 'text-cyber-blue border border-cyber-blue/30 hover:bg-cyber-blue/10 hover:border-cyber-blue'}`}><Layers size={12}/> {parallelMod}{isModuleFullyComplete ? <CheckCircle size={12} className="ml-1" strokeWidth={3} /> : moduleActive > 0 && <span className="w-2 h-2 rounded-full bg-cyber-blue animate-pulse shadow-neon-blue"></span>}<div className={`ml-2 pl-2 border-l flex items-center ${isModuleFullyComplete ? 'border-green-500/30' : 'border-cyber-blue/20 opacity-70 group-hover:opacity-100'}`}>{isExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</div></div>
                                        <div className={`absolute -top-3 right-4 text-[10px] bg-cyber-card px-2 py-0.5 border rounded select-none z-10 ${isModuleFullyComplete ? 'text-green-500 border-green-500/50' : 'text-cyber-muted border-cyber-muted/20'}`}>进度: {moduleCompleted}/{steps.length}</div>
                                        {isExpanded && (
                                            <div className="p-4 animate-fade-in">
                                                <div className="space-y-4">
                                                    {sortedWeekKeys.map(weekKey => {
                                                        const weekData = weeks[weekKey];
                                                        const weekDate = new Date(weekKey);
                                                        return (
                                                            <div key={weekKey} className="relative group/week space-y-1">
                                                                <div className="grid grid-cols-7 gap-1 text-center">
                                                                    {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((day, idx) => {
                                                                        const headerDate = new Date(weekDate);
                                                                        headerDate.setDate(headerDate.getDate() + idx);
                                                                        const dateStr = `${headerDate.getMonth() + 1}/${headerDate.getDate().toString().padStart(2, '0')}`;
                                                                        return (
                                                                            <div key={day} className="text-[9px] text-white uppercase tracking-widest font-bold py-0.5 bg-cyber-bg/40 border border-cyber-muted/5 whitespace-nowrap px-1">
                                                                                {day} <span className="ml-1">({dateStr})</span>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                                <div className="grid grid-cols-7 gap-1 min-h-[60px] border-b border-cyber-muted/5 pb-1">
                                                                    {[0, 1, 2, 3, 4, 5, 6].map(dayIndex => {
                                                                        const targetJsDay = (dayIndex + 1) % 7;
                                                                        const dayInfo = weekData.find(d => d.date.getDay() === targetJsDay);
                                                                        return (
                                                                            <div key={dayIndex} className="bg-cyber-bg/20 border border-cyber-muted/5 p-1 relative min-h-[60px]">
                                                                                <div className="flex flex-col gap-1">
                                                                                    {dayInfo?.items.map((item, i) => {
                                                                                        if (item.type === 'ANOMALY') {
                                                                                            return (
                                                                                                <div key={`anomaly-${item.data.id}-${i}`} className={`${item.data.anomalyStatus === 'HALTED' ? 'bg-red-500/20 border-red-500 shadow-[0_0_5px_rgba(239,68,68,0.3)]' : 'bg-red-500/10 border-red-500/30'} border text-red-400 p-1 rounded text-[10px] flex items-center gap-1 truncate font-bold animate-pulse`} title={`异常: ${item.data.reason} (${item.data.department})`}>
                                                                                                    {item.data.anomalyStatus === 'HALTED' ? <PauseOctagon size={10} className="flex-shrink-0" /> : <AlertTriangle size={10} className="flex-shrink-0" />}
                                                                                                    <span className="truncate">{item.data.reason}</span>
                                                                                                </div>
                                                                                            );
                                                                                        }
                                                                                        
                                                                                        const step = item.step;
                                                                                        let cardStyle = 'bg-cyber-bg/80 border-cyber-muted/20 text-cyber-muted hover:border-cyber-blue/50 hover:text-white';
                                                                                        if (item.status === 'IN_PROGRESS') cardStyle = 'bg-cyber-blue/20 border-cyber-blue text-white shadow-neon-blue';
                                                                                        else if (item.status === 'COMPLETED') cardStyle = 'bg-green-500/10 border-green-500/30 text-green-400 opacity-80';
                                                                                        else if (item.status === 'SKIPPED') cardStyle = 'bg-cyber-orange/10 border-cyber-orange/30 text-cyber-orange opacity-80';
                                                                                        
                                                                                        return (
                                                                                            <button key={`${step.id}-${i}`} onClick={() => handleStepClick(step)} className={`text-left p-1.5 rounded border text-[10px] w-full transition-all flex flex-col gap-1 mb-0.5 ${cardStyle}`} title={`${step.name} (${step.estimatedHours}H)`}>
                                                                                                {item.status === 'COMPLETED' ? (
                                                                                                    <div className="flex items-center gap-1 w-full"><CheckCircle size={12} className="flex-shrink-0" /><span className="truncate">{step.name} {item.partLabel}</span></div>
                                                                                                ) : item.status === 'SKIPPED' ? (
                                                                                                    <><div className="flex items-center gap-2 w-full opacity-80 mb-0.5"><Ban size={10} className="text-cyber-orange" /><div className="text-[9px] border border-current px-1 rounded leading-none whitespace-nowrap">{step.module}</div><div className="text-[10px] font-mono middle leading-none decoration-slice">0H (忽略)</div></div><div className="leading-snug font-bold break-words text-sm text-left line-through decoration-cyber-orange/50">{step.name}</div></>
                                                                                                ) : (
                                                                                                    <><div className="flex items-center gap-2 w-full opacity-80 mb-0.5"><div className="text-[9px] border border-current px-1 rounded leading-none whitespace-nowrap text-cyber-muted">{step.module}</div><div className="text-[10px] font-mono leading-none text-cyber-muted">{step.estimatedHours}H {item.partLabel}</div></div><div className="leading-snug font-bold break-words text-sm text-left">{step.name}</div></>
                                                                                                )}
                                                                                            </button>
                                                                                        )
                                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        ) : (
            <div className="h-full flex flex-col items-center justify-center text-cyber-muted bg-cyber-card/30 rounded-none border border-dashed border-cyber-muted/30 p-8">
                <div className="w-20 h-20 bg-cyber-muted/5 rounded-full flex items-center justify-center mb-6 animate-pulse">
                    {isReadOnly ? <Eye className="text-cyber-blue" size={40} /> : <Settings className="text-cyber-muted" size={40} />}
                </div>
                <p className="text-xl font-bold tracking-widest text-white mb-2">{isReadOnly ? '生產監控中' : '等待指令'}</p>
                <p className="text-sm text-cyber-blue">{isReadOnly ? '請從左側清單選擇機台以查看實時生產進度' : '请从左侧列表选择机台以开始操作...'}</p>
            </div>
        )}
      </div>
    </div>
  );
};