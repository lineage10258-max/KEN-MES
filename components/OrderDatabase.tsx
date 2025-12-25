
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MachineModel, WorkOrder, MachineStatus, HolidayType } from '../types';
import { calculateOrderCompletionDate } from '../services/holidayService';
import { Plus, Disc, Factory, Save, Filter, Edit, Trash2, X, Search, ChevronDown, CheckSquare, Square, PauseCircle, PlayCircle, CheckCircle2, Loader2, Settings, AlertTriangle, AlertOctagon } from 'lucide-react';

interface OrderDatabaseProps {
  orders: WorkOrder[];
  models: MachineModel[];
  onAddOrder: (order: WorkOrder) => Promise<void> | void;
  onUpdateOrder: (order: WorkOrder, originalId?: string) => Promise<void> | void;
  onDeleteOrder: (id: string) => void;
}

const WORKSHOP_OPTIONS = [
    { value: 'K1廠', label: 'K1廠' },
    { value: 'K2廠', label: 'K2廠' },
    { value: 'K3廠', label: 'K3廠' },
];

const STATUS_OPTIONS = [
    { value: MachineStatus.PLANNED, label: '計畫中', color: 'text-cyber-muted' },
    { value: MachineStatus.IN_PROGRESS, label: '進行中', color: 'text-cyber-blue' },
    { value: MachineStatus.HALTED, label: '已暫停', color: 'text-red-500' },
    { value: MachineStatus.COMPLETED, label: '已完成', color: 'text-green-500' },
];

const MultiSelectFilter: React.FC<{
    label: string;
    options: { value: string; label: string; color?: string }[];
    selectedValues: string[];
    onChange: (values: string[]) => void;
    icon?: React.ReactNode;
}> = ({ label, options, selectedValues, onChange, icon }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    const toggleOption = (value: string) => {
        if (selectedValues.includes(value)) onChange(selectedValues.filter(v => v !== value));
        else onChange([...selectedValues, value]);
    };
    const isAllSelected = selectedValues.length === 0;
    return (
        <div className="relative" ref={containerRef}>
            <button onClick={() => setIsOpen(!isOpen)} className={`flex items-center gap-2 px-3 py-2 text-sm font-mono border rounded transition-all min-w-[140px] justify-between ${isOpen || !isAllSelected ? 'bg-cyber-blue/10 border-cyber-blue text-white shadow-neon-blue' : 'bg-cyber-bg border-cyber-muted/30 text-cyber-muted hover:text-white hover:border-cyber-muted'}`}>
                <div className="flex items-center gap-2 overflow-hidden">{icon && <span className={!isAllSelected ? 'text-cyber-blue' : ''}>{icon}</span>}<span className="truncate max-w-[100px] font-sans font-bold">{isAllSelected ? label : `${label} (${selectedValues.length})`}</span></div>
                <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-cyber-card border border-cyber-blue/30 shadow-xl z-50 rounded overflow-hidden animate-fade-in">
                    <div className="p-2 border-b border-cyber-muted/20 bg-cyber-bg/50 flex justify-between items-center"><span className="text-[10px] text-cyber-muted uppercase tracking-wider font-sans font-bold">多選篩選</span>{!isAllSelected && <button onClick={() => onChange([])} className="text-[10px] text-cyber-blue hover:text-white underline font-sans">清除已選</button>}</div>
                    <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">{options.map(opt => { const isSelected = selectedValues.includes(opt.value); return ( <div key={opt.value} onClick={() => toggleOption(opt.value)} className={`flex items-center gap-3 p-2 cursor-pointer rounded hover:bg-white/5 transition-colors text-sm font-mono ${isSelected ? 'text-white' : 'text-cyber-muted'}`}>{isSelected ? <CheckSquare size={16} className="text-cyber-blue" /> : <Square size={16} className="opacity-50" />}<span className={`${opt.color} font-sans font-bold`}>{opt.label}</span></div> ); })}</div>
                </div>
            )}
        </div>
    );
};

