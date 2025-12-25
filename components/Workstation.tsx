
import React, { useState, useMemo, useEffect } from 'react';
import { WorkOrder, MachineModel, MachineStatus, ProcessStep, StepStatusEnum, StepState, AnomalyRecord, HolidayRule, HolidayType } from '../types';
import { calculateOrderCompletionDate, isWorkingDay, DEFAULT_HOLIDAY_RULES } from '../services/holidayService';
import { CheckCircle, Play, AlertCircle, Clock, Filter, Layers, Settings, X, Activity, User, Plus, ChevronDown, ChevronUp, AlertTriangle, Save, RotateCcw, Search, Table, Ban, Eye, Lock, Zap, PauseOctagon, Clock3, AlertOctagon } from 'lucide-react';

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
  const [selectedStep, setSelectedStep] = useState<ProcessStep | null>(null);
  const [showAnomalyModal, setShowAnomalyModal] = useState(false);
  const [stepSearchTerm, setStepSearchTerm] = useState(''); 
  const [newAnomaly, setNewAnomaly] = useState<{
      stepName: string; reason: string; department: string; anomalyStatus: 'CONTINUOUS' | 'HALTED'; startTime: string; endTime: string; durationDays: string;
  }>({
      stepName: '', reason: '', department: '', anomalyStatus: 'CONTINUOUS', startTime: '', endTime: '', durationDays: '0'
  });
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const [isAnomaliesCollapsed, setIsAnomaliesCollapsed] = useState(false);
  const [workshopTab, setWorkshopTab] = useState<'ALL' | 'K1廠' | 'K2廠' | 'K3廠'>('ALL');
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
      const matchWorkshop = workshopTab === 'ALL' || o.workshop === workshopTab;
      const matchStatus = statusTab === 'ALL' || o.status === statusTab;
      return matchWorkshop && matchStatus;
  }).sort((a, b) => {
      const dateA = a.businessClosingDate ? new Date(a.businessClosingDate).getTime() : Number.MAX_SAFE_INTEGER;
      const dateB = b.businessClosingDate ? new Date(b.businessClosingDate).getTime() : Number.MAX_SAFE_INTEGER;
      return dateA - dateB;
  });

  const getStatusCount = (key: 'ALL' | MachineStatus) => {
      return orders.filter(o => {
          const matchWorkshop = workshopTab === 'ALL' || o.workshop === workshopTab;
          const matchStatus = key === 'ALL' || o.status === key;
          return matchWorkshop && matchStatus;
      }).length;
  };

  const selectedOrder = orders.find(o => o.id === selectedOrderId);
  const selectedModel = selectedOrder ? models.find(m => m.id === selectedOrder.modelId) : null;

  const groupedSteps = useMemo(() => {
      if (!selectedModel) return {} as Record<string, (ProcessStep & { index: number })[]>;
      const groups: Record<string, (ProcessStep & { index: number })[]> = {};
      selectedModel.steps.forEach((step, index) => {
          const pMod = step.parallelModule || '通用工序';
          if (!groups[pMod]) groups[pMod] = [];
          groups[pMod].push({ ...step, index });
      });
      return Object.keys(groups).sort().reduce((acc, key) => { 
          acc[key] = groups[key]; 
          return acc; 
      }, {} as Record<string, (ProcessStep & { index: number })[]>);
  }, [selectedModel]);

  const calculateOrderMetrics = (order: WorkOrder) => {
      const model = models.find(m => m.id === order.modelId);
      if (!model) return { variance: 0, projectedDate: new Date(), closingDate: null };
      
      const projected = calculateOrderCompletionDate(order, model, holidayRules);
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

  const handleStepClick = (step: ProcessStep) => { if (!selectedOrder) return; setSelectedStep(step); };
  const handleCloseModal = () => setSelectedStep(null);
  const handleUpdateCurrentStepStatus = (status: StepStatusEnum) => {
      if (isReadOnly || !selectedOrder || !selectedStep) return;
      onUpdateStepStatus(selectedOrder.id, selectedStep.id, status);
      handleCloseModal();
  };
  const handleStartOrder = (id: string) => { if (isReadOnly) return; onStatusChange(id, MachineStatus.IN_PROGRESS); setSelectedOrderId(id); };
  const toggleModule = (modName: string) => setExpandedModules(prev => ({ ...prev, [modName]: !prev[modName] }));
  
  const calculateDuration = () => {
      if (newAnomaly.startTime && newAnomaly.endTime) {
          const start = new Date(newAnomaly.startTime);
          const end = new Date(newAnomaly.endTime);
          if (start >= end) { setNewAnomaly(prev => ({ ...prev, durationDays: '0' })); return; }
          const HOURS_PER_DAY = 9; let totalMilliseconds = 0; const current = new Date(start); current.setHours(0,0,0,0);
          const endDateMidnight = new Date(end); endDateMidnight.setHours(0,0,0,0);
          while (current <= endDateMidnight) {
              const shiftStart = new Date(current); shiftStart.setHours(8, 30, 0, 0);
              const shiftEnd = new Date(current); shiftEnd.setHours(17, 30, 0, 0);
              const overlapStart = start > shiftStart ? start : shiftStart;
              const overlapEnd = end < shiftEnd ? end : shiftEnd;
              if (overlapStart < overlapEnd) totalMilliseconds += overlapEnd.getTime() - overlapStart.getTime();
              current.setDate(current.getDate() + 1);
          }
          setNewAnomaly(prev => ({ ...prev, durationDays: parseFloat((totalMilliseconds / (1000 * 60 * 60 * HOURS_PER_DAY)).toFixed(1)).toString() }));
      } else setNewAnomaly(prev => ({ ...prev, durationDays: '0' }));
  };
  useEffect(() => calculateDuration(), [newAnomaly.startTime, newAnomaly.endTime]);

  const getDefaultTimeStr = (hour: number, minute: number) => {
    const now = new Date(); now.setHours(hour, minute, 0, 0);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  };

  const handleOpenAnomalyModal = () => {
    if (isReadOnly) return;
    setNewAnomaly({ stepName: '', reason: '', department: '生产', anomalyStatus: 'CONTINUOUS', startTime: getDefaultTimeStr(8, 30), endTime: getDefaultTimeStr(17, 30), durationDays: '0' });
    setStepSearchTerm(''); setShowAnomalyModal(true);
  };

  const handleSaveAnomaly = () => {
      if (isReadOnly || !selectedOrderId || !newAnomaly.stepName || !newAnomaly.reason || !newAnomaly.startTime) { alert("请填写必要信息"); return; }
      onAddAnomaly(selectedOrderId, { id: crypto.randomUUID(), stepName: newAnomaly.stepName, reason: newAnomaly.reason, department: newAnomaly.department, anomalyStatus: newAnomaly.anomalyStatus, startTime: new Date(newAnomaly.startTime).toISOString(), endTime: newAnomaly.endTime ? new Date(newAnomaly.endTime).toISOString() : '', durationDays: newAnomaly.durationDays, reportedAt: new Date().toISOString() });
      setShowAnomalyModal(false);
  };

  const completedStepsCount = selectedOrder ? Object.values(selectedOrder.stepStates || {}).filter((s: any) => s.status === 'COMPLETED' || s.status === 'SKIPPED').length : 0;
  const progressPercentage = Math.round((completedStepsCount / (selectedModel?.steps.length || 1)) * 100);

  const dateMetrics = useMemo(() => {
    if (!selectedOrder) return null;
    const m = calculateOrderMetrics(selectedOrder);
    return { startDate: selectedOrder.startDate ? new Date(selectedOrder.startDate) : null, projectedDate: m.projectedDate, closingDate: m.closingDate, varianceDays: m.variance, materialRate: selectedOrder.issuanceRate || '0%' };
  }, [selectedOrder, models]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full relative">
      {/* 異常新增彈窗 */}
      {showAnomalyModal && selectedOrder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
              <div className="bg-cyber-card border border-cyber-orange shadow-neon-orange max-w-xl w-full relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><AlertTriangle size={120} className="text-cyber-orange" /></div>
                  <div className="bg-cyber-orange/10 p-5 border-b border-cyber-orange/30 flex justify-between items-center relative z-10">
                      <h3 className="text-xl font-bold text-white tracking-wider flex items-center gap-2">
                        <AlertOctagon size={22} className="text-cyber-orange animate-pulse"/> 
                        機台異常反饋: <span className="text-cyber-orange font-mono">{selectedOrder.id}</span>
                      </h3>
                      <button onClick={() => setShowAnomalyModal(false)} className="text-cyber-muted hover:text-white transition-colors"><X size={28} /></button>
                  </div>
                  
                  <div className="p-6 space-y-5 relative z-10">
                      <div className="grid grid-cols-2 gap-4">
                          <div className="col-span-2 md:col-span-1">
                              <label className="block text-xs font-mono text-cyber-blue mb-1 uppercase tracking-wider font-sans font-bold">異常工序範圍</label>
                              <select 
                                value={newAnomaly.stepName}
                                onChange={(e) => setNewAnomaly(prev => ({ ...prev, stepName: e.target.value }))}
                                className="w-full bg-cyber-bg border border-cyber-muted/40 p-2.5 text-white focus:border-cyber-orange focus:outline-none text-sm font-mono"
                              >
                                <option value="">-- 請選擇受影響工序 --</option>
                                <option value="OTHER">全機台通用/其他</option>
                                {selectedModel?.steps.map(step => (
                                    <option key={step.id} value={step.name}>[{step.parallelModule}] {step.name}</option>
                                ))}
                              </select>
                          </div>
                          <div className="col-span-2 md:col-span-1">
                              <label className="block text-xs font-mono text-cyber-blue mb-1 uppercase tracking-wider font-sans font-bold">責任單位</label>
                              <select 
                                value={newAnomaly.department}
                                onChange={(e) => setNewAnomaly(prev => ({ ...prev, department: e.target.value }))}
                                className="w-full bg-cyber-bg border border-cyber-muted/40 p-2.5 text-white focus:border-cyber-orange focus:outline-none text-sm font-mono"
                              >
                                {['生产', '电控', 'KA', '应用', '采购', '生管', '仓库', '设计', '业务', '其他'].map(dept => (
                                    <option key={dept} value={dept}>{dept}</option>
                                ))}
                              </select>
                          </div>
                      </div>

                      <div>
                          <label className="block text-xs font-mono text-cyber-blue mb-1 uppercase tracking-wider font-sans font-bold">異常原因詳細說明</label>
                          <textarea 
                            value={newAnomaly.reason}
                            onChange={(e) => setNewAnomaly(prev => ({ ...prev, reason: e.target.value }))}
                            rows={3}
                            placeholder="請具體描述異常發生的原因、現狀及對進度的影響..."
                            className="w-full bg-cyber-bg border border-cyber-muted/40 p-3 text-white focus:border-cyber-orange focus:outline-none text-sm leading-relaxed"
                          />
                      </div>

                      <div className="p-4 bg-cyber-bg/50 border border-cyber-muted/20 rounded-sm">
                          <label className="block text-xs font-mono text-cyber-orange mb-3 uppercase tracking-widest border-b border-cyber-orange/20 pb-1 font-sans font-bold">生產控制策略 (影響排程計算)</label>
                          <div className="flex gap-3">
                              <button 
                                onClick={() => setNewAnomaly(prev => ({ ...prev, anomalyStatus: 'CONTINUOUS' }))}
                                className={`flex-1 py-3 px-4 flex flex-col items-center gap-1 border transition-all duration-300 ${newAnomaly.anomalyStatus === 'CONTINUOUS' ? 'bg-cyber-blue/10 border-cyber-blue text-cyber-blue shadow-neon-blue' : 'bg-transparent border-cyber-muted/20 text-cyber-muted hover:border-cyber-muted'}`}
                              >
                                  <Zap size={20} className={newAnomaly.anomalyStatus === 'CONTINUOUS' ? 'animate-pulse' : ''} />
                                  <span className="text-xs font-bold uppercase tracking-widest">持續生產</span>
                                  <span className="text-[9px] opacity-60">(異常不中斷組裝)</span>
                              </button>
                              <button 
                                onClick={() => setNewAnomaly(prev => ({ ...prev, anomalyStatus: 'HALTED' }))}
                                className={`flex-1 py-3 px-4 flex flex-col items-center gap-1 border transition-all duration-300 ${newAnomaly.anomalyStatus === 'HALTED' ? 'bg-red-500/10 border-red-500 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-transparent border-cyber-muted/20 text-cyber-muted hover:border-cyber-muted'}`}
                              >
                                  <PauseOctagon size={20} className={newAnomaly.anomalyStatus === 'HALTED' ? 'animate-bounce' : ''} />
                                  <span className="text-xs font-bold uppercase tracking-widest">停工狀態</span>
                                  <span className="text-[9px] opacity-60">(該期間排程自動順延)</span>
                              </button>
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-[10px] font-mono text-cyber-muted mb-1 uppercase tracking-widest flex items-center gap-1"><Clock3 size={10}/> 開始時間</label>
                              <input 
                                type="datetime-local"
                                value={newAnomaly.startTime}
                                onChange={(e) => setNewAnomaly(prev => ({ ...prev, startTime: e.target.value }))}
                                className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-orange focus:outline-none text-xs font-mono"
                              />
                          </div>
                          <div>
                              <label className="block text-[10px] font-mono text-cyber-muted mb-1 uppercase tracking-widest flex items-center gap-1"><Clock3 size={10}/> 預計結束 (選填)</label>
                              <input 
                                type="datetime-local"
                                value={newAnomaly.endTime}
                                onChange={(e) => setNewAnomaly(prev => ({ ...prev, endTime: e.target.value }))}
                                className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-orange focus:outline-none text-xs font-mono"
                              />
                          </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-cyber-muted/20">
                          <div className="flex flex-col">
                              <span className="text-[10px] text-cyber-muted uppercase font-mono">影響工時累計</span>
                              <span className="text-xl font-black text-cyber-orange font-mono tracking-tighter">{newAnomaly.durationDays} <span className="text-xs font-normal">工作天</span></span>
                          </div>
                          <button 
                            onClick={handleSaveAnomaly}
                            className="bg-cyber-orange hover:bg-white text-black font-display font-black py-3 px-10 shadow-neon-orange transition-all uppercase tracking-[0.2em] flex items-center gap-2"
                          >
                            <Save size={18} /> 提交異常反饋
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* 工序操作彈窗 - 調整比例與細節 */}
      {selectedStep && selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
              <div className="bg-cyber-card border border-cyber-blue shadow-neon-blue max-w-lg w-full relative overflow-hidden">
                  {/* 背景裝飾 */}
                  <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none -mr-8 -mt-8">
                      <Layers size={160} className="text-cyber-blue" />
                  </div>

                  {/* 彈窗標題 */}
                  <div className="bg-cyber-blue/10 p-4 border-b border-cyber-blue/30 flex justify-between items-center relative z-10">
                      <div className="flex flex-col">
                          <span className="text-[10px] font-mono text-cyber-blue uppercase tracking-widest mb-1">工序細節控制面板</span>
                          <h3 className="text-sm font-bold text-white tracking-wider flex items-center gap-2 font-sans font-bold">
                            <Layers size={16} className="text-cyber-blue"/> 
                            {selectedStep.parallelModule} / <span className="text-cyber-blue">{selectedStep.module}</span>
                          </h3>
                      </div>
                      <button onClick={handleCloseModal} className="text-cyber-muted hover:text-white transition-colors p-1"><X size={20} /></button>
                  </div>

                  <div className="p-6 relative z-10">
                       <h2 className="text-xl font-bold text-white mb-5 leading-tight">{selectedStep.name}</h2>
                       
                       <div className="grid grid-cols-2 gap-3 mb-6">
                           <div className="flex flex-col border border-cyber-muted/20 p-3 bg-cyber-bg/50">
                               <span className="text-[10px] text-cyber-muted uppercase mb-1 flex items-center gap-1"><Clock size={12} className="text-cyber-orange"/> 預計工時</span>
                               <span className="text-white font-mono font-bold text-sm">{selectedStep.estimatedHours} <span className="text-[10px] font-normal opacity-50">Hours</span></span>
                           </div>
                           <div className="flex flex-col border border-cyber-muted/20 p-3 bg-cyber-bg/50">
                               <span className="text-[10px] text-cyber-muted uppercase mb-1 flex items-center gap-1"><User size={12} className="text-cyber-blue"/> 執行人員</span>
                               <span className="text-white text-sm font-bold">
                                   {selectedOrder.stepStates?.[selectedStep.id]?.operator || '--'}
                               </span>
                           </div>
                       </div>

                       <div className="mb-8">
                           <div className="text-[10px] uppercase tracking-widest text-cyber-muted mb-2 font-sans font-bold flex justify-between">
                               <span>當前狀態</span>
                               {selectedOrder.stepStates?.[selectedStep.id]?.endTime && (
                                   <span className="text-[9px] opacity-50">完成於: {new Date(selectedOrder.stepStates[selectedStep.id].endTime!).toLocaleDateString()}</span>
                               )}
                           </div>
                           {(() => {
                               const status = selectedOrder.stepStates?.[selectedStep.id]?.status || 'PENDING';
                               if (status === 'COMPLETED') return <div className="text-green-400 font-bold border border-green-500/30 bg-green-500/10 p-4 text-center flex items-center justify-center gap-2 shadow-[inset_0_0_15px_rgba(34,197,94,0.1)] rounded-sm"><CheckCircle size={18}/> 已完工</div>
                               if (status === 'SKIPPED') return <div className="text-cyber-orange font-bold border border-cyber-orange/30 bg-cyber-orange/10 p-4 text-center flex items-center justify-center gap-2 opacity-80 rounded-sm"><Ban size={18}/> ⛔ 已忽略作業</div>
                               if (status === 'IN_PROGRESS') return <div className="text-cyber-blue font-bold border border-cyber-blue/30 bg-cyber-blue/10 p-4 text-center flex items-center justify-center gap-2 animate-pulse shadow-[inset_0_0_15px_rgba(0,240,255,0.1)] rounded-sm"><Activity size={18}/> 正在進行中...</div>
                               return <div className="text-cyber-muted font-bold border border-cyber-muted/20 bg-cyber-bg/50 p-4 text-center rounded-sm">等待開工指令</div>
                           })()}
                       </div>

                       {!isReadOnly ? (
                        <div className="flex gap-3">
                            {(!selectedOrder.stepStates?.[selectedStep.id] || selectedOrder.stepStates?.[selectedStep.id]?.status === 'PENDING') && (
                                <React.Fragment>
                                    <button 
                                        onClick={() => handleUpdateCurrentStepStatus('IN_PROGRESS')} 
                                        className="flex-1 bg-cyber-blue hover:bg-white text-black font-bold py-3.5 px-4 shadow-neon-blue transition-all flex items-center justify-center gap-2 uppercase tracking-wider text-xs"
                                    >
                                        <Play size={16} fill="currentColor" /> 開始作業
                                    </button>
                                    <button 
                                        onClick={() => handleUpdateCurrentStepStatus('SKIPPED')} 
                                        className="flex-1 bg-transparent border border-cyber-muted/40 text-cyber-muted hover:text-white hover:border-white font-bold py-3.5 px-4 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
                                    >
                                        <Ban size={16} /> 忽略此步
                                    </button>
                                </React.Fragment>
                            )}
                            {selectedOrder.stepStates?.[selectedStep.id]?.status === 'IN_PROGRESS' && (
                                <React.Fragment>
                                    <button 
                                        onClick={() => handleUpdateCurrentStepStatus('PENDING')} 
                                        className="flex-1 bg-transparent border border-cyber-orange text-cyber-orange hover:bg-cyber-orange/10 font-bold py-3.5 px-4 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
                                    >
                                        <RotateCcw size={16} /> 退回待命
                                    </button>
                                    <button 
                                        onClick={() => handleUpdateCurrentStepStatus('COMPLETED')} 
                                        className="flex-1 bg-green-500 hover:bg-green-400 text-black font-bold py-3.5 px-4 shadow-[0_0_15px_rgba(34,197,94,0.3)] transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
                                    >
                                        <CheckCircle size={16} /> 報工完工
                                    </button>
                                </React.Fragment>
                            )}
                            {(selectedOrder.stepStates?.[selectedStep.id]?.status === 'COMPLETED' || selectedOrder.stepStates?.[selectedStep.id]?.status === 'SKIPPED') && (
                                    <button onClick={() => handleUpdateCurrentStepStatus('IN_PROGRESS')} className="flex-1 bg-transparent border border-cyber-muted text-cyber-muted hover:text-white hover:border-white py-3.5 px-4 transition-all font-sans font-bold text-xs uppercase tracking-wider">重置工序 (返工處理)</button>
                            )}
                        </div>
                       ) : (
                        <div className="text-center p-4 border border-cyber-muted/20 bg-cyber-bg/50 text-cyber-muted text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 font-sans font-bold">
                            <Lock size={12} className="text-cyber-orange" /> 唯讀模式: 僅供進度查看
                        </div>
                       )}
                  </div>
              </div>
          </div>
      )}

      {/* 左側清單 */}
      <div className="lg:col-span-1 flex flex-col h-[calc(100vh-140px)]">
        <div className="flex flex-col gap-3 mb-4">
            <div className="flex justify-between items-end border-b border-cyber-blue/30 pb-2"><h2 className="font-bold text-cyber-blue text-lg tracking-wide uppercase flex items-center gap-2 font-sans font-bold">{isReadOnly ? <Activity size={18} className="text-green-400" /> : <Settings size={18} />}{isReadOnly ? '生产进度看板' : '選擇機台'}</h2><div className="flex gap-1">{['ALL', 'K1廠', 'K2廠', 'K3廠'].map(tab => (<button key={tab} onClick={() => setWorkshopTab(tab as any)} className={`text-[10px] px-2 py-1 transition-colors rounded-t ${workshopTab === tab ? 'bg-cyber-blue text-black font-bold font-sans' : 'text-cyber-muted hover:text-white bg-cyber-bg/50'}`}>{tab === 'ALL' ? '总览' : tab}</button>))}</div></div>
            <div className="flex gap-2 bg-cyber-card/50 p-1 rounded border border-cyber-muted/20">{[{key:'ALL',label:'全部'},{key:MachineStatus.IN_PROGRESS,label:'进行中'},{key:MachineStatus.PLANNED,label:'排隊中'},{key:MachineStatus.COMPLETED,label:'已完成'}].map((status) => (<button key={status.key} onClick={() => setStatusTab(status.key as any)} className={`flex-1 text-[10px] py-1.5 text-center transition-all rounded font-sans font-bold ${statusTab === status.key ? 'bg-cyber-blue/20 text-cyber-blue shadow-neon-blue border border-cyber-blue/30' : 'text-cyber-muted hover:text-white hover:bg-white/5'}`}>{status.label} <span className="opacity-80 font-mono">({getStatusCount(status.key as any)}台)</span></button>))}</div>
        </div>
        <div className="bg-cyber-card rounded-none shadow-sm border border-cyber-blue/30 flex-1 relative flex flex-col min-h-0 overflow-hidden"><div className="absolute top-0 left-0 w-6 h-6 border-l-2 border-t-2 border-cyber-blue z-20 pointer-events-none"></div><div className="absolute top-0 right-0 w-6 h-6 border-r-2 border-t-2 border-cyber-blue z-20 pointer-events-none"></div><div className="overflow-y-auto custom-scrollbar flex-1">{filteredOrders.length === 0 ? <div className="p-8 text-center flex flex-col items-center justify-center h-full text-cyber-muted opacity-60"><Filter size={32} className="mb-2" /><p className="text-sm font-sans font-bold">无符合条件的机台</p></div> : filteredOrders.map(order => { const { variance, projectedDate, closingDate } = calculateOrderMetrics(order); const modelName = models.find(m => m.id === order.modelId)?.name.split(' ')[0] || ''; return ( <button key={order.id} onClick={() => setSelectedOrderId(order.id)} className={`w-full text-left p-4 border-b border-cyber-muted/10 hover:bg-cyber-blue/5 transition-all focus:outline-none group relative ${selectedOrderId === order.id ? 'bg-gradient-to-r from-cyber-blue/10 to-transparent border-l-4 border-l-cyber-blue' : 'border-l-4 border-l-transparent'}`}> <div className="flex justify-between items-start"> <div className="flex flex-col items-start gap-1"> <div className="flex items-baseline gap-1 font-sans font-bold"><span className={`font-bold text-sm tracking-wide ${selectedOrderId === order.id ? 'text-white' : 'text-cyber-muted group-hover:text-white'}`}>{order.id}</span></div> <div className="flex items-center gap-2 text-[10px] font-sans"><span className={`font-medium ${selectedOrderId === order.id ? 'text-cyber-blue' : 'text-cyber-muted opacity-80'}`}>{modelName}</span><span className="text-cyber-muted/30">|</span><span className={`${selectedOrderId === order.id ? 'text-white/50' : 'text-cyber-muted/50'}`}>{order.workshop}</span></div> </div> <div className="flex flex-col items-end gap-1 ml-auto font-sans"> <div className="flex items-center gap-2 justify-end font-sans"> <div className="flex gap-1 justify-end font-sans"> <div className={`flex flex-col items-center justify-center w-14 h-10 rounded border shadow-sm ${variance > 0 ? 'border-cyber-orange/40 bg-cyber-orange/10' : 'border-green-500/40 bg-green-500/10'}`}><span className="text-[10px] text-white font-bold mb-0.5 block drop-shadow-md">差异</span><div className={`flex items-center gap-0.5 text-xs font-bold leading-none ${variance > 0 ? 'text-cyber-orange' : 'text-green-400'}`}>{variance > 0 && <AlertTriangle size={8}/>}{variance > 0 ? `+${variance}` : variance}</div></div> <div className="flex flex-col items-center justify-center w-14 h-10 rounded border border-cyber-blue/30 bg-cyber-bg/40 shadow-[0_0_5px_rgba(0,240,255,0.05)]"><span className="text-[10px] text-white font-bold mb-0.5 block drop-shadow-md">完工</span><span className="text-xs font-bold text-cyber-blue leading-none">{formatMMDD(projectedDate)}</span></div> <div className={`flex flex-col items-center justify-center w-14 h-10 rounded border shadow-[0_0_5px_rgba(0,240,255,0.05)] ${variance > 0 ? 'border-cyber-orange/30 bg-cyber-orange/5' : 'border-cyber-blue/30 bg-cyber-bg/40'}`}><span className="text-[10px] text-white font-bold mb-0.5 block drop-shadow-md">结关</span><span className={`text-xs font-bold leading-none ${variance > 0 ? 'text-cyber-orange' : 'text-cyber-muted'}`}>{closingDate ? formatMMDD(closingDate) : '-'}</span></div> </div> <span className={`h-10 flex items-center justify-center px-2 text-[10px] rounded uppercase border flex-shrink-0 font-bold ${order.status === MachineStatus.IN_PROGRESS ? 'border-cyber-blue/40 text-cyber-blue' : order.status === MachineStatus.PLANNED ? 'border-cyber-orange/40 text-cyber-orange' : 'border-green-500/40 text-green-500'}`}>{order.status === MachineStatus.IN_PROGRESS ? '进行中' : order.status === MachineStatus.PLANNED ? '排隊中' : '完成'}</span> </div> </div> </div> </button> ); })}</div></div>
      </div>

      {/* 右側詳細資料 */}
      <div className="lg:col-span-3 h-[calc(100vh-140px)]">
        {selectedOrder && selectedModel ? (
            <div className="bg-cyber-card rounded-none shadow-neon-blue border border-cyber-blue/50 h-full flex flex-col relative overflow-hidden animate-fade-in"><div className="absolute right-0 top-0 w-64 h-64 border-r border-t border-cyber-blue/10 opacity-30 rounded-tr-[100px] pointer-events-none"></div><div className="border-b border-cyber-blue/20 p-5 bg-cyber-bg/50 backdrop-blur-sm z-20"><div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6"><div className="min-w-[200px]"><div className="flex items-center gap-3 mb-1 font-sans font-bold"><h2 className="text-3xl font-bold text-white tracking-widest">{selectedOrder.id}</h2><span className="px-2 py-0.5 text-xs bg-cyber-bg border border-cyber-muted text-cyber-muted rounded">{selectedOrder.workshop}</span>{!isReadOnly && (<button onClick={handleOpenAnomalyModal} className="ml-2 bg-cyber-orange/10 border border-cyber-orange text-cyber-orange hover:bg-cyber-orange hover:text-black px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded flex items-center gap-1 transition-all shadow-neon-orange"><Plus size={12}/> 新增异常</button>)}</div><div className="flex items-center gap-2 font-sans font-bold"><p className="text-cyber-blue text-lg">{selectedModel.name}</p><span className="text-[10px] text-cyber-orange border border-cyber-orange/30 px-1 rounded bg-cyber-orange/5">{selectedOrder.holidayType === 'DOUBLE' ? '双休' : selectedOrder.holidayType === 'SINGLE' ? '单休' : selectedOrder.holidayType === 'ALTERNATE' ? '隔周休' : '无休'}</span>{selectedOrder.clientName && <span className="text-xs text-white/60 font-mono ml-2 border-l border-white/20 pl-2 tracking-wider">{selectedOrder.clientName}</span>}</div></div>{dateMetrics && (<div className="grid grid-cols-3 lg:grid-cols-6 gap-3 w-full xl:w-auto font-sans font-bold"><div className="bg-cyber-card/80 border border-cyber-blue/30 p-2 rounded flex flex-col items-center justify-center min-w-[90px] shadow-[0_0_10px_rgba(0,240,255,0.1)]"><span className="text-[11px] text-cyan-200/70 uppercase tracking-wider mb-1 font-bold font-sans">上线日</span><span className="text-sm font-bold text-white drop-shadow-md">{formatMMDD(dateMetrics.startDate)}</span></div><div className={`bg-cyber-card/80 border p-2 rounded flex flex-col items-center justify-center min-w-[90px] shadow-sm ${dateMetrics.varianceDays > 0 ? 'border-cyber-orange/40 bg-cyber-orange/5' : 'border-green-500/40 bg-green-500/10'}`}><span className="text-[11px] text-cyan-200/70 uppercase tracking-wider mb-1 font-bold font-sans">差异天数</span><div className={`flex items-center gap-1 text-sm font-bold drop-shadow-md ${dateMetrics.varianceDays > 0 ? 'text-cyber-orange' : 'text-green-400'}`}>{dateMetrics.varianceDays > 0 && <AlertTriangle size={12}/>}{dateMetrics.varianceDays > 0 ? `+${dateMetrics.varianceDays}` : dateMetrics.varianceDays}</div></div><div className="bg-cyber-card/80 border border-cyber-blue/30 p-2 rounded flex flex-col items-center justify-center min-w-[90px] shadow-[0_0_10px_rgba(0,240,255,0.1)]"><span className="text-[11px] text-cyan-200/70 uppercase tracking-wider mb-1 font-bold font-sans">生產完工</span><span className="text-sm font-bold text-cyber-blue drop-shadow-md">{formatMMDD(dateMetrics.projectedDate)}</span></div><div className="bg-cyber-card/80 border border-cyber-blue/30 p-2 rounded flex flex-col items-center justify-center min-w-[90px] shadow-[0_0_10px_rgba(0,240,255,0.1)]"><span className="text-[11px] text-cyan-200/70 uppercase tracking-wider mb-1 font-bold font-sans">业务结关</span><span className="text-sm font-bold text-white drop-shadow-md">{formatMMDD(dateMetrics.closingDate)}</span></div><div className="bg-cyber-card/80 border border-cyber-blue/30 p-2 rounded flex flex-col items-center justify-center min-w-[90px] shadow-[0_0_10px_rgba(0,240,255,0.1)]"><span className="text-[11px] text-cyan-200/70 uppercase tracking-wider mb-1 font-bold font-sans">发料率</span><span className="text-sm font-bold text-white drop-shadow-md">{dateMetrics.materialRate}</span></div><div className="bg-cyber-card/80 border border-cyber-blue/30 p-2 rounded flex flex-col items-center justify-center min-w-[90px] shadow-[0_0_10px_rgba(0,240,255,0.1)]"><span className="text-[11px] text-cyan-200/70 uppercase tracking-wider mb-1 font-bold font-sans">生产进度</span><span className={`text-sm font-bold drop-shadow-md ${progressPercentage === 100 ? 'text-green-400' : 'text-cyber-blue'}`}>{progressPercentage}%</span></div></div>)}</div></div><div className="flex-1 overflow-y-auto custom-scrollbar p-6 relative z-10">{selectedOrder.anomalies && selectedOrder.anomalies.length > 0 && (<div className={`relative rounded-lg transition-all duration-300 mb-6 ${isAnomaliesCollapsed ? 'h-px bg-transparent border-0 border-t border-cyber-orange/30 mt-8' : 'p-4 pt-8 border border-cyber-orange/30 bg-cyber-orange/5 shadow-[0_0_15px_rgba(255,136,0,0.1)]'}`}><div onClick={() => setIsAnomaliesCollapsed(!isAnomaliesCollapsed)} className="absolute -top-3 left-4 bg-cyber-card px-2 py-0.5 text-xs font-bold rounded uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all z-10 select-none shadow-[0_0_10px_rgba(0,0,0,0.5)] text-cyber-orange border border-cyber-orange hover:bg-cyber-orange hover:text-black font-sans font-bold"><AlertTriangle size={12}/> 异常反馈 ({selectedOrder.anomalies.length})<div className="ml-2 pl-2 border-l border-cyber-orange/30 flex items-center">{isAnomaliesCollapsed ? <ChevronDown size={14}/> : <ChevronUp size={14}/>}</div></div>{!isAnomaliesCollapsed && (<div className="space-y-2 animate-fade-in">{selectedOrder.anomalies.map((anomaly) => (<div key={anomaly.id} className={`bg-cyber-bg border p-3 rounded flex items-center justify-between text-xs hover:border-cyber-orange transition-colors ${anomaly.anomalyStatus === 'HALTED' ? 'border-red-500/50' : 'border-cyber-orange/30'}`}><div className="flex items-center gap-3"><div className={`p-1.5 rounded-full ${anomaly.anomalyStatus === 'HALTED' ? 'bg-red-500/20 text-red-500 animate-pulse' : 'bg-cyber-blue/20 text-cyber-blue'}`}>{anomaly.anomalyStatus === 'HALTED' ? <PauseOctagon size={16} /> : <Zap size={16} />}</div><div><div className="font-bold text-white flex items-center gap-2 font-sans">异常反馈: {anomaly.stepName}<span className={`text-[9px] px-1 rounded font-mono ${anomaly.anomalyStatus === 'HALTED' ? 'bg-red-500 text-white' : 'bg-cyber-blue/10 text-cyber-blue'}`}>{anomaly.anomalyStatus === 'HALTED' ? '停工' : '持續生產'}</span></div><div className="text-cyber-muted font-sans">原因: {anomaly.reason} | 责任: {anomaly.department}</div></div></div><div className="text-right font-sans"><div className="text-cyber-orange font-bold font-mono">{anomaly.durationDays} 天</div><div className="text-cyber-muted opacity-60 text-[10px]">{new Date(anomaly.startTime).toLocaleDateString()}</div></div></div>))}</div>)}</div>)}{selectedOrder.status === MachineStatus.PLANNED ? (<div className="text-center py-20 flex flex-col items-center justify-center h-full"><div className="w-24 h-24 bg-cyber-orange/10 rounded-full flex items-center justify-center mb-6 border border-cyber-orange/30 shadow-[0_0_30px_rgba(255,136,0,0.2)]"><AlertCircle className="w-12 h-12 text-cyber-orange animate-pulse" /></div><h3 className="text-xl text-white font-bold mb-2 font-sans">{isReadOnly ? '尚未投产' : '准备投产'}</h3>{!isReadOnly ? (<button onClick={() => handleStartOrder(selectedOrder.id)} className="mt-6 group bg-cyber-blue hover:bg-white text-black font-bold py-4 px-12 shadow-neon-blue transition-all flex items-center justify-center tracking-wider hover:scale-105 font-sans font-bold"><Play size={20} className="mr-3 group-hover:text-black" /> 启动生产流程</button>) : (<p className="text-cyber-muted text-sm mt-4 font-mono uppercase tracking-widest border border-cyber-muted/30 px-6 py-2 rounded">Awaiting production start by manager</p>)}</div>) : (<div className="space-y-8 pb-10">{Object.entries(groupedSteps).map(([parallelMod, steps]: [string, any]) => { const moduleCompleted = steps.filter((s:any) => selectedOrder.stepStates?.[s.id]?.status === 'COMPLETED' || selectedOrder.stepStates?.[s.id]?.status === 'SKIPPED').length; const moduleActive = steps.filter((s:any) => selectedOrder.stepStates?.[s.id]?.status === 'IN_PROGRESS').length; const isExpanded = !!expandedModules[parallelMod]; const isModuleFullyComplete = steps.length > 0 && moduleCompleted === steps.length; const rule = (holidayRules as any)[selectedOrder.holidayType] || DEFAULT_HOLIDAY_RULES['DOUBLE']; type CalendarItem = | { type: 'ANOMALY'; data: AnomalyRecord; sortWeight: 0 } | { type: 'STEP'; step: ProcessStep; status: StepStatusEnum; partLabel: string; sortWeight: number }; const dailyItems: Record<string, CalendarItem[]> = {}; 
    
    // 同步 21:00 順延邏輯至日曆渲染游標
    const now = new Date();
    const todayAtMidnight = new Date(now);
    todayAtMidnight.setHours(0,0,0,0);
    const effectiveEarliestStart = new Date(todayAtMidnight);
    if (now.getHours() >= 21) {
        effectiveEarliestStart.setDate(effectiveEarliestStart.getDate() + 1);
    }
    
    let dayCursor = selectedOrder.startDate ? new Date(selectedOrder.startDate) : new Date(); 
    dayCursor.setHours(0,0,0,0); 

    const anomalies = selectedOrder.anomalies || [];
    const isDateHalted = (d: Date) => {
        const time = new Date(d);
        time.setHours(0,0,0,0);
        const timeMs = time.getTime();
        return anomalies.some(a => {
            if (a.anomalyStatus !== 'HALTED') return false;
            const start = new Date(a.startTime); start.setHours(0,0,0,0);
            const endStr = a.endTime;
            const end = (endStr && endStr.trim() !== '') ? new Date(endStr) : new Date();
            end.setHours(23,59,59,999);
            return timeMs >= start.getTime() && timeMs <= end.getTime();
        });
    };
    
    steps.forEach((step:any) => { 
        const stepState = selectedOrder.stepStates?.[step.id] || { status: 'PENDING' }; 
        if (stepState.status === 'COMPLETED' || stepState.status === 'SKIPPED') { 
            const endTime = new Date(stepState.endTime || stepState.startTime || new Date().toISOString()); 
            const dateKey = new Date(endTime); 
            dateKey.setHours(0,0,0,0); 
            const key = dateKey.toISOString(); 
            if (!dailyItems[key]) dailyItems[key] = []; 
            dailyItems[key].push({ type: 'STEP', step, status: stepState.status, partLabel: '', sortWeight: stepState.status === 'COMPLETED' ? 1 : 2 }); 
            if (dateKey >= dayCursor) { 
                dayCursor = new Date(dateKey); 
                dayCursor.setDate(dayCursor.getDate() + 1); 
            } 
        } else { 
            if (dayCursor < effectiveEarliestStart) {
                dayCursor = new Date(effectiveEarliestStart);
            }

            let hoursRemaining = step.estimatedHours; 
            while (hoursRemaining > 0) { 
                let safety = 0; 
                while ((!isWorkingDay(dayCursor, rule) || isDateHalted(dayCursor)) && safety < 100) { 
                    dayCursor.setDate(dayCursor.getDate() + 1); 
                    safety++; 
                } 
                const alloc = Math.min(hoursRemaining, 8); 
                const key = dayCursor.toISOString(); 
                if (!dailyItems[key]) dailyItems[key] = []; 
                dailyItems[key].push({ type: 'STEP', step, status: stepState.status, partLabel: step.estimatedHours > 8 ? `(${alloc}H)` : '', sortWeight: stepState.status === 'IN_PROGRESS' ? 3 : 4 }); 
                hoursRemaining -= alloc; 
                dayCursor.setDate(dayCursor.getDate() + 1); 
            } 
        } 
    }); 
    
    if (selectedOrder.anomalies) { (selectedOrder.anomalies as AnomalyRecord[]).forEach(anomaly => { const isLinkedToThisModule = steps.some((s:any) => s.name === anomaly.stepName); const isFirstModule = Object.keys(groupedSteps)[0] === parallelMod; const isGeneral = anomaly.stepName === 'OTHER' || !selectedModel?.steps.some(s => s.name === anomaly.stepName); if (isLinkedToThisModule || (isFirstModule && isGeneral)) { const startDate = new Date(anomaly.startTime); startDate.setHours(0,0,0,0); const endStr = anomaly.endTime; const endDate = (endStr && endStr.trim() !== '') ? new Date(endStr) : new Date(); endDate.setHours(23,59,59,999); const iterDate = new Date(startDate); let safety = 0; while (iterDate <= endDate && safety < 90) { const key = iterDate.toISOString(); if (!dailyItems[key]) dailyItems[key] = []; if (!dailyItems[key].find(item => item.type === 'ANOMALY' && item.data.id === anomaly.id)) { dailyItems[key].push({ type: 'ANOMALY', data: anomaly, sortWeight: 0 }); } iterDate.setDate(iterDate.getDate() + 1); safety++; } } }); } const weeks: Record<string, { date: Date, items: CalendarItem[] }[]> = {}; Object.entries(dailyItems).forEach(([key, items]: [string, any]) => { const date = new Date(key); items.sort((a: any, b: any) => a.sortWeight - b.sortWeight); const day = date.getDay(); const diff = date.getDate() - day + (day === 0 ? -6 : 1); const monday = new Date(date.getTime()); monday.setDate(diff); monday.setHours(0,0,0,0); const weekKey = monday.toISOString(); if (!weeks[weekKey]) weeks[weekKey] = []; weeks[weekKey].push({ date, items }); }); const sortedWeekKeys = Object.keys(weeks).sort((a,b) => new Date(a).getTime() - new Date(b).getTime()); return (<div key={parallelMod} className={`relative rounded-lg transition-all duration-300 mb-6 ${!isExpanded ? 'h-px bg-transparent border-0 border-t border-cyber-muted/20 mt-8' : `p-0 pt-8 border ${isModuleFullyComplete ? 'border-green-500/50 bg-green-500/5 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 'border-cyber-muted/20 bg-cyber-card/30 hover:border-cyber-blue/30'}`}`}><div onClick={() => toggleModule(parallelMod)} className={`absolute -top-3 left-4 bg-cyber-card px-2 py-0.5 text-xs font-bold rounded uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all z-10 select-none shadow-[0_0_10px_rgba(0,0,0,0.5)] font-sans font-bold ${isModuleFullyComplete ? 'text-green-500 border border-green-500 hover:bg-green-500/10' : 'text-cyber-blue border border-cyber-blue/30 hover:bg-cyber-blue/10 hover:border-cyber-blue'}`}><Layers size={12}/> {parallelMod}{isModuleFullyComplete ? <CheckCircle size={12} className="ml-1" strokeWidth={3} /> : moduleActive > 0 && <span className="w-2 h-2 rounded-full bg-cyber-blue animate-pulse shadow-neon-blue"></span>}<div className={`ml-2 pl-2 border-l flex items-center ${isModuleFullyComplete ? 'border-green-500/30' : 'border-cyber-blue/20 opacity-70 group-hover:opacity-100'}`}>{isExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</div></div><div className={`absolute -top-3 right-4 text-[10px] bg-cyber-card px-2 py-0.5 border rounded select-none z-10 font-sans font-bold ${isModuleFullyComplete ? 'text-green-500 border-green-500/50' : 'text-cyber-muted border-cyber-muted/20'}`}>进度: {moduleCompleted}/{steps.length}</div>{isExpanded && (<div className="p-4 animate-fade-in"><div className="space-y-4">{sortedWeekKeys.map(weekKey => { const weekData = weeks[weekKey]; const weekDate = new Date(weekKey); return (<div key={weekKey} className="relative group/week space-y-1"><div className="grid grid-cols-7 gap-1 text-center font-sans font-bold">{['周一','周二','周三','周四','周五','周六','周日'].map((day, idx) => { const headerDate = new Date(weekDate); headerDate.setDate(headerDate.getDate() + idx); const dateStr = `${headerDate.getMonth() + 1}/${headerDate.getDate().toString().padStart(2, '0')}`; return (<div key={day} className="text-[9px] text-white uppercase tracking-widest font-bold py-0.5 bg-cyber-bg/40 border border-cyber-muted/5 whitespace-nowrap px-1">{day} <span className="ml-1">({dateStr})</span></div>);})}</div><div className="grid grid-cols-7 gap-1 min-h-[60px] border-b border-cyber-muted/5 pb-1 font-sans">{[0,1,2,3,4,5,6].map(dayIndex => { const targetJsDay = (dayIndex + 1) % 7; const dayInfo = weekData.find(d => d.date.getDay() === targetJsDay); return (<div key={dayIndex} className="bg-cyber-bg/20 border border-cyber-muted/5 p-1 relative min-h-[60px]"><div className="flex flex-col gap-1 font-sans">{dayInfo?.items.map((item, i) => { if (item.type === 'ANOMALY') { return (<div key={`anomaly-${item.data.id}-${i}`} className={`${item.data.anomalyStatus === 'HALTED' ? 'bg-red-500/20 border-red-500 shadow-[0_0_5px_rgba(239,68,68,0.3)]' : 'bg-red-500/10 border-red-500/30'} border text-red-400 p-1 rounded text-[10px] flex items-center gap-1 truncate font-bold animate-pulse font-sans`} title={`异常: ${item.data.reason} (${item.data.department})`}>{item.data.anomalyStatus === 'HALTED' ? <PauseOctagon size={10} className="flex-shrink-0" /> : <AlertTriangle size={10} className="flex-shrink-0" />}<span className="truncate font-sans">{item.data.reason}</span></div>); } const step = item.step; let cardStyle = 'bg-cyber-bg/80 border-cyber-muted/20 text-cyber-muted hover:border-cyber-blue/50 hover:text-white font-sans'; if (item.status === 'IN_PROGRESS') cardStyle = 'bg-cyber-blue/20 border-cyber-blue text-white shadow-neon-blue font-sans font-bold'; else if (item.status === 'COMPLETED') cardStyle = 'bg-green-500/10 border-green-500/30 text-green-400 opacity-80 font-sans'; else if (item.status === 'SKIPPED') cardStyle = 'bg-cyber-orange/10 border-cyber-orange/30 text-cyber-orange opacity-80 font-sans'; return (<button key={`${step.id}-${i}`} onClick={() => handleStepClick(step)} className={`text-left p-1.5 rounded border text-[10px] w-full transition-all flex flex-col gap-1 mb-0.5 ${cardStyle}`} title={`${step.name} (${step.estimatedHours}H)`}>{item.status === 'COMPLETED' ? (<div className="flex items-center gap-1 w-full font-sans font-bold"><CheckCircle size={12} className="flex-shrink-0" /><span className="truncate font-sans font-bold">{step.name} {item.partLabel}</span></div>) : item.status === 'SKIPPED' ? (<><div className="flex items-center gap-2 w-full opacity-80 mb-0.5 font-sans font-bold"><Ban size={10} className="text-cyber-orange" /><div className="text-[9px] border border-current px-1 rounded leading-none whitespace-nowrap font-sans">{step.module}</div><div className="text-[10px] font-mono middle leading-none decoration-slice">0H (忽略)</div></div><div className="leading-snug font-bold break-words text-sm text-left line-through decoration-cyber-orange/50 font-sans font-bold">{step.name}</div></>) : (<><div className="flex items-center gap-2 w-full opacity-80 mb-0.5 font-sans"><div className="text-[9px] border border-current px-1 rounded leading-none whitespace-nowrap text-cyber-muted font-sans font-bold">{step.module}</div><div className="text-[10px] font-mono leading-none text-cyber-muted">{step.estimatedHours}H {item.partLabel}</div></div><div className="leading-snug font-bold break-words text-sm text-left font-sans font-bold">{step.name}</div></>)}</button>);})}</div></div>);})}</div></div>);})}</div></div>)}</div>);})}</div>)}</div></div>) : <div className="h-full flex flex-col items-center justify-center text-cyber-muted bg-cyber-card/30 rounded-none border border-dashed border-cyber-muted/30 p-8"><div className="w-20 h-20 bg-cyber-muted/5 rounded-full flex items-center justify-center mb-6 animate-pulse">{isReadOnly ? <Eye className="text-cyber-blue" size={40} /> : <Settings className="text-cyber-muted" size={40} />}</div><p className="text-xl font-bold tracking-widest text-white mb-2 font-sans font-bold">{isReadOnly ? '生產監控中' : '等待指令'}</p><p className="text-sm text-cyber-blue font-sans font-bold">{isReadOnly ? '請從左側清單選擇機台以查看實時生產進度' : '请从左侧列表选择机台以开始操作...'}</p></div>}
      </div>
    </div>
  );
};
