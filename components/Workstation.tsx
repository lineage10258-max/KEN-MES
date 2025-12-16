
import React, { useState, useMemo, useEffect } from 'react';
import { WorkOrder, MachineModel, MachineStatus, ProcessStep, StepStatusEnum, StepState, AnomalyRecord } from '../types';
import { calculateProjectedDate } from '../services/holidayService';
import { CheckCircle, Play, AlertCircle, Clock, Filter, Layers, Settings, X, Activity, User, Plus, ChevronDown, ChevronUp, AlertTriangle, Save, RotateCcw, Search, Table } from 'lucide-react';

interface WorkstationProps {
  orders: WorkOrder[];
  models: MachineModel[];
  onUpdateStepStatus: (orderId: string, stepId: string, status: StepStatusEnum) => void;
  onStatusChange: (orderId: string, status: MachineStatus) => void;
  onAddAnomaly: (orderId: string, anomaly: AnomalyRecord) => void;
}

export const Workstation: React.FC<WorkstationProps> = ({ orders, models, onUpdateStepStatus, onStatusChange, onAddAnomaly }) => {
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  
  // Step Interaction State
  const [selectedStep, setSelectedStep] = useState<ProcessStep | null>(null);
  
  // Anomaly Modal State
  const [showAnomalyModal, setShowAnomalyModal] = useState(false);
  const [stepSearchTerm, setStepSearchTerm] = useState(''); // New state for searching steps
  const [newAnomaly, setNewAnomaly] = useState<{
      stepName: string;
      reason: string;
      department: string;
      startTime: string;
      endTime: string;
      durationDays: string;
  }>({
      stepName: '',
      reason: '',
      department: '',
      startTime: '',
      endTime: '',
      durationDays: '0'
  });
  
  // Collapsed State for Parallel Modules
  const [collapsedModules, setCollapsedModules] = useState<Record<string, boolean>>({});
  // New Collapsed State for Anomalies
  const [isAnomaliesCollapsed, setIsAnomaliesCollapsed] = useState(false);

  // Filter States
  const [workshopTab, setWorkshopTab] = useState<'ALL' | 'K1' | 'K2' | 'K3'>('ALL');
  const [statusTab, setStatusTab] = useState<'ALL' | MachineStatus>(MachineStatus.IN_PROGRESS);

  // Filter Logic & Sort Logic (By Start Date Ascending)
  const filteredOrders = orders.filter(o => {
      // 1. Workshop Filter
      const matchWorkshop = workshopTab === 'ALL' || (o.workshop?.startsWith(workshopTab) ?? false);
      
      // 2. Status Filter
      const matchStatus = statusTab === 'ALL' || o.status === statusTab;

      return matchWorkshop && matchStatus;
  }).sort((a, b) => {
      // Earliest Start Date First
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
  });

  const selectedOrder = orders.find(o => o.id === selectedOrderId);
  const selectedModel = selectedOrder ? models.find(m => m.id === selectedOrder.modelId) : null;

  // Helper to group steps by Parallel Module
  const getGroupedSteps = () => {
      if (!selectedModel) return {};
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
  };

  const groupedSteps = getGroupedSteps();

  // Helper function to calculate real-time projected date and variance (Shared Logic)
  const calculateOrderMetrics = (order: WorkOrder) => {
      const model = models.find(m => m.id === order.modelId);
      if (!model) return { variance: 0, projectedDate: new Date(), closingDate: null };

      // 1. Calculate remaining hours (same logic as used in Detail View)
      let remainingHours = 0;
      const getRemainingHoursForStep = (s: ProcessStep) => {
          const isCompleted = order.stepStates?.[s.id]?.status === 'COMPLETED';
          return isCompleted ? 0 : s.estimatedHours;
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

      // 2. Project Date
      const now = new Date();
      const holidayType = order.holidayType || 'DOUBLE';
      const projected = calculateProjectedDate(now, remainingHours, holidayType);

      // 3. Variance
      const closing = order.businessClosingDate ? new Date(order.businessClosingDate) : null;
      let variance = 0;
      if (closing) {
          const diff = projected.getTime() - closing.getTime();
          variance = Math.ceil(diff / (1000 * 60 * 60 * 24));
      }

      return { variance, projectedDate: projected, closingDate: closing };
  };

  // Step Action Logic
  const handleStepClick = (step: ProcessStep) => {
      if (!selectedOrder) return;
      setSelectedStep(step);
  };

  const handleCloseModal = () => {
      setSelectedStep(null);
  };

  const handleUpdateCurrentStepStatus = (status: StepStatusEnum) => {
      if (selectedOrder && selectedStep) {
          onUpdateStepStatus(selectedOrder.id, selectedStep.id, status);
          handleCloseModal();
      }
  };

  const handleStartOrder = (id: string) => {
    onStatusChange(id, MachineStatus.IN_PROGRESS);
    setSelectedOrderId(id);
  }

  const toggleModule = (modName: string) => {
    setCollapsedModules(prev => ({
        ...prev,
        [modName]: !prev[modName]
    }));
  };
  
  // Anomaly Logic - Updated for 8:30-17:30 working hours logic
  const calculateDuration = () => {
      if (newAnomaly.startTime && newAnomaly.endTime) {
          const start = new Date(newAnomaly.startTime);
          const end = new Date(newAnomaly.endTime);

          if (start >= end) {
              setNewAnomaly(prev => ({ ...prev, durationDays: '0' }));
              return;
          }

          // Constants for the workday (8:30 to 17:30)
          const WORK_START_HOUR = 8;
          const WORK_START_MIN = 30;
          const WORK_END_HOUR = 17;
          const WORK_END_MIN = 30;
          const HOURS_PER_DAY = 9; // 8:30 to 17:30 is 9 hours

          let totalMilliseconds = 0;
          
          // Iterate through each day involved
          const current = new Date(start);
          current.setHours(0,0,0,0);
          
          const endDateMidnight = new Date(end);
          endDateMidnight.setHours(0,0,0,0);

          while (current <= endDateMidnight) {
              // Define the shift window for the current day iteration
              const shiftStart = new Date(current);
              shiftStart.setHours(WORK_START_HOUR, WORK_START_MIN, 0, 0);

              const shiftEnd = new Date(current);
              shiftEnd.setHours(WORK_END_HOUR, WORK_END_MIN, 0, 0);

              // Calculate overlap between (start, end) and (shiftStart, shiftEnd)
              // Overlap Start = Max(start, shiftStart)
              const overlapStart = start > shiftStart ? start : shiftStart;
              // Overlap End = Min(end, shiftEnd)
              const overlapEnd = end < shiftEnd ? end : shiftEnd;

              if (overlapStart < overlapEnd) {
                  totalMilliseconds += overlapEnd.getTime() - overlapStart.getTime();
              }

              // Move to next day
              current.setDate(current.getDate() + 1);
          }

          const totalHours = totalMilliseconds / (1000 * 60 * 60);
          const totalDays = totalHours / HOURS_PER_DAY;
          
          // Format to max 1 decimal place (e.g., 1.5, 1, 0.5)
          // parseFloat removes trailing zeros (1.0 -> 1)
          const formattedDays = parseFloat(totalDays.toFixed(1)).toString();

          setNewAnomaly(prev => ({ ...prev, durationDays: formattedDays }));
      } else {
          setNewAnomaly(prev => ({ ...prev, durationDays: '0' }));
      }
  };

  useEffect(() => {
      calculateDuration();
  }, [newAnomaly.startTime, newAnomaly.endTime]);

  // Helper to format local date time for input (YYYY-MM-DDTHH:mm)
  const getDefaultTimeStr = (hour: number, minute: number) => {
    const now = new Date();
    now.setHours(hour, minute, 0, 0);
    const pad = (num: number) => num.toString().padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  };

  const handleOpenAnomalyModal = () => {
    setNewAnomaly({
        stepName: '',
        reason: '',
        department: '',
        startTime: getDefaultTimeStr(8, 30),
        endTime: getDefaultTimeStr(17, 30),
        durationDays: '0'
    });
    setStepSearchTerm(''); // Reset search term
    setShowAnomalyModal(true);
  };

  const handleSaveAnomaly = () => {
      if (!selectedOrderId || !newAnomaly.stepName || !newAnomaly.reason || !newAnomaly.startTime) {
          alert("请填写必要信息");
          return;
      }
      
      const record: AnomalyRecord = {
          id: crypto.randomUUID(), 
          stepName: newAnomaly.stepName,
          reason: newAnomaly.reason,
          department: newAnomaly.department,
          startTime: new Date(newAnomaly.startTime).toISOString(),
          endTime: newAnomaly.endTime ? new Date(newAnomaly.endTime).toISOString() : '',
          durationDays: newAnomaly.durationDays,
          reportedAt: new Date().toISOString()
      };
      
      onAddAnomaly(selectedOrderId, record);
      setShowAnomalyModal(false);
      setNewAnomaly({
          stepName: '',
          reason: '',
          department: '',
          startTime: '',
          endTime: '',
          durationDays: '0'
      });
  };


  // Stats for the selected order
  const completedStepsCount = selectedOrder ? Object.values(selectedOrder.stepStates || {}).filter((s: StepState) => s.status === 'COMPLETED').length : 0;
  const totalSteps = selectedModel?.steps.length || 1;
  const progressPercentage = Math.round((completedStepsCount / totalSteps) * 100);

  // --- Date & Variance Calculations for Detail View ---
  const dateMetrics = useMemo(() => {
    if (!selectedOrder) return null;
    const m = calculateOrderMetrics(selectedOrder);
    return {
        startDate: selectedOrder.startDate ? new Date(selectedOrder.startDate) : null,
        projectedDate: m.projectedDate,
        closingDate: m.closingDate,
        varianceDays: m.variance,
        materialRate: '60%' // Hardcoded for now
    };
  }, [selectedOrder, models]);


  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full relative">
      
      {/* Modal / Dialog for Step Action */}
      {selectedStep && selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
              <div className="bg-cyber-card border border-cyber-blue shadow-neon-blue max-w-lg w-full relative">
                  {/* Decorative Header */}
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

                       {/* Status Display in Modal */}
                       <div className="mb-8">
                           <div className="text-xs uppercase tracking-widest text-cyber-muted mb-2">当前状态</div>
                           {(() => {
                               const status = selectedOrder.stepStates?.[selectedStep.id]?.status || 'PENDING';
                               if (status === 'COMPLETED') {
                                   return <div className="text-green-400 font-bold border border-green-500/30 bg-green-500/10 p-3 text-center flex items-center justify-center gap-2"><CheckCircle/> 已完工</div>
                               } else if (status === 'IN_PROGRESS') {
                                   return <div className="text-cyber-blue font-bold border border-cyber-blue/30 bg-cyber-blue/10 p-3 text-center flex items-center justify-center gap-2 animate-pulse"><Activity/> 正在进行中...</div>
                               } else {
                                   return <div className="text-cyber-muted font-bold border border-cyber-muted/30 bg-cyber-bg/50 p-3 text-center">待开工</div>
                               }
                           })()}
                       </div>

                       {/* Action Buttons */}
                       <div className="flex gap-4">
                           {(!selectedOrder.stepStates?.[selectedStep.id] || selectedOrder.stepStates?.[selectedStep.id]?.status === 'PENDING') && (
                               <button 
                                   onClick={() => handleUpdateCurrentStepStatus('IN_PROGRESS')}
                                   className="flex-1 bg-cyber-blue hover:bg-white text-black font-bold py-3 px-4 shadow-neon-blue transition-all flex items-center justify-center gap-2"
                               >
                                   <Play size={18} fill="currentColor" /> 开始作业
                               </button>
                           )}

                           {selectedOrder.stepStates?.[selectedStep.id]?.status === 'IN_PROGRESS' && (
                                <>
                                    <button 
                                        onClick={() => handleUpdateCurrentStepStatus('PENDING')}
                                        className="flex-1 bg-transparent border border-cyber-orange text-cyber-orange hover:bg-cyber-orange hover:text-black font-bold py-3 px-4 shadow-[0_0_10px_rgba(255,136,0,0.3)] transition-all flex items-center justify-center gap-2"
                                    >
                                        <RotateCcw size={18} /> 退回待开工
                                    </button>
                                    <button 
                                        onClick={() => handleUpdateCurrentStepStatus('COMPLETED')}
                                        className="flex-1 bg-green-500 hover:bg-green-400 text-black font-bold py-3 px-4 shadow-[0_0_15px_rgba(34,197,94,0.5)] transition-all flex items-center justify-center gap-2"
                                    >
                                        <CheckCircle size={18} /> 确认完工
                                    </button>
                                </>
                           )}

                           {selectedOrder.stepStates?.[selectedStep.id]?.status === 'COMPLETED' && (
                                <button 
                                   onClick={() => handleUpdateCurrentStepStatus('IN_PROGRESS')}
                                   className="flex-1 bg-transparent border border-cyber-muted text-cyber-muted hover:text-white hover:border-white py-3 px-4 transition-all"
                               >
                                   重置为进行中 (返工)
                               </button>
                           )}
                       </div>
                  </div>
              </div>
          </div>
      )}
      
      {/* Anomaly Modal */}
      {showAnomalyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
              <div className="bg-cyber-card border border-cyber-orange shadow-neon-orange max-w-lg w-full relative">
                  <div className="bg-cyber-orange/10 p-4 border-b border-cyber-orange/30 flex justify-between items-center">
                      <h3 className="text-xl font-bold text-white tracking-wider flex items-center gap-2">
                          <AlertTriangle size={20} className="text-cyber-orange"/> 
                          新增异常反馈
                      </h3>
                      <button onClick={() => setShowAnomalyModal(false)} className="text-cyber-muted hover:text-white transition-colors">
                          <X size={24} />
                      </button>
                  </div>
                  
                  <div className="p-6 space-y-4">
                      <div>
                          <label className="block text-xs text-cyber-blue mb-2 uppercase tracking-wider">关联工序名称</label>
                          
                          {/* Search Step Input */}
                          <div className="relative mb-1 group">
                             <Search className="absolute left-2 top-2.5 text-cyber-muted group-focus-within:text-cyber-orange transition-colors" size={14} />
                             <input 
                                 type="text"
                                 value={stepSearchTerm}
                                 onChange={(e) => setStepSearchTerm(e.target.value)}
                                 placeholder="搜索工序..."
                                 className="w-full bg-cyber-bg border border-cyber-muted/40 pl-8 p-2 text-white focus:border-cyber-orange focus:outline-none text-sm transition-all"
                             />
                          </div>

                          <select 
                             value={newAnomaly.stepName}
                             onChange={(e) => setNewAnomaly({...newAnomaly, stepName: e.target.value})}
                             className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-orange focus:outline-none text-sm"
                          >
                              <option value="">-- 请选择工序 --</option>
                              {selectedModel?.steps
                                  .filter(s => s.name.toLowerCase().includes(stepSearchTerm.toLowerCase()))
                                  .map(s => (
                                  <option key={s.id} value={s.name}>{s.name} ({s.parallelModule})</option>
                              ))}
                              <option value="OTHER">其他/整机</option>
                          </select>
                      </div>

                      <div>
                          <label className="block text-xs text-cyber-blue mb-2 uppercase tracking-wider">异常原因描述</label>
                          <textarea 
                              value={newAnomaly.reason}
                              onChange={(e) => setNewAnomaly({...newAnomaly, reason: e.target.value})}
                              rows={3}
                              placeholder="请详细描述异常情况..."
                              className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-orange focus:outline-none text-sm"
                          />
                      </div>
                      
                      <div>
                          <label className="block text-xs text-cyber-blue mb-2 uppercase tracking-wider">责任单位</label>
                          <select 
                                value={newAnomaly.department}
                                onChange={(e) => setNewAnomaly({...newAnomaly, department: e.target.value})}
                                className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-orange focus:outline-none text-sm"
                            >
                                <option value="">-- 请选择部门 --</option>
                                <option value="生产">生产</option>
                                <option value="电控">电控</option>
                                <option value="KA">KA</option>
                                <option value="应用">应用</option>
                                <option value="采购">采购</option>
                                <option value="生管">生管</option>
                                <option value="仓库">仓库</option>
                                <option value="设计">设计</option>
                                <option value="业务">业务</option>
                                <option value="其他">其他</option>
                            </select>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-xs text-cyber-blue mb-2 uppercase tracking-wider">发生时间</label>
                              <input 
                                  type="datetime-local"
                                  value={newAnomaly.startTime}
                                  onChange={(e) => setNewAnomaly({...newAnomaly, startTime: e.target.value})}
                                  className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-orange focus:outline-none text-sm"
                              />
                          </div>
                          <div>
                              <label className="block text-xs text-cyber-blue mb-2 uppercase tracking-wider">结束时间</label>
                              <input 
                                  type="datetime-local"
                                  value={newAnomaly.endTime}
                                  onChange={(e) => setNewAnomaly({...newAnomaly, endTime: e.target.value})}
                                  className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-orange focus:outline-none text-sm"
                              />
                          </div>
                      </div>
                      
                      <div className="bg-cyber-bg/50 p-3 border border-cyber-muted/20 flex justify-between items-center">
                          <span className="text-xs text-cyber-muted uppercase">自动计算异常天数 (8:30-17:30)</span>
                          <span className="text-lg font-bold text-cyber-orange">{newAnomaly.durationDays} 天</span>
                      </div>
                      
                      <button 
                          onClick={handleSaveAnomaly}
                          className="w-full bg-cyber-orange hover:bg-white text-black font-bold py-3 px-4 shadow-neon-orange transition-all flex items-center justify-center gap-2 mt-4"
                      >
                          <Save size={18} /> 提交异常记录
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Selection Column (Left) */}
      <div className="lg:col-span-1 flex flex-col h-[calc(100vh-140px)]">
        
        {/* Header & Workshop Tabs */}
        <div className="flex flex-col gap-3 mb-4">
            <div className="flex justify-between items-end border-b border-cyber-blue/30 pb-2">
                <h2 className="font-bold text-cyber-blue text-lg tracking-wide uppercase flex items-center gap-2">
                    选择机台
                </h2>
                {/* Workshop Filter Tabs */}
                <div className="flex gap-1">
                    {['ALL', 'K1', 'K2', 'K3'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setWorkshopTab(tab as any)}
                            className={`text-[10px] px-2 py-1 transition-colors rounded-t ${
                                workshopTab === tab 
                                ? 'bg-cyber-blue text-black font-bold' 
                                : 'text-cyber-muted hover:text-white bg-cyber-bg/50'
                            }`}
                        >
                            {tab === 'ALL' ? '总览' : tab}
                        </button>
                    ))}
                </div>
            </div>

            {/* Status Filter Tabs */}
            <div className="flex gap-2 bg-cyber-card/50 p-1 rounded border border-cyber-muted/20">
                {[
                    { key: 'ALL', label: '全部' },
                    { key: MachineStatus.IN_PROGRESS, label: '进行中' },
                    { key: MachineStatus.PLANNED, label: '排队中' },
                    { key: MachineStatus.COMPLETED, label: '已完成' },
                ].map((status) => (
                    <button
                        key={status.key}
                        onClick={() => setStatusTab(status.key as any)}
                        className={`flex-1 text-[10px] py-1.5 text-center transition-all rounded ${
                            statusTab === status.key
                            ? 'bg-cyber-blue/20 text-cyber-blue shadow-neon-blue border border-cyber-blue/30'
                            : 'text-cyber-muted hover:text-white hover:bg-white/5'
                        }`}
                    >
                        {status.label}
                    </button>
                ))}
            </div>
        </div>

        {/* Machine List - Refactored Structure for Corners */}
        <div className="bg-cyber-card rounded-none shadow-sm border border-cyber-blue/30 flex-1 relative flex flex-col min-h-0 overflow-hidden">
             
             {/* Tech Corners - Fixed to frame, Larger Size */}
             <div className="absolute top-0 left-0 w-6 h-6 border-l-2 border-t-2 border-cyber-blue z-20 pointer-events-none"></div>
             <div className="absolute top-0 right-0 w-6 h-6 border-r-2 border-t-2 border-cyber-blue z-20 pointer-events-none"></div>

             <div className="overflow-y-auto custom-scrollbar flex-1">
                {filteredOrders.length === 0 ? (
                    <div className="p-8 text-center flex flex-col items-center justify-center h-full text-cyber-muted opacity-60">
                        <Filter size={32} className="mb-2" />
                        <p className="text-sm">无符合条件的机台</p>
                    </div>
                ) : (
                    filteredOrders.map(order => {
                        // Use shared logic for consistent calculation in List & Detail
                        const { variance, projectedDate, closingDate } = calculateOrderMetrics(order);
                        const modelName = models.find(m => m.id === order.modelId)?.name.split(' ')[0] || '';

                        return (
                            <button
                                key={order.id}
                                onClick={() => setSelectedOrderId(order.id)}
                                className={`w-full text-left p-4 border-b border-cyber-muted/10 hover:bg-cyber-blue/5 transition-all focus:outline-none group relative ${
                                    selectedOrderId === order.id 
                                    ? 'bg-gradient-to-r from-cyber-blue/10 to-transparent border-l-4 border-l-cyber-blue' 
                                    : 'border-l-4 border-l-transparent'
                                }`}
                            >
                                <div className="flex justify-between items-start">
                                    {/* LEFT SIDE: ID, Z-Axis, Model, Workshop */}
                                    <div className="flex flex-col items-start gap-1">
                                        {/* Row 1: ID + Z-Axis */}
                                        <div className="flex items-baseline gap-1">
                                            <span className={`font-bold text-sm tracking-wide ${selectedOrderId === order.id ? 'text-white' : 'text-cyber-muted group-hover:text-white'}`}>
                                                {order.id}
                                            </span>
                                            {order.zAxisTravel && (
                                                <span className={`text-[10px] font-normal ${selectedOrderId === order.id ? 'text-white/80' : 'text-cyber-muted/70'}`}>
                                                    (Z{order.zAxisTravel.replace(/mm/gi, '').trim()})
                                                </span>
                                            )}
                                        </div>
                                    
                                        {/* Row 2: Model + Workshop */}
                                        <div className="flex items-center gap-2 text-[10px]">
                                            <span className={`font-medium ${selectedOrderId === order.id ? 'text-cyber-blue' : 'text-cyber-muted opacity-80'}`}>
                                                {modelName}
                                            </span>
                                            <span className="text-cyber-muted/30">|</span>
                                            <span className={`${selectedOrderId === order.id ? 'text-white/50' : 'text-cyber-muted/50'}`}>
                                                {order.workshop}
                                            </span>
                                        </div>
                                    </div>

                                    {/* RIGHT SIDE: Metrics & Status */}
                                    <div className="flex flex-col items-end gap-1">
                                        <div className="flex items-center gap-2">
                                            {/* Metrics Boxes - Enlarged and Right Aligned */}
                                            <div className="flex gap-1">
                                                {/* Variance Box */}
                                                {variance !== 0 && (
                                                    <div className={`flex flex-col items-center justify-center w-14 h-10 rounded border shadow-sm ${
                                                        variance > 0 ? 'border-cyber-orange/40 bg-cyber-orange/10' : 'border-green-500/40 bg-green-500/10'
                                                    }`}>
                                                        <span className="text-[10px] text-white font-bold mb-0.5 block drop-shadow-md">差异</span>
                                                        <div className={`flex items-center gap-0.5 text-xs font-bold leading-none ${variance > 0 ? 'text-cyber-orange' : 'text-green-400'}`}>
                                                            {variance > 0 && <AlertTriangle size={8}/>}
                                                            {variance > 0 ? `+${variance}` : variance}
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                {/* Planned Box (Dynamic) */}
                                                <div className="flex flex-col items-center justify-center w-14 h-10 rounded border border-cyber-blue/30 bg-cyber-bg/40 shadow-[0_0_5px_rgba(0,240,255,0.05)]">
                                                    <span className="text-[10px] text-white font-bold mb-0.5 block drop-shadow-md">生产完工</span>
                                                    <span className="text-xs font-bold text-cyber-blue leading-none">
                                                        {projectedDate.getMonth() + 1}/{projectedDate.getDate()}
                                                    </span>
                                                </div>

                                                {/* Closing Box */}
                                                <div className={`flex flex-col items-center justify-center w-14 h-10 rounded border shadow-[0_0_5px_rgba(0,240,255,0.05)] ${
                                                    variance > 0 ? 'border-cyber-orange/30 bg-cyber-orange/5' : 'border-cyber-blue/30 bg-cyber-bg/40'
                                                }`}>
                                                    <span className="text-[10px] text-white font-bold mb-0.5 block drop-shadow-md">结关</span>
                                                    <span className={`text-xs font-bold leading-none ${variance > 0 ? 'text-cyber-orange' : 'text-cyber-muted'}`}>
                                                        {closingDate ? `${closingDate.getMonth() + 1}/${closingDate.getDate()}` : '-'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Status Badge */}
                                            <span className={`h-10 flex items-center justify-center px-2 text-[10px] rounded uppercase border flex-shrink-0 ${
                                                order.status === MachineStatus.IN_PROGRESS ? 'border-cyber-blue/40 text-cyber-blue' :
                                                order.status === MachineStatus.PLANNED ? 'border-cyber-orange/40 text-cyber-orange' :
                                                'border-green-500/40 text-green-500'
                                            }`}>
                                                {order.status === MachineStatus.IN_PROGRESS ? '进行中' : 
                                                order.status === MachineStatus.PLANNED ? '排队中' : '完成'}
                                            </span>
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

      {/* Action Area (Right - Spanning 3 cols now) */}
      <div className="lg:col-span-3 h-[calc(100vh-140px)]">
        {selectedOrder && selectedModel ? (
            <div className="bg-cyber-card rounded-none shadow-neon-blue border border-cyber-blue/50 h-full flex flex-col relative overflow-hidden animate-fade-in">
                 {/* Background Tech Lines */}
                 <div className="absolute right-0 top-0 w-64 h-64 border-r border-t border-cyber-blue/10 opacity-30 rounded-tr-[100px] pointer-events-none"></div>

                {/* Header Section */}
                <div className="border-b border-cyber-blue/20 p-5 bg-cyber-bg/50 backdrop-blur-sm z-20">
                    <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
                        {/* Left: Machine Info */}
                        <div className="min-w-[200px]">
                            <div className="flex items-center gap-3 mb-1">
                                 <h2 className="text-3xl font-bold text-white tracking-widest">{selectedOrder.id}</h2>
                                 <span className="px-2 py-0.5 text-xs bg-cyber-bg border border-cyber-muted text-cyber-muted rounded">
                                     {selectedOrder.workshop}
                                 </span>
                                 
                                 {/* New Anomaly Button */}
                                 <button 
                                    onClick={handleOpenAnomalyModal}
                                    className="ml-2 bg-cyber-orange/10 border border-cyber-orange text-cyber-orange hover:bg-cyber-orange hover:text-black px-3 py-1 text-xs font-bold uppercase tracking-wider rounded flex items-center gap-1 transition-all shadow-neon-orange"
                                 >
                                     <Plus size={12}/> 新增异常
                                 </button>
                            </div>
                            <div className="flex items-center gap-2">
                                <p className="text-cyber-blue text-lg">{selectedModel.name}</p>
                                <span className="text-[10px] text-cyber-orange border border-cyber-orange/30 px-1 rounded bg-cyber-orange/5">
                                    {selectedOrder.holidayType === 'DOUBLE' ? '双休' : 
                                     selectedOrder.holidayType === 'SINGLE' ? '单休' :
                                     selectedOrder.holidayType === 'ALTERNATE' ? '隔周休' : '无休'}
                                </span>
                            </div>
                        </div>
                        
                        {/* Right: Metric Cards - Updated Visuals */}
                        {dateMetrics && (
                            <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 w-full xl:w-auto">
                                {/* Card 1: Start Date */}
                                <div className="bg-cyber-card/80 border border-cyber-blue/30 p-2 rounded flex flex-col items-center justify-center min-w-[90px] shadow-[0_0_10px_rgba(0,240,255,0.1)]">
                                    <span className="text-[11px] text-cyan-200/70 uppercase tracking-wider mb-1 font-bold">上线日</span>
                                    <span className="text-sm font-bold text-white drop-shadow-md">
                                        {dateMetrics.startDate ? `${dateMetrics.startDate.getMonth()+1}/${dateMetrics.startDate.getDate()}` : '--'}
                                    </span>
                                </div>

                                {/* Card 2: Variance Days */}
                                <div className={`bg-cyber-card/80 border p-2 rounded flex flex-col items-center justify-center min-w-[90px] shadow-sm ${
                                    dateMetrics.varianceDays > 0 ? 'border-cyber-orange/40 bg-cyber-orange/5' : 'border-green-500/40 bg-green-500/5'
                                }`}>
                                    <span className="text-[11px] text-cyan-200/70 uppercase tracking-wider mb-1 font-bold">差异天数</span>
                                    <div className={`flex items-center gap-1 text-sm font-bold drop-shadow-md ${
                                        dateMetrics.varianceDays > 0 ? 'text-cyber-orange' : 'text-green-400'
                                    }`}>
                                        {dateMetrics.varianceDays > 0 && <AlertTriangle size={12}/>}
                                        {dateMetrics.varianceDays > 0 ? `+${dateMetrics.varianceDays}` : dateMetrics.varianceDays}
                                    </div>
                                </div>

                                {/* Card 3: Projected Date */}
                                <div className="bg-cyber-card/80 border border-cyber-blue/30 p-2 rounded flex flex-col items-center justify-center min-w-[90px] shadow-[0_0_10px_rgba(0,240,255,0.1)]">
                                    <span className="text-[11px] text-cyan-200/70 uppercase tracking-wider mb-1 font-bold">生产完工</span>
                                    <span className="text-sm font-bold text-cyber-blue drop-shadow-md">
                                        {dateMetrics.projectedDate.getMonth()+1}/{dateMetrics.projectedDate.getDate()}
                                    </span>
                                </div>

                                {/* Card 4: Closing Date */}
                                <div className="bg-cyber-card/80 border border-cyber-blue/30 p-2 rounded flex flex-col items-center justify-center min-w-[90px] shadow-[0_0_10px_rgba(0,240,255,0.1)]">
                                    <span className="text-[11px] text-cyan-200/70 uppercase tracking-wider mb-1 font-bold">业务结关</span>
                                    <span className="text-sm font-bold text-white drop-shadow-md">
                                        {dateMetrics.closingDate ? `${dateMetrics.closingDate.getMonth()+1}/${dateMetrics.closingDate.getDate()}` : '--'}
                                    </span>
                                </div>

                                {/* Card 5: Material Rate */}
                                <div className="bg-cyber-card/80 border border-cyber-blue/30 p-2 rounded flex flex-col items-center justify-center min-w-[90px] shadow-[0_0_10px_rgba(0,240,255,0.1)]">
                                    <span className="text-[11px] text-cyan-200/70 uppercase tracking-wider mb-1 font-bold">发料率</span>
                                    <span className="text-sm font-bold text-white drop-shadow-md">
                                        {dateMetrics.materialRate}
                                    </span>
                                </div>

                                {/* Card 6: Production Progress */}
                                <div className="bg-cyber-card/80 border border-cyber-blue/30 p-2 rounded flex flex-col items-center justify-center min-w-[90px] shadow-[0_0_10px_rgba(0,240,255,0.1)]">
                                    <span className="text-[11px] text-cyan-200/70 uppercase tracking-wider mb-1 font-bold">生产进度</span>
                                    <span className={`text-sm font-bold drop-shadow-md ${progressPercentage === 100 ? 'text-green-400' : 'text-cyber-blue'}`}>
                                        {progressPercentage}%
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Content Area - Scrollable */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 relative z-10">
                    
                    {/* Anomaly Alert Section - Collapsible */}
                    {selectedOrder.anomalies && selectedOrder.anomalies.length > 0 && (
                        <div className={`relative rounded-lg transition-all duration-300 mb-6 ${
                            isAnomaliesCollapsed
                            ? 'h-px bg-transparent border-0 border-t border-cyber-orange/30 mt-8'
                            : 'p-4 pt-8 border border-cyber-orange/30 bg-cyber-orange/5 shadow-[0_0_15px_rgba(255,136,0,0.1)]'
                        }`}>
                            {/* Header Badge - Clickable to toggle */}
                            <div 
                                onClick={() => setIsAnomaliesCollapsed(!isAnomaliesCollapsed)}
                                className="absolute -top-3 left-4 bg-cyber-card px-2 py-0.5 text-xs font-bold rounded uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all z-10 select-none shadow-[0_0_10px_rgba(0,0,0,0.5)] text-cyber-orange border border-cyber-orange hover:bg-cyber-orange hover:text-black"
                            >
                                <AlertTriangle size={12}/> 
                                异常反馈 ({selectedOrder.anomalies.length})
                                <div className="ml-2 pl-2 border-l border-cyber-orange/30 flex items-center">
                                     {isAnomaliesCollapsed ? <ChevronDown size={14}/> : <ChevronUp size={14}/>}
                                </div>
                            </div>

                             {!isAnomaliesCollapsed && (
                                 <div className="space-y-2 animate-fade-in">
                                     {selectedOrder.anomalies.map((anomaly) => (
                                         <div key={anomaly.id} className="bg-cyber-bg border border-cyber-orange/30 p-3 rounded flex items-center justify-between text-xs hover:border-cyber-orange transition-colors">
                                             <div className="flex items-center gap-3">
                                                 <AlertTriangle size={16} className="text-cyber-orange" />
                                                 <div>
                                                     <div className="font-bold text-white">异常反馈: {anomaly.stepName}</div>
                                                     <div className="text-cyber-muted">原因: {anomaly.reason} | 责任: {anomaly.department}</div>
                                                 </div>
                                             </div>
                                             <div className="text-right">
                                                 <div className="text-cyber-orange">{anomaly.durationDays} 天</div>
                                                 <div className="text-cyber-muted opacity-60">{new Date(anomaly.startTime).toLocaleDateString()}</div>
                                             </div>
                                         </div>
                                     ))}
                                 </div>
                             )}
                        </div>
                    )}

                    {selectedOrder.status === MachineStatus.PLANNED ? (
                         <div className="text-center py-20 flex flex-col items-center justify-center h-full">
                            <div className="w-24 h-24 bg-cyber-orange/10 rounded-full flex items-center justify-center mb-6 border border-cyber-orange/30 shadow-[0_0_30px_rgba(255,136,0,0.2)]">
                                <AlertCircle className="w-12 h-12 text-cyber-orange animate-pulse" />
                            </div>
                            <h3 className="text-xl text-white font-bold mb-2">准备投产</h3>
                            <button 
                                onClick={() => handleStartOrder(selectedOrder.id)}
                                className="mt-6 group bg-cyber-blue hover:bg-white text-black font-bold py-4 px-12 shadow-neon-blue transition-all flex items-center justify-center tracking-wider hover:scale-105"
                            >
                                <Play size={20} className="mr-3 group-hover:text-black" /> 启动生产流程
                            </button>
                         </div>
                    ) : (
                        <div className="space-y-8 pb-10">
                            {/* Render Parallel Modules */}
                            {Object.entries(groupedSteps).map(([parallelMod, steps]) => {
                                // Count active/completed in this module
                                const moduleCompleted = steps.filter(s => selectedOrder.stepStates?.[s.id]?.status === 'COMPLETED').length;
                                const moduleActive = steps.filter(s => selectedOrder.stepStates?.[s.id]?.status === 'IN_PROGRESS').length;
                                const isCollapsed = collapsedModules[parallelMod];
                                const isModuleFullyComplete = steps.length > 0 && moduleCompleted === steps.length;
                                
                                // --- New Schedule Expansion Logic: Multi-day steps occupy multiple blocks ---
                                // Pre-calculate dates for ALL steps/days in this module for Grid rendering
                                let pendingStepCursor = selectedOrder.startDate ? new Date(selectedOrder.startDate) : new Date();

                                // Flatten Steps into Day-Slots
                                const dailyAllocations: Array<{
                                    date: Date,
                                    step: ProcessStep,
                                    status: StepStatusEnum,
                                    partLabel: string
                                }> = [];

                                steps.forEach(step => {
                                    const stepState = selectedOrder.stepStates?.[step.id] || { status: 'PENDING' };
                                    
                                    // Determine Start Date for this step
                                    let currentStepDate = new Date();
                                    
                                    if (stepState.status === 'COMPLETED' && stepState.endTime) {
                                        // Fix: Use actual EndTime for COMPLETED steps instead of projected timeline
                                        currentStepDate = new Date(stepState.endTime);
                                        // Sync cursor to this completion time so subsequent PENDING steps start after this
                                        pendingStepCursor = new Date(stepState.endTime);
                                    } else if (stepState.status === 'IN_PROGRESS' && stepState.startTime) {
                                        currentStepDate = new Date(stepState.startTime);
                                        // Reset cursor to track this real-time start
                                        pendingStepCursor = new Date(currentStepDate);
                                    } else {
                                        // Pending
                                        currentStepDate = new Date(pendingStepCursor);
                                    }

                                    // Determine duration in days (Assume 8h/day)
                                    // e.g. 16h = 2 days
                                    const daysRequired = Math.ceil(step.estimatedHours / 8) || 1;

                                    for (let i = 1; i <= daysRequired; i++) {
                                        // Add allocation for this day
                                        dailyAllocations.push({
                                            date: new Date(currentStepDate),
                                            step: step,
                                            status: stepState.status || 'PENDING',
                                            partLabel: daysRequired > 1 ? `(${i}/${daysRequired})` : ''
                                        });

                                        // Advance cursor to next working day
                                        const nextDay = calculateProjectedDate(currentStepDate, 8, selectedOrder.holidayType);
                                        currentStepDate = nextDay;
                                    }

                                    // Update global cursor for NEXT step
                                    
                                    if (stepState.status !== 'COMPLETED') {
                                        pendingStepCursor = currentStepDate;
                                    }
                                });


                                // Group Steps by Week (Row)
                                // We use dailyAllocations now
                                const weeks: Record<string, typeof dailyAllocations> = {};
                                dailyAllocations.forEach(alloc => {
                                    const d = new Date(alloc.date);
                                    // Get Start of Week (Monday)
                                    const day = d.getDay();
                                    const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
                                    const monday = new Date(d.setDate(diff));
                                    monday.setHours(0,0,0,0);
                                    
                                    const key = monday.toISOString();
                                    if (!weeks[key]) weeks[key] = [];
                                    weeks[key].push(alloc);
                                });

                                // Sort weeks
                                const sortedWeekKeys = Object.keys(weeks).sort((a,b) => new Date(a).getTime() - new Date(b).getTime());

                                return (
                                    <div key={parallelMod} className={`relative rounded-lg transition-all duration-300 mb-6 ${isCollapsed ? 'h-px bg-transparent border-0 border-t border-cyber-muted/20 mt-8' : `p-0 pt-8 border ${isModuleFullyComplete ? 'border-green-500/50 bg-green-500/5 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 'border-cyber-muted/20 bg-cyber-card/30 hover:border-cyber-blue/30'}`}`}>
                                        
                                        {/* Header Badge - Clickable to toggle */}
                                        <div 
                                            onClick={() => toggleModule(parallelMod)}
                                            className={`absolute -top-3 left-4 bg-cyber-card px-2 py-0.5 text-xs font-bold rounded uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all z-10 select-none shadow-[0_0_10px_rgba(0,0,0,0.5)] ${isModuleFullyComplete ? 'text-green-500 border border-green-500 hover:bg-green-500/10' : 'text-cyber-blue border border-cyber-blue/30 hover:bg-cyber-blue/10 hover:border-cyber-blue'}`}
                                        >
                                            <Layers size={12}/> 
                                            {parallelMod}
                                            {isModuleFullyComplete ? (
                                                <CheckCircle size={12} className="ml-1" strokeWidth={3} />
                                            ) : (
                                                moduleActive > 0 && <span className="w-2 h-2 rounded-full bg-cyber-blue animate-pulse shadow-neon-blue"></span>
                                            )}
                                            <div className={`ml-2 pl-2 border-l flex items-center ${isModuleFullyComplete ? 'border-green-500/30' : 'border-cyber-blue/20 opacity-70 group-hover:opacity-100'}`}>
                                                {isCollapsed ? <ChevronDown size={14}/> : <ChevronUp size={14}/>}
                                            </div>
                                        </div>

                                        <div className={`absolute -top-3 right-4 text-[10px] bg-cyber-card px-2 py-0.5 border rounded select-none z-10 ${isModuleFullyComplete ? 'text-green-500 border-green-500/50' : 'text-cyber-muted border-cyber-muted/20'}`}>
                                            进度: {moduleCompleted}/{steps.length}
                                        </div>

                                        {!isCollapsed && (
                                            <div className="p-4 animate-fade-in">
                                                {/* Week Header */}
                                                <div className="grid grid-cols-7 gap-1 mb-2 text-center">
                                                    {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map(day => (
                                                        <div key={day} className="text-[10px] text-cyber-muted uppercase tracking-wider font-bold py-1 bg-cyber-bg/50 border border-cyber-muted/10">
                                                            {day}
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Weekly Rows */}
                                                <div className="space-y-1">
                                                    {sortedWeekKeys.map(weekKey => {
                                                        const weekSteps = weeks[weekKey];
                                                        const weekDate = new Date(weekKey);
                                                        
                                                        return (
                                                            <div key={weekKey} className="relative group/week">
                                                                <div className="grid grid-cols-7 gap-1 min-h-[60px] border-b border-cyber-muted/5 pb-1">
                                                                    {[0, 1, 2, 3, 4, 5, 6].map(dayIndex => {
                                                                        // Find steps for this specific day index (Mon=0...Sun=6)
                                                                        const targetJsDay = (dayIndex + 1) % 7;
                                                                        const dayAllocations = weekSteps.filter(s => s.date.getDay() === targetJsDay);

                                                                        return (
                                                                            <div key={dayIndex} className="bg-cyber-bg/20 border border-cyber-muted/5 p-1 relative min-h-[60px]">
                                                                                {/* Date Label Inside Grid (Monday only) */}
                                                                                {dayIndex === 0 && (
                                                                                    <div className="absolute top-1 right-1 text-[9px] text-white/70 font-mono leading-none pointer-events-none">
                                                                                        {weekDate.getMonth()+1}/{weekDate.getDate()}
                                                                                    </div>
                                                                                )}

                                                                                <div className="flex flex-col gap-1">
                                                                                    {dayAllocations.map((alloc, i) => {
                                                                                        const step = alloc.step;
                                                                                        let cardStyle = 'bg-cyber-bg/80 border-cyber-muted/20 text-cyber-muted hover:border-cyber-blue/50 hover:text-white';
                                                                                        if (alloc.status === 'IN_PROGRESS') {
                                                                                            cardStyle = 'bg-cyber-blue/20 border-cyber-blue text-white shadow-neon-blue';
                                                                                        } else if (alloc.status === 'COMPLETED') {
                                                                                            cardStyle = 'bg-green-500/10 border-green-500/30 text-green-400 opacity-80';
                                                                                        }

                                                                                        return (
                                                                                            <button
                                                                                                key={`${step.id}-${i}`}
                                                                                                onClick={() => handleStepClick(step)}
                                                                                                className={`text-left p-1.5 rounded border text-[10px] w-full transition-all flex flex-col gap-1 mb-1 ${cardStyle}`}
                                                                                                title={`${step.name} (${step.estimatedHours}H)`}
                                                                                            >
                                                                                                {alloc.status === 'COMPLETED' ? (
                                                                                                    <div className="flex items-center gap-1 w-full">
                                                                                                        <CheckCircle size={12} className="flex-shrink-0" />
                                                                                                        <span className="truncate">{step.name} {alloc.partLabel}</span>
                                                                                                    </div>
                                                                                                ) : (
                                                                                                    <>
                                                                                                        <div className="flex items-center gap-2 w-full opacity-80 mb-0.5">
                                                                                                             <div className="text-[9px] border border-current px-1 rounded leading-none whitespace-nowrap text-cyber-muted">
                                                                                                                {step.module}
                                                                                                            </div>
                                                                                                            <div className="text-[10px] font-mono leading-none text-cyber-muted">
                                                                                                                {step.estimatedHours}H {alloc.partLabel}
                                                                                                            </div>
                                                                                                        </div>
                                                                                                        <div className="leading-snug font-bold break-words text-sm text-left">
                                                                                                            {step.name}
                                                                                                        </div>
                                                                                                    </>
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
                    <Settings className="text-cyber-muted" size={40} />
                </div>
                <p className="text-xl font-bold tracking-widest text-white mb-2">等待指令</p>
                <p className="text-sm text-cyber-blue">请从左侧列表选择机台以开始操作...</p>
            </div>
        )}
      </div>
    </div>
  );
};