export const OrderDatabase: React.FC<OrderDatabaseProps> = ({ orders, models, onAddOrder, onUpdateOrder, onDeleteOrder }) => {
  const [activeTab, setActiveTab] = useState<'LIST' | 'CREATE'>('LIST');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWorkshops, setSelectedWorkshops] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [filterModel, setFilterModel] = useState('ALL'); 
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Custom Confirmation Modal State
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  // Form States
  const [selectedModelId, setSelectedModelId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [workshop, setWorkshop] = useState('K1廠');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [businessDate, setBusinessDate] = useState('');
  const [holidayType, setHolidayType] = useState<HolidayType>('DOUBLE');
  const [clientName, setClientName] = useState('');
  const [axisHead, setAxisHead] = useState('');
  const [toolHolderSpec, setToolHolderSpec] = useState('');
  const [magazineCount, setMagazineCount] = useState('');
  const [zAxisTravel, setZAxisTravel] = useState('');
  const [spindleSpeed, setSpindleSpeed] = useState('');
  const [issuanceRate, setIssuanceRate] = useState('');
  const [projectName, setProjectName] = useState('');
  const [status, setStatus] = useState<MachineStatus>(MachineStatus.PLANNED);

  const safeFormatDate = (isoString?: string) => {
      if (!isoString) return '';
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
  };

  useEffect(() => {
    if (editingOrderId) {
      const order = orders.find(o => o.id === editingOrderId);
      if (order) {
        console.log("[OrderDB] Loading Order Data for Editing:", order.id);
        setMachineId(order.id);
        setSelectedModelId(order.modelId);
        setWorkshop(order.workshop || 'K1廠');
        setStartDate(safeFormatDate(order.startDate) || new Date().toISOString().split('T')[0]);
        setBusinessDate(safeFormatDate(order.businessClosingDate));
        setHolidayType(order.holidayType || 'DOUBLE');
        setClientName(order.clientName || '');
        setAxisHead(order.axisHead || '');
        setToolHolderSpec(order.toolHolderSpec || '');
        setMagazineCount(order.magazineCount || '');
        setZAxisTravel(order.zAxisTravel || '');
        setSpindleSpeed(order.spindleSpeed || '');
        setIssuanceRate(order.issuanceRate || '');
        setProjectName(order.projectName || '');
        setStatus(order.status || MachineStatus.PLANNED);
        setActiveTab('CREATE');
      }
    }
  }, [editingOrderId, orders]);

  const handleResetForm = () => {
    console.log("[OrderDB] Resetting Form");
    setEditingOrderId(null);
    setMachineId('');
    setSelectedModelId('');
    setWorkshop('K1廠');
    setStartDate(new Date().toISOString().split('T')[0]);
    setBusinessDate('');
    setHolidayType('DOUBLE');
    setClientName('');
    setAxisHead('');
    setToolHolderSpec('');
    setMagazineCount('');
    setZAxisTravel('');
    setSpindleSpeed('');
    setIssuanceRate('');
    setProjectName('');
    setStatus(MachineStatus.PLANNED);
    setIsSubmitting(false);
    setShowArchiveConfirm(false);
  };

  const editingOrderProgress = useMemo(() => {
      if (!editingOrderId) return 0;
      const order = orders.find(o => o.id === editingOrderId);
      const model = models.find(m => m.id === order?.modelId);
      if (!order || !model) return 0;
      const totalSteps = model.steps.length;
      const doneSteps = Object.values(order.stepStates || {}).filter((s: any) => s.status === 'COMPLETED' || s.status === 'SKIPPED').length;
      const progress = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;
      return progress;
  }, [editingOrderId, orders, models]);

  const handleSaveOrder = async (forcedStatus?: MachineStatus): Promise<boolean> => {
    console.log("[handleSaveOrder] Start. ForcedStatus:", forcedStatus);
    
    if (!machineId || !selectedModelId || !startDate) {
      console.error("[handleSaveOrder] Validation Failed - Mandatory fields missing");
      alert('請填寫機台號、選擇工藝模型並設置上線日期');
      return false;
    }

    setIsSubmitting(true);
    
    try {
        const model = models.find(m => m.id === selectedModelId);
        if (!model) throw new Error(`找不到工藝模型: ${selectedModelId}`);

        const parseDate = (d: string) => {
            const dateObj = new Date(d);
            return isNaN(dateObj.getTime()) ? null : dateObj.toISOString();
        };

        const existingOrder = editingOrderId ? orders.find(o => o.id === editingOrderId) : null;

        const orderData: WorkOrder = {
          id: machineId,
          modelId: selectedModelId,
          workshop,
          startDate: parseDate(startDate) || new Date().toISOString(),
          businessClosingDate: businessDate ? (parseDate(businessDate) || undefined) : undefined,
          holidayType,
          clientName,
          axisHead,
          toolHolderSpec,
          magazineCount,
          zAxisTravel,
          spindleSpeed,
          issuanceRate,
          projectName,
          status: forcedStatus || status, 
          currentStepIndex: existingOrder?.currentStepIndex || 0,
          stepStates: existingOrder?.stepStates || {},
          logs: existingOrder?.logs || [],
          anomalies: existingOrder?.anomalies || [],
          estimatedCompletionDate: '', 
        };

        // 計算預計完工日
        const ect = calculateOrderCompletionDate(orderData, model);
        orderData.estimatedCompletionDate = ect.toISOString();
        orderData.originalEstimatedCompletionDate = existingOrder?.originalEstimatedCompletionDate || ect.toISOString();

        console.log("[handleSaveOrder] Dispatching update for:", orderData.id);

        if (editingOrderId) {
          await onUpdateOrder(orderData, editingOrderId);
        } else {
          await onAddOrder(orderData);
        }

        console.log("[handleSaveOrder] Update complete. Navigating back.");
        handleResetForm();
        setActiveTab('LIST');
        return true;
    } catch (err: any) {
        console.error("[handleSaveOrder] CRITICAL ERROR:", err);
        alert(`儲存失敗: ${err.message || '發生未知錯誤'}`);
        return false;
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleFinalizeArchive = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("[FinalizeArchive] Requesting Archive Confirmation");
      
      if (isSubmitting) return;
      if (!editingOrderId) return;

      // Show the custom modal instead of window.confirm
      setShowArchiveConfirm(true);
  };

  const executeArchive = async () => {
      console.log("[FinalizeArchive] Confirmation Received. Executing...");
      const success = await handleSaveOrder(MachineStatus.COMPLETED);
      if (success) {
          console.log("[FinalizeArchive] Archive successful.");
          setShowArchiveConfirm(false);
      } else {
          console.error("[FinalizeArchive] Archive failed.");
      }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchSearch = o.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (o.clientName || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchWorkshop = selectedWorkshops.length === 0 || selectedWorkshops.includes(o.workshop);
      const matchStatus = selectedStatuses.length === 0 || selectedStatuses.includes(o.status);
      const matchModel = filterModel === 'ALL' || o.modelId === filterModel;
      return matchSearch && matchWorkshop && matchStatus && matchModel;
    }).sort((a, b) => {
        const dateA = a.businessClosingDate ? new Date(a.businessClosingDate).getTime() : Number.MAX_SAFE_INTEGER;
        const dateB = b.businessClosingDate ? new Date(b.businessClosingDate).getTime() : Number.MAX_SAFE_INTEGER;
        return dateA - dateB;
    });
  }, [orders, searchTerm, selectedWorkshops, selectedStatuses, filterModel]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 font-sans">
      {/* 自定義歸檔確認模態框 */}
      {showArchiveConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
            <div className="bg-cyber-card border border-cyber-orange shadow-neon-orange max-w-md w-full relative overflow-hidden animate-scale-up">
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none -mr-4 -mt-4">
                    <AlertOctagon size={140} className="text-cyber-orange" />
                </div>
                
                <div className="bg-cyber-orange/10 p-5 border-b border-cyber-orange/30 flex justify-between items-center relative z-10">
                    <h3 className="text-xl font-bold text-white tracking-widest flex items-center gap-3">
                        <AlertTriangle size={24} className="text-cyber-orange animate-pulse" />
                        系統操作確認
                    </h3>
                    <button onClick={() => setShowArchiveConfirm(false)} className="text-cyber-muted hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-8 relative z-10">
                    <p className="text-cyber-text text-sm leading-relaxed mb-6">
                        您即將對機台 <span className="text-cyber-orange font-mono font-bold text-lg">{editingOrderId}</span> 執行正式完工歸檔。
                    </p>
                    <div className="bg-black/40 border border-cyber-muted/20 p-4 rounded-sm space-y-2 mb-8">
                        <div className="flex items-center gap-2 text-[10px] text-cyber-muted uppercase tracking-widest font-bold">
                            <CheckCircle2 size={12} className="text-green-500" /> 狀態將變更為「已完成」
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-cyber-muted uppercase tracking-widest font-bold">
                            <CheckCircle2 size={12} className="text-green-500" /> 將從看板中移除
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-cyber-muted uppercase tracking-widest font-bold">
                            <CheckCircle2 size={12} className="text-green-500" /> 數據將封存備份
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <button 
                            onClick={() => setShowArchiveConfirm(false)}
                            className="flex-1 bg-transparent border border-cyber-muted/40 text-cyber-muted hover:text-white hover:border-white py-3 font-bold uppercase tracking-widest text-xs transition-all"
                        >
                            取消操作
                        </button>
                        <button 
                            onClick={executeArchive}
                            disabled={isSubmitting}
                            className="flex-1 bg-cyber-orange hover:bg-white text-black font-black py-3 px-4 shadow-neon-orange transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs hover:scale-105 disabled:opacity-50"
                        >
                            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            確認歸檔
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      <div className="flex border-b border-cyber-blue/30 mb-6">
        <button 
          onClick={() => { setActiveTab('LIST'); handleResetForm(); }}
          className={`px-6 py-3 font-mono text-sm transition-all font-bold ${activeTab === 'LIST' ? 'bg-cyber-blue/10 text-cyber-blue border-b-2 border-cyber-blue' : 'text-cyber-muted hover:text-white'}`}
        >
          [ 機台名錄 ]
        </button>
        <button 
          onClick={() => setActiveTab('CREATE')}
          className={`px-6 py-3 font-mono text-sm transition-all font-bold ${activeTab === 'CREATE' ? 'bg-cyber-blue/10 text-cyber-blue border-b-2 border-cyber-blue' : 'text-cyber-muted hover:text-white'}`}
        >
          [ {editingOrderId ? '編輯機台數據' : '機台投產登記'} ]
        </button>
      </div>

      {activeTab === 'CREATE' ? (
        <div className="bg-cyber-card border border-cyber-blue/30 p-8 shadow-neon-blue relative overflow-hidden animate-fade-in">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><Factory size={120} className="text-cyber-blue" /></div>
          
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
              {editingOrderId ? <Edit size={20} className="text-cyber-orange" /> : <Plus size={20} className="text-cyber-blue" />}
              {editingOrderId ? `正在編輯機台: ${editingOrderId}` : '機台投產登記'}
            </h2>
            <button onClick={() => { handleResetForm(); setActiveTab('LIST'); }} className="text-cyber-muted hover:text-white flex items-center gap-1 text-xs transition-colors">
              <X size={14} /> 取消編輯
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-mono text-cyber-blue mb-1 uppercase font-bold tracking-wider">機台號 (SN) <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  value={machineId}
                  onChange={(e) => setMachineId(e.target.value)}
                  className="w-full bg-cyber-bg border border-cyber-muted/40 p-3 text-white focus:border-cyber-blue outline-none font-mono text-sm shadow-inner"
                  placeholder="SN-202X-XXX"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-cyber-blue mb-1 uppercase font-bold tracking-wider">工藝模型 <span className="text-red-500">*</span></label>
                <select 
                  value={selectedModelId}
                  onChange={(e) => setSelectedModelId(e.target.value)}
                  className="w-full bg-cyber-bg border border-cyber-muted/40 p-3 text-white focus:border-cyber-blue outline-none font-mono text-sm"
                >
                  <option value="">-- 選擇機型工藝 --</option>
                  {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-mono text-cyber-blue mb-1 uppercase font-bold tracking-wider">生產廠區</label>
                <select 
                  value={workshop}
                  onChange={(e) => setWorkshop(e.target.value)}
                  className="w-full bg-cyber-bg border border-cyber-muted/40 p-3 text-white focus:border-cyber-blue outline-none font-mono text-sm font-bold"
                >
                  {WORKSHOP_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-xs font-mono text-cyber-blue mb-1 uppercase font-bold tracking-wider">客戶名稱</label>
                <input 
                  type="text" 
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full bg-cyber-bg border border-cyber-muted/40 p-3 text-white focus:border-cyber-blue outline-none font-mono text-sm"
                  placeholder="例如：大前機床"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-cyber-blue mb-1 uppercase font-bold tracking-wider">計畫上線日期 <span className="text-red-500">*</span></label>
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-cyber-bg border border-cyber-muted/40 p-3 text-white focus:border-cyber-blue outline-none font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-cyber-orange mb-1 uppercase font-bold tracking-wider">業務結關日期 (ERP)</label>
                <input 
                  type="date" 
                  value={businessDate}
                  onChange={(e) => setBusinessDate(e.target.value)}
                  className="w-full bg-cyber-bg border border-cyber-orange/30 p-3 text-white focus:border-cyber-orange outline-none font-mono text-sm"
                />
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-xs font-mono text-cyber-blue mb-1 uppercase font-bold tracking-wider">假日別</label>
                <select 
                  value={holidayType}
                  onChange={(e) => setHolidayType(e.target.value as HolidayType)}
                  className="w-full bg-cyber-bg border border-cyber-muted/40 p-3 text-white focus:border-cyber-blue outline-none font-mono text-sm"
                >
                  <option value="DOUBLE">雙休 (六/日)</option>
                  <option value="SINGLE">單休 (日)</option>
                  <option value="ALTERNATE">隔週休</option>
                  <option value="NONE">無休</option>
                </select>
              </div>

              {editingOrderId && (
                <div className="bg-cyber-bg/50 border border-cyber-blue/20 p-4 rounded-sm shadow-inner relative z-[100]">
                  <label className="block text-xs font-mono text-cyber-orange mb-3 uppercase font-bold tracking-wider">生產狀態控制</label>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between px-2 py-1 mb-1">
                      <span className="text-[10px] text-cyber-muted">目前狀態:</span>
                      <span className={`text-xs font-bold ${
                        status === MachineStatus.IN_PROGRESS ? 'text-cyber-blue' : 
                        status === MachineStatus.HALTED ? 'text-red-500' : 
                        status === MachineStatus.COMPLETED ? 'text-green-400' : 'text-white'
                      }`}>
                        {status === MachineStatus.IN_PROGRESS ? '正在生產中' : 
                         status === MachineStatus.HALTED ? '已暫停生產' : 
                         status === MachineStatus.PLANNED ? '排隊計畫中' : '已完工歸檔'}
                      </span>
                    </div>
                    
                    {/* 進度達到 100% 且狀態非已完成時，顯示歸檔按鈕 */}
                    {editingOrderProgress >= 100 && status !== MachineStatus.COMPLETED && (
                      <button 
                        type="button"
                        id="finalize-archive-btn"
                        onClick={handleFinalizeArchive}
                        disabled={isSubmitting}
                        style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-green-500/20 border-2 border-green-500/80 text-green-400 hover:bg-green-500 hover:text-black transition-all font-bold text-sm uppercase tracking-widest shadow-[0_0_20px_rgba(34,197,94,0.5)] animate-pulse mb-1 disabled:opacity-50 disabled:cursor-wait relative z-[101]"
                      >
                        {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                        正式完工歸檔 (FINALIZE)
                      </button>
                    )}

                    {status === MachineStatus.IN_PROGRESS && (
                      <button 
                        type="button"
                        onClick={() => setStatus(MachineStatus.HALTED)}
                        disabled={isSubmitting}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-500/10 border border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white transition-all font-bold text-xs uppercase tracking-widest shadow-[0_0_10px_rgba(239,68,68,0.2)] disabled:opacity-50"
                      >
                        <PauseCircle size={16} /> 暫停生產 (HALT)
                      </button>
                    )}
                    
                    {status === MachineStatus.HALTED && (
                      <button 
                        type="button"
                        onClick={() => setStatus(MachineStatus.IN_PROGRESS)}
                        disabled={isSubmitting}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-cyber-blue/10 border border-cyber-blue/50 text-cyber-blue hover:bg-cyber-blue hover:text-black transition-all font-bold text-xs uppercase tracking-widest shadow-neon-blue disabled:opacity-50"
                      >
                        <PlayCircle size={16} /> 恢復生產 (RESUME)
                      </button>
                    )}
                    
                    {status === MachineStatus.PLANNED && (
                        <div className="text-[10px] text-cyber-muted text-center italic mt-1 font-bold">機台尚未投產，請至「工作站」啟動流程。</div>
                    )}

                    {status === MachineStatus.COMPLETED && (
                        <div className="text-[10px] text-green-400/60 text-center italic mt-1 font-bold">本機台已完成生產並歸檔封存。</div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-mono text-cyber-blue mb-1 uppercase font-bold tracking-wider">項目/專案名稱</label>
                <input 
                  type="text" 
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full bg-cyber-bg border border-cyber-muted/40 p-3 text-white focus:border-cyber-blue outline-none font-mono text-sm"
                />
              </div>
            </div>
          </div>

          <div className="mt-10 border-t border-cyber-muted/20 pt-8">
            <h3 className="text-sm font-bold text-cyber-blue mb-6 uppercase tracking-[0.2em] flex items-center gap-2">
                <Settings size={16} /> 技術規格配置
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <label className="block text-[10px] font-mono text-cyber-muted mb-1 font-bold">二軸頭型號</label>
                <input type="text" value={axisHead} onChange={e => setAxisHead(e.target.value)} className="w-full bg-cyber-bg border border-cyber-muted/20 p-2 text-white text-xs outline-none focus:border-cyber-blue transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-cyber-muted mb-1 font-bold">刀柄規格</label>
                <input type="text" value={toolHolderSpec} onChange={e => setToolHolderSpec(e.target.value)} className="w-full bg-cyber-bg border border-cyber-muted/20 p-2 text-white text-xs outline-none focus:border-cyber-blue transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-cyber-muted mb-1 font-bold">刀庫數量</label>
                <input type="text" value={magazineCount} onChange={e => setMagazineCount(e.target.value)} className="w-full bg-cyber-bg border border-cyber-muted/20 p-2 text-white text-xs outline-none focus:border-cyber-blue transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-cyber-muted mb-1 font-bold">Z軸行程</label>
                <input type="text" value={zAxisTravel} onChange={e => setZAxisTravel(e.target.value)} className="w-full bg-cyber-bg border border-cyber-muted/20 p-2 text-white text-xs outline-none focus:border-cyber-blue transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-cyber-muted mb-1 font-bold">主軸轉速</label>
                <input type="text" value={spindleSpeed} onChange={e => setSpindleSpeed(e.target.value)} className="w-full bg-cyber-bg border border-cyber-muted/20 p-2 text-white text-xs outline-none focus:border-cyber-blue transition-colors" />
              </div>
            </div>
          </div>

          <div className="mt-10 flex justify-end gap-4 border-t border-cyber-muted/20 pt-8">
            <button 
              type="button"
              onClick={() => handleSaveOrder()}
              disabled={isSubmitting}
              className="bg-cyber-blue hover:bg-white text-black font-display font-bold px-12 py-4 shadow-neon-blue transition-all uppercase tracking-widest flex items-center gap-3 hover:scale-105 disabled:opacity-50 disabled:cursor-wait"
            >
              {isSubmitting ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
              {editingOrderId ? '儲存並同步數據' : '確認投產登記'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 animate-fade-in">
          <div className="bg-cyber-card border border-cyber-blue/20 p-4 flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-3 text-cyber-muted" size={16} />
              <input 
                type="text" 
                placeholder="搜尋機台號或客戶..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-cyber-bg border border-cyber-muted/30 p-2.5 pl-10 text-white outline-none focus:border-cyber-blue font-mono text-sm transition-all"
              />
            </div>
            <MultiSelectFilter 
              label="生產廠區" 
              options={WORKSHOP_OPTIONS} 
              selectedValues={selectedWorkshops} 
              onChange={setSelectedWorkshops} 
              icon={<Factory size={16}/>}
            />
            <MultiSelectFilter 
              label="當前狀態" 
              options={STATUS_OPTIONS} 
              selectedValues={selectedStatuses} 
              onChange={setSelectedStatuses} 
              icon={<Filter size={16}/>}
            />
            <div className="relative">
                <Disc size={14} className="absolute left-3 top-3.5 text-cyber-muted" />
                <select 
                  value={filterModel}
                  onChange={(e) => setFilterModel(e.target.value)}
                  className="bg-cyber-bg border border-cyber-muted/30 p-2.5 pl-9 pr-8 text-sm text-white outline-none focus:border-cyber-blue font-mono appearance-none min-w-[140px]"
                >
                  <option value="ALL">全部機型</option>
                  {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-3.5 text-cyber-muted pointer-events-none" />
            </div>
          </div>

          <div className="bg-cyber-card border border-cyber-blue/20 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-sm">
                  <thead className="bg-cyber-bg/80 text-cyber-muted uppercase text-[11px] font-bold tracking-wider">
                    <tr className="border-b border-cyber-blue/20">
                      <th className="p-4">機台號</th>
                      <th className="p-4">機型</th>
                      <th className="p-4">客戶</th>
                      <th className="p-4">生產廠區</th>
                      <th className="p-4">生產狀態</th>
                      <th className="p-4">生產進度</th>
                      <th className="p-4 text-cyber-orange">業務結關</th>
                      <th className="p-4 text-cyber-blue">預計完工</th>
                      <th className="p-4 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyber-muted/10">
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-12 text-center text-cyber-muted font-bold italic">未找到匹配的機台數據記錄</td>
                      </tr>
                    ) : (
                      filteredOrders.map(order => {
                        const model = models.find(m => m.id === order.modelId);
                        const totalSteps = model?.steps.length || 0;
                        const doneSteps = Object.values(order.stepStates || {}).filter((s: any) => s.status === 'COMPLETED' || s.status === 'SKIPPED').length;
                        const progress = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;
                        
                        return (
                          <tr key={order.id} className="hover:bg-cyber-blue/5 transition-colors group">
                            <td className="p-4 font-bold text-white group-hover:text-cyber-blue">{order.id}</td>
                            <td className="p-4 text-cyber-text/80">{model?.name || order.modelId}</td>
                            <td className="p-4 max-w-[150px] truncate">{order.clientName || '-'}</td>
                            <td className="p-4 text-cyber-muted font-bold">{order.workshop}</td>
                            <td className="p-4">
                                <span className={`px-2 py-1 rounded-[2px] text-[10px] font-bold border whitespace-nowrap ${
                                    order.status === MachineStatus.IN_PROGRESS ? 'border-cyber-blue/50 text-cyber-blue bg-cyber-blue/5' :
                                    order.status === MachineStatus.HALTED ? 'border-red-500/50 text-red-500 bg-red-500/5 animate-pulse' :
                                    order.status === MachineStatus.COMPLETED ? 'border-green-500/50 text-green-400 bg-green-500/5' :
                                    'border-cyber-muted/50 text-cyber-muted bg-white/5'
                                }`}>
                                    {order.status === MachineStatus.IN_PROGRESS ? '生產中' :
                                     order.status === MachineStatus.HALTED ? '已暫停' :
                                     order.status === MachineStatus.COMPLETED ? '已完成' : '計畫中'}
                                </span>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <div className="w-20 h-1.5 bg-cyber-bg rounded-full overflow-hidden border border-white/5">
                                  <div className={`h-full transition-all duration-1000 ${
                                    order.status === MachineStatus.HALTED ? 'bg-red-500' :
                                    progress === 100 ? 'bg-green-500' : 'bg-cyber-blue'
                                  }`} style={{ width: `${progress}%` }}></div>
                                </div>
                                <span className={`text-[10px] font-bold ${
                                  order.status === MachineStatus.HALTED ? 'text-red-500' :
                                  progress === 100 ? 'text-green-400' : 'text-cyber-blue'
                                }`}>{progress}%</span>
                              </div>
                            </td>
                            <td className="p-4 text-cyber-orange font-bold">{safeFormatDate(order.businessClosingDate) || '-'}</td>
                            <td className="p-4 text-cyan-200 font-bold">{safeFormatDate(order.estimatedCompletionDate) || '-'}</td>
                            <td className="p-4 text-right">
                              <div className="flex justify-end gap-3 opacity-40 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setEditingOrderId(order.id)} className="p-1.5 hover:text-cyber-blue hover:bg-cyber-blue/10 rounded transition-all" title="編輯">
                                  <Edit size={16} />
                                </button>
                                <button onClick={() => onDeleteOrder(order.id)} className="p-1.5 hover:text-red-500 hover:bg-red-500/10 rounded transition-all" title="刪除">
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
