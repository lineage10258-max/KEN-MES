
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MachineModel, WorkOrder, MachineStatus, HolidayType } from '../types';
import { calculateOrderCompletionDate } from '../services/holidayService';
import { Plus, Calendar, Disc, Hash, Factory, Save, Filter, Edit, Trash2, X, User, Settings, CalendarClock, Lock, FileDown, Upload, Search, ChevronDown, CheckSquare, Square, Layers, Download, PauseCircle, PlayCircle, Archive } from 'lucide-react';
import * as XLSX from 'xlsx';

interface OrderDatabaseProps {
  orders: WorkOrder[];
  models: MachineModel[];
  onAddOrder: (order: WorkOrder) => void;
  onUpdateOrder: (order: WorkOrder, originalId?: string) => void;
  onDeleteOrder: (id: string) => void;
}

// Fixed: Added missing options constants for filters
const WORKSHOP_OPTIONS = [
    { value: 'K1(18栋)', label: 'K1(18栋)' },
    { value: 'K2(17栋)', label: 'K2(17栋)' },
    { value: 'K3(戚墅堰)', label: 'K3(戚墅堰)' },
];

const STATUS_OPTIONS = [
    { value: MachineStatus.PLANNED, label: '计划中', color: 'text-cyber-muted' },
    { value: MachineStatus.IN_PROGRESS, label: '进行中', color: 'text-cyber-blue' },
    { value: MachineStatus.HALTED, label: '已暂停', color: 'text-red-500' },
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
                <div className="flex items-center gap-2 overflow-hidden">{icon && <span className={!isAllSelected ? 'text-cyber-blue' : ''}>{icon}</span>}<span className="truncate max-w-[100px]">{isAllSelected ? label : `${label} (${selectedValues.length})`}</span></div>
                <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-cyber-card border border-cyber-blue/30 shadow-xl z-50 rounded overflow-hidden animate-fade-in">
                    <div className="p-2 border-b border-cyber-muted/20 bg-cyber-bg/50 flex justify-between items-center"><span className="text-[10px] text-cyber-muted uppercase tracking-wider">多选筛选</span>{!isAllSelected && <button onClick={() => onChange([])} className="text-[10px] text-cyber-blue hover:text-white underline">清除已选</button>}</div>
                    <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">{options.map(opt => { const isSelected = selectedValues.includes(opt.value); return ( <div key={opt.value} onClick={() => toggleOption(opt.value)} className={`flex items-center gap-3 p-2 cursor-pointer rounded hover:bg-white/5 transition-colors text-sm font-mono ${isSelected ? 'text-white' : 'text-cyber-muted'}`}>{isSelected ? <CheckSquare size={16} className="text-cyber-blue" /> : <Square size={16} className="opacity-50" />}<span className={opt.color}>{opt.label}</span></div> ); })}</div>
                </div>
            )}
        </div>
    );
};

export const OrderDatabase: React.FC<OrderDatabaseProps> = ({ orders, models, onAddOrder, onUpdateOrder, onDeleteOrder }) => {
  const [activeTab, setActiveTab] = useState<'LIST' | 'CREATE' | 'EXPORT'>('LIST');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWorkshops, setSelectedWorkshops] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [filterModel, setFilterModel] = useState('ALL'); 
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [workshop, setWorkshop] = useState('K1(18栋)');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [businessDate, setBusinessDate] = useState('');
  const [holidayType, setHolidayType] = useState<HolidayType>('DOUBLE');
  const [clientName, setClientName] = useState('');
  const [axisHead, setAxisHead] = useState('');
  const [toolHolderSpec, setToolHolderSpec] = useState('');
  const [magazineCount, setMagazineCount] = useState('');
  const [zAxisTravel, setZAxisTravel] = useState('');
  const [spindleSpeed, setSpindleSpeed] = useState('');
  const [existingStatus, setExistingStatus] = useState<MachineStatus>(MachineStatus.PLANNED);
  const [existingStepIndex, setExistingStepIndex] = useState<number>(0);
  const [existingLogs, setExistingLogs] = useState<any[]>([]);
  const [existingStepStates, setExistingStepStates] = useState<Record<string, any>>({});
  const [existingEstimatedDate, setExistingEstimatedDate] = useState<string>('');

  // Fixed: Added triggerFileUpload and getModelName definitions
  const triggerFileUpload = () => fileInputRef.current?.click();
  const getModelName = (id: string) => models.find(m => m.id === id)?.name || id;

  const filteredOrders = orders.filter(order => {
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch = !term || order.id.toLowerCase().includes(term) || (order.clientName && order.clientName.toLowerCase().includes(term));
      const matchesWorkshop = selectedWorkshops.length === 0 || selectedWorkshops.includes(order.workshop);
      const matchesModel = filterModel === 'ALL' || order.modelId === filterModel;
      const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(order.status);
      return matchesSearch && matchesWorkshop && matchesModel && matchesStatus;
  }).sort((a, b) => {
      const dateA = a.businessClosingDate ? new Date(a.businessClosingDate).getTime() : Number.MAX_SAFE_INTEGER;
      const dateB = b.businessClosingDate ? new Date(b.businessClosingDate).getTime() : Number.MAX_SAFE_INTEGER;
      return dateA - dateB;
  });

  useEffect(() => {
    if (startDate && selectedModelId) {
        const model = models.find(m => m.id === selectedModelId);
        if (model) {
            const projectedDate = calculateOrderCompletionDate(
                { startDate: new Date(startDate).toISOString(), stepStates: existingStepStates, holidayType: holidayType }, 
                model
            );
            setEndDate(projectedDate.toISOString().split('T')[0]);
        }
    }
  }, [startDate, selectedModelId, holidayType, models, existingStepStates]);

  const resetForm = () => {
    setEditingOrderId(null); setMachineId(''); setSelectedModelId(''); setWorkshop('K1(18栋)'); setStartDate(''); setEndDate(''); setBusinessDate(''); setHolidayType('DOUBLE');
    setClientName(''); setAxisHead(''); setToolHolderSpec(''); setMagazineCount(''); setZAxisTravel(''); setSpindleSpeed('');
    setExistingStatus(MachineStatus.PLANNED); setExistingStepIndex(0); setExistingLogs([]); setExistingStepStates({}); setExistingEstimatedDate('');
  };

  const handleEditClick = (order: WorkOrder) => {
    setEditingOrderId(order.id); setMachineId(order.id); setSelectedModelId(order.modelId); setWorkshop(order.workshop); setStartDate(order.startDate.split('T')[0]);
    const plannedDate = order.originalEstimatedCompletionDate || order.estimatedCompletionDate;
    setEndDate(plannedDate.split('T')[0]);
    setBusinessDate(order.businessClosingDate ? order.businessClosingDate.split('T')[0] : '');
    setHolidayType(order.holidayType || 'DOUBLE'); setClientName(order.clientName || ''); setAxisHead(order.axisHead || ''); setToolHolderSpec(order.toolHolderSpec || ''); setMagazineCount(order.magazineCount || ''); setZAxisTravel(order.zAxisTravel || ''); setSpindleSpeed(order.spindleSpeed || '');
    setExistingStatus(order.status); setExistingStepIndex(order.currentStepIndex); setExistingLogs(order.logs); setExistingStepStates(order.stepStates || {}); setExistingEstimatedDate(order.estimatedCompletionDate);
    setActiveTab('CREATE');
  };

  const handleCancelEdit = () => { resetForm(); setActiveTab('LIST'); };

  const handleSaveOrder = () => {
    if (!selectedModelId || !machineId || !startDate || !endDate) { alert("请填写所有必填字段"); return; }
    const plannedDateISO = new Date(endDate).toISOString();
    const orderPayload: WorkOrder = {
        id: machineId, modelId: selectedModelId, status: editingOrderId ? existingStatus : MachineStatus.PLANNED, currentStepIndex: editingOrderId ? existingStepIndex : 0, workshop: workshop, startDate: new Date(startDate).toISOString(),
        estimatedCompletionDate: editingOrderId ? existingEstimatedDate : plannedDateISO,
        originalEstimatedCompletionDate: plannedDateISO,
        businessClosingDate: businessDate ? new Date(businessDate).toISOString() : undefined,
        clientName, axisHead, toolHolderSpec, magazineCount, zAxisTravel, spindleSpeed, holidayType, stepStates: editingOrderId ? existingStepStates : {}, logs: editingOrderId ? existingLogs : []
    };
    if (editingOrderId) onUpdateOrder(orderPayload, editingOrderId); else onAddOrder(orderPayload);
    resetForm(); setActiveTab('LIST');
  };

  const handleExportCurrentList = () => {
      const exportData = orders.map(order => {
        const modelName = models.find(m => m.id === order.modelId)?.name || order.modelId;
        return { "机台号": order.id, "机型": modelName, "状态": order.status, "生产车间": order.workshop, "客户名称": order.clientName || '', "计划上线日期": order.startDate ? new Date(order.startDate).toLocaleDateString() : '', "计划完工日期": order.originalEstimatedCompletionDate ? new Date(order.originalEstimatedCompletionDate).toLocaleDateString() : '', "生产完工日期": order.estimatedCompletionDate ? new Date(order.estimatedCompletionDate).toLocaleDateString() : '', "业务结关日期": order.businessClosingDate ? new Date(order.businessClosingDate).toLocaleDateString() : '', "假日别": order.holidayType, "二轴头": order.axisHead || '', "刀柄规格": order.toolHolderSpec || '', "刀庫數": order.magazineCount || '', "Z軸行程": order.zAxisTravel || '', "主軸轉速": order.spindleSpeed || '' };
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "机台名录总表"); XLSX.writeFile(wb, `机台名录总表_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleDownloadTemplate = () => {
    const wsData = [{ "机台号": "SN-2024-TEST01", "机型名称": "LINMAXB-TEST", "生产车间": "K1(18栋)", "计划上线日期": "2024-05-01", "假日别": "DOUBLE", "客户名称": "测试客户A", "二轴头": "K4", "刀柄规格": "A100", "刀库数": "60T", "Z轴行程": "1000mm", "主轴转速": "12000rpm", "业务结关日期": "2024-06-01" }];
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "机台投产模板"); XLSX.writeFile(wb, "机台投产导入模板.xlsx");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
          const bstr = evt.target?.result; const wb = XLSX.read(bstr, { type: 'binary' }); const wsName = wb.SheetNames[0]; const ws = wb.Sheets[wsName]; const data = XLSX.utils.sheet_to_json(ws);
          let successCount = 0; let failCount = 0;
          data.forEach((row: any) => {
              const id = row['机台号'] || row['MachineID']; const modelName = row['机型名称'] || row['ModelName']; const workshopVal = row['生产车间'] || row['Workshop'] || 'K1(18栋)'; const startDateVal = row['计划上线日期'] || row['StartDate']; const holidayTypeVal = (row['假日别'] || row['HolidayType'] || 'DOUBLE') as HolidayType;
              const client = row['客户名称'] || row['ClientName'] || ''; const axis = row['二轴头'] || row['AxisHead'] || ''; const tool = row['刀柄规格'] || row['ToolHolder'] || ''; const magazine = row['刀库数'] || row['Magazine'] || ''; const zAxis = row['Z轴行程'] || row['ZAxis'] || ''; const spindle = row['主轴转速'] || row['SpindleSpeed'] || ''; const closingDateVal = row['业务结关日期'] || row['BusinessClosingDate'];
              if (!id || !modelName || !startDateVal) { failCount++; return; }
              const model = models.find(m => m.name.trim() === modelName.trim()); if (!model) { failCount++; return; }
              let startIso = '';
              if (typeof startDateVal === 'number') { const date = new Date(Math.round((startDateVal - 25569) * 86400 * 1000)); startIso = date.toISOString(); } else { const date = new Date(String(startDateVal).replace(/\//g, '-')); if (!isNaN(date.getTime())) startIso = date.toISOString(); }
              if (!startIso) { failCount++; return; }
              const projected = calculateOrderCompletionDate({ startDate: startIso, stepStates: {}, holidayType: holidayTypeVal }, model);
              const projectedISO = projected.toISOString();
              let closingIso = undefined; if (closingDateVal) { let d = new Date(closingDateVal); if (typeof closingDateVal === 'number') d = new Date(Math.round((closingDateVal - 25569) * 86400 * 1000)); if (!isNaN(d.getTime())) closingIso = d.toISOString(); }
              onAddOrder({ id: String(id), modelId: model.id, status: MachineStatus.PLANNED, currentStepIndex: 0, workshop: workshopVal, startDate: startIso, estimatedCompletionDate: projectedISO, originalEstimatedCompletionDate: projectedISO, businessClosingDate: closingIso, holidayType: holidayTypeVal, clientName: client, axisHead: axis, toolHolderSpec: tool, magazineCount: magazine, zAxisTravel: zAxis, spindleSpeed: spindle, stepStates: {}, logs: [] }); successCount++;
          });
          alert(`批量导入完成。\n成功: ${successCount} 条\n失败/跳过: ${failCount} 条`);
      } catch (error) { console.error("Excel parse error:", error); alert("文件解析失败，请检查格式。"); }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const currentProgress = useMemo(() => {
      if (!editingOrderId) return 0;
      const model = models.find(m => m.id === selectedModelId); if (!model || model.steps.length === 0) return 0;
      const done = Object.values(existingStepStates).filter((s: any) => s.status === 'COMPLETED' || s.status === 'SKIPPED').length;
      return Math.round((done / model.steps.length) * 100);
  }, [editingOrderId, selectedModelId, existingStepStates, models]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex border-b border-cyber-blue/30 mb-6">
            <button onClick={() => { setActiveTab('LIST'); resetForm(); }} className={`px-6 py-3 font-mono text-sm transition-all ${activeTab === 'LIST' ? 'bg-cyber-blue/10 text-cyber-blue border-b-2 border-cyber-blue' : 'text-cyber-muted hover:text-white'}`}>[ 机台名录 ]</button>
            <button onClick={() => setActiveTab('CREATE')} className={`px-6 py-3 font-mono text-sm transition-all ${activeTab === 'CREATE' ? 'bg-cyber-blue/10 text-cyber-blue border-b-2 border-cyber-blue' : 'text-cyber-muted hover:text-white'}`}>[ {editingOrderId ? '编辑机台数据' : '机台投产登记'} ]</button>
            <button onClick={() => setActiveTab('EXPORT')} className={`px-6 py-3 font-mono text-sm transition-all ${activeTab === 'EXPORT' ? 'bg-cyber-blue/10 text-cyber-blue border-b-2 border-cyber-blue' : 'text-cyber-muted hover:text-white'}`}>[ 资料导出 ]</button>
        </div>
        
        {activeTab === 'EXPORT' && (
            <div className="bg-cyber-card border border-cyber-blue/30 p-12 shadow-neon-blue flex flex-col items-center justify-center min-h-[400px] animate-fade-in relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5"><Download size={200} /></div>
                <div className="w-24 h-24 bg-cyber-blue/10 rounded-full flex items-center justify-center mb-6 border border-cyber-blue/30 shadow-[0_0_30px_rgba(0,240,255,0.2)]"><FileDown size={48} className="text-cyber-blue" /></div>
                <h2 className="text-2xl font-display font-bold text-white mb-2 tracking-widest">机台数据库导出</h2>
                <p className="text-cyber-muted font-mono mb-8 text-center max-w-md">将当前系统内所有机台的完整数据导出为 Excel 报表文件。</p>
                <button onClick={handleExportCurrentList} className="group bg-cyber-blue hover:bg-white text-black font-bold py-4 px-10 shadow-neon-blue transition-all flex items-center justify-center gap-3 tracking-wider hover:scale-105"><Download size={20} className="group-hover:text-black" /> 立即导出 Excel</button>
            </div>
        )}

        {activeTab === 'CREATE' && (
             <div className="bg-cyber-card border border-cyber-blue/30 p-8 relative overflow-hidden shadow-neon-blue max-w-5xl mx-auto">
                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none"><Factory size={120} className="text-cyber-blue" /></div>
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">{editingOrderId ? <Edit className="text-cyber-orange" /> : <Plus className="text-cyber-blue" />}{editingOrderId ? '编辑生产任务信息' : '创建生产任务'}</h2>
                    {editingOrderId && <button onClick={handleCancelEdit} className="text-xs text-cyber-muted hover:text-white flex items-center gap-1"><X size={14}/> 取消编辑</button>}
                </div>
                {!editingOrderId && (
                    <div className="mb-8 p-4 bg-cyber-bg/40 border border-cyber-muted/20 rounded relative">
                         <h3 className="text-xs font-mono text-cyber-blue uppercase tracking-wider mb-3 flex items-center gap-2"><Layers size={14}/> 批量导入工具</h3>
                         <div className="flex gap-4"><button onClick={handleDownloadTemplate} className="flex items-center gap-2 px-4 py-2 bg-cyber-card border border-cyber-muted/30 text-cyber-muted text-sm font-mono hover:text-white hover:border-cyber-blue transition-all"><FileDown size={16}/> 下载Excel模板</button><button onClick={triggerFileUpload} className="flex items-center gap-2 px-4 py-2 bg-cyber-card border border-cyber-muted/30 text-cyber-muted text-sm font-mono hover:text-green-400 hover:border-green-500 transition-all"><Upload size={16}/> 导入Excel数据</button><input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleFileUpload}/></div>
                    </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                    <div className="space-y-6">
                        {editingOrderId && (
                            <div className="p-4 bg-cyber-bg/60 border border-cyber-blue/20 rounded mb-4">
                                <div className="flex justify-between items-center mb-3"><label className="block text-xs font-mono text-cyber-muted uppercase tracking-wider">当前状态控制</label><span className={`text-xs font-bold font-mono ${currentProgress === 100 ? 'text-green-400' : 'text-cyber-blue'}`}>进度: {currentProgress}%</span></div>
                                <div className="flex flex-wrap items-center gap-3">
                                    <div className={`px-3 py-2 border rounded font-mono text-sm ${existingStatus === MachineStatus.IN_PROGRESS ? 'border-cyber-blue text-cyber-blue bg-cyber-blue/5' : existingStatus === MachineStatus.HALTED ? 'border-red-500 text-red-500 bg-red-500/5 shadow-[0_0_10px_rgba(239,68,68,0.2)]' : existingStatus === MachineStatus.COMPLETED ? 'border-green-500 text-green-400 bg-green-500/10' : 'border-cyber-muted text-cyber-muted bg-white/5'}`}>状态: {existingStatus === MachineStatus.IN_PROGRESS ? '进行中' : existingStatus === MachineStatus.HALTED ? '暂停生产' : existingStatus === MachineStatus.COMPLETED ? '已完工' : existingStatus}</div>
                                    {existingStatus === MachineStatus.IN_PROGRESS && (
                                        <><button onClick={() => setExistingStatus(MachineStatus.HALTED)} className="flex items-center gap-2 bg-red-500/20 border border-red-500 text-red-400 hover:bg-red-500 hover:text-white font-bold py-2 px-3 rounded text-xs transition-all"><PauseCircle size={14} /> 暫停生產</button>{currentProgress === 100 && (<button onClick={() => setExistingStatus(MachineStatus.COMPLETED)} className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded transition-all shadow-[0_0_15px_rgba(34,197,94,0.5)] animate-pulse"><Archive size={16} /> 結案/歸檔</button>)}</>
                                    )}
                                    {existingStatus === MachineStatus.HALTED && (<button onClick={() => setExistingStatus(MachineStatus.IN_PROGRESS)} className="flex items-center gap-2 bg-cyber-blue/20 border border-cyber-blue text-cyber-blue hover:bg-cyber-blue hover:text-black font-bold py-2 px-3 rounded text-xs transition-all"><PlayCircle size={14} /> 恢復生產</button>)}
                                    {existingStatus === MachineStatus.COMPLETED && (<button onClick={() => setExistingStatus(MachineStatus.IN_PROGRESS)} className="text-xs text-cyber-muted hover:text-white underline">取消结案 (返回生产)</button>)}
                                </div>
                            </div>
                        )}
                        <div><label className="block text-xs font-mono text-cyber-blue mb-2 uppercase tracking-wider flex items-center gap-2"><Disc size={14}/> 选择工艺模型 (机型) <span className="text-red-500">*</span></label><select value={selectedModelId} onChange={(e) => setSelectedModelId(e.target.value)} className="w-full bg-cyber-bg border border-cyber-muted/40 p-3 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"><option value="">-- 请选择机型 --</option>{models.map(m => ( <option key={m.id} value={m.id}>{m.name}</option> ))}</select></div>
                        <div><label className="block text-xs font-mono text-cyber-blue mb-2 uppercase tracking-wider flex items-center gap-2"><Hash size={14}/> 机台号 (序列号) <span className="text-red-500">*</span></label><input type="text" value={machineId} onChange={(e) => setMachineId(e.target.value)} placeholder="例如: SN-2024-088" className="w-full bg-cyber-bg border border-cyber-muted/40 p-3 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm transition-shadow focus:shadow-neon-blue"/></div>
                        <div><label className="block text-xs font-mono text-cyber-blue mb-2 uppercase tracking-wider flex items-center gap-2"><Factory size={14}/> 生产车间</label><select value={workshop} onChange={(e) => setWorkshop(e.target.value)} className="w-full bg-cyber-bg border border-cyber-muted/40 p-3 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"><option value="K1(18栋)">K1(18栋)</option><option value="K2(17栋)">K2(17栋)</option><option value="K3(戚墅堰)">K3(戚墅堰)</option></select></div>
                        <div><label className="block text-xs font-mono text-cyber-blue mb-2 uppercase tracking-wider flex items-center gap-2"><User size={14}/> 客户名称</label><input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="例如: 江苏大前机床" className="w-full bg-cyber-bg border border-cyber-muted/40 p-3 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"/></div>
                    </div>
                    <div className="space-y-6">
                        <div><label className="block text-xs font-mono text-cyber-blue mb-2 uppercase tracking-wider flex items-center gap-2"><Calendar size={14}/> 计划上线日期 <span className="text-red-500">*</span></label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-cyber-bg border border-cyber-muted/40 p-3 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"/></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-xs font-mono text-cyber-blue mb-2 uppercase tracking-wider flex items-center gap-2"><CalendarClock size={14}/> 假日别 (计算依据)</label><select value={holidayType} onChange={(e) => setHolidayType(e.target.value as HolidayType)} className="w-full bg-cyber-bg border border-cyber-muted/40 p-3 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"><option value="DOUBLE">双休 (六日)</option><option value="SINGLE">单休 (日)</option><option value="ALTERNATE">隔周休</option><option value="NONE">无休假</option></select></div>
                            <div><label className="block text-xs font-mono text-cyber-blue mb-2 uppercase tracking-wider flex items-center gap-2"><Calendar size={14}/> 计划生产完工 <span className="text-[10px] opacity-70">(基准)</span></label><div className="relative"><input type="date" value={endDate} readOnly className="w-full bg-cyber-bg/50 border border-cyber-muted/20 p-3 text-cyber-blue focus:outline-none font-mono text-sm cursor-not-allowed font-bold" title="根据上线日期和工艺工时自动计算原始计划基准。"/><Lock size={12} className="absolute right-3 top-3.5 text-cyber-muted opacity-50"/></div></div>
                        </div>
                         <div><label className="block text-xs font-mono text-cyber-orange mb-2 uppercase tracking-wider flex items-center gap-2"><Calendar size={14}/> 业务结关日期 (截止)</label><input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} className="w-full bg-cyber-bg border border-cyber-orange/40 p-3 text-white focus:border-cyber-orange focus:outline-none font-mono text-sm"/></div>
                        <div className="grid grid-cols-2 gap-4"><div className="col-span-2"><label className="block text-xs font-mono text-cyber-muted mb-2 uppercase tracking-wider flex items-center gap-2 border-b border-cyber-muted/20 pb-1"><Settings size={14}/> 技术规格配置</label></div><div><label className="block text-[10px] font-mono text-cyber-blue mb-1 uppercase">二轴头</label><input type="text" value={axisHead} onChange={(e) => setAxisHead(e.target.value)} placeholder="例如: 直结式" className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"/></div><div><label className="block text-[10px] font-mono text-cyber-blue mb-1 uppercase">刀库数</label><input type="text" value={magazineCount} onChange={(e) => setMagazineCount(e.target.value)} placeholder="例如: 24T" className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"/></div><div><label className="block text-[10px] font-mono text-cyber-blue mb-1 uppercase">刀柄规格</label><input type="text" value={toolHolderSpec} onChange={(e) => setToolHolderSpec(e.target.value)} placeholder="例如: BT50" className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"/></div><div><label className="block text-[10px] font-mono text-cyber-blue mb-1 uppercase">Z轴行程</label><input type="text" value={zAxisTravel} onChange={(e) => setZAxisTravel(e.target.value)} placeholder="例如: 800mm" className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"/></div><div><label className="block text-[10px] font-mono text-cyber-blue mb-1 uppercase">主轴转速</label><input type="text" value={spindleSpeed} onChange={(e) => setSpindleSpeed(e.target.value)} placeholder="例如: 12000rpm" className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"/></div></div>
                    </div>
                </div>
                <div className="pt-8 border-t border-cyber-muted/20 mt-8 flex justify-end gap-4">{editingOrderId && <button onClick={handleCancelEdit} className="bg-transparent border border-cyber-muted text-cyber-muted hover:text-white px-6 py-3 font-display font-bold uppercase tracking-wider transition-all">取消</button>}<button onClick={handleSaveOrder} className="bg-cyber-blue hover:bg-white text-black font-display font-bold uppercase py-3 px-8 shadow-neon-blue transition-all flex items-center justify-center gap-2 tracking-wider"><Save size={18} /> {editingOrderId ? '更新工单' : '生成工單'}</button></div>
             </div>
        )}
        {activeTab === 'LIST' && (
            <div className="bg-cyber-card border border-cyber-muted/20">
                <div className="p-4 border-b border-cyber-blue/20 bg-cyber-bg/50 space-y-4"><div className="flex flex-wrap items-center gap-4"><div className="relative group"><Search className="absolute left-3 top-2.5 text-cyber-muted group-focus-within:text-cyber-blue transition-colors" size={16} /><input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="搜索机台号/客户..." className="bg-cyber-bg border border-cyber-muted/30 pl-10 pr-4 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyber-blue w-64 transition-all"/></div><MultiSelectFilter label="生产车间" options={WORKSHOP_OPTIONS} selectedValues={selectedWorkshops} onChange={setSelectedWorkshops} icon={<Factory size={14} />} /><MultiSelectFilter label="当前状态" options={STATUS_OPTIONS} selectedValues={selectedStatuses} onChange={setSelectedStatuses} icon={<Filter size={14} />} /><div className="relative"><Disc size={14} className="absolute left-3 top-3 text-cyber-muted" /><select value={filterModel} onChange={(e) => setFilterModel(e.target.value)} className="bg-cyber-bg border border-cyber-muted/30 pl-9 pr-8 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyber-blue appearance-none min-w-[140px]"><option value="ALL">全部机型</option>{models.map(m => (<option key={m.id} value={m.id}>{m.name}</option>))}</select><ChevronDown size={14} className="absolute right-3 top-3 text-cyber-muted pointer-none" /></div><div className="flex items-center gap-2 text-cyber-blue font-mono text-sm ml-auto"><Filter size={16} /><span>显示: {filteredOrders.length} / 总数: {orders.length}</span></div></div></div>
                <div className="overflow-x-auto"><table className="w-full text-left font-mono"><thead><tr className="border-b border-cyber-muted/20 text-cyber-muted text-xs uppercase tracking-wider bg-cyber-bg/30"><th className="p-4">机台号</th><th className="p-4">机型</th><th className="p-4">假日别</th><th className="p-4">状态</th><th className="p-4">生产车间</th><th className="p-4">计划上线</th><th className="p-4 text-cyber-orange">业务结关</th><th className="p-4 text-right">操作</th></tr></thead><tbody className="text-sm divide-y divide-cyber-muted/10">{filteredOrders.length === 0 ? (<tr><td colSpan={8} className="p-8 text-center text-cyber-muted opacity-60">无符合条件的记录</td></tr>) : (filteredOrders.map(order => (<tr key={order.id} className="hover:bg-cyber-blue/5 transition-colors group"><td className="p-4 text-white group-hover:text-cyber-blue"><div className="flex items-baseline gap-0.5"><span>{order.id}</span>{order.zAxisTravel && <span className="text-xs font-normal text-cyber-muted/80">(Z{order.zAxisTravel.replace(/mm/gi, '').trim()})</span>}</div><div className="text-[10px] text-cyber-muted mt-1 font-normal opacity-70">{[order.axisHead, order.toolHolderSpec, order.spindleSpeed, order.magazineCount].filter(Boolean).join(' / ') || '-'}</div></td><td className="p-4 text-cyber-text/80">{getModelName(order.modelId)}</td><td className="p-4 text-cyber-text/80"><span className="text-[10px] bg-cyber-muted/10 px-1 rounded border border-cyber-muted/20">{order.holidayType === 'DOUBLE' ? '双休' : order.holidayType === 'SINGLE' ? '单休' : order.holidayType === 'ALTERNATE' ? '隔周休' : '无休'}</span></td><td className="p-4"><span className={`px-2 py-0.5 text-[10px] border ${order.status === 'IN_PROGRESS' ? 'border-cyber-blue text-cyber-blue' : order.status === 'HALTED' ? 'border-red-500 text-red-500 bg-red-500/5' : order.status === 'COMPLETED' ? 'border-green-500 text-green-500' : 'border-cyber-muted text-cyber-muted'}`}>{order.status}</span></td><td className="p-4 text-cyber-muted">{order.workshop}</td><td className="p-4 text-cyber-text/80">{new Date(order.startDate).toLocaleDateString()}</td><td className="p-4 text-cyber-orange">{order.businessClosingDate ? new Date(order.businessClosingDate).toLocaleDateString() : '-'}</td><td className="p-4 text-right"><div className="flex justify-end gap-2"><button onClick={() => handleEditClick(order)} className="p-1 text-cyber-blue hover:bg-cyber-blue/20 rounded transition-colors" title="编辑"><Edit size={16} /></button><button onClick={() => onDeleteOrder(order.id)} className="p-1 text-cyber-muted hover:text-cyber-orange hover:bg-cyber-orange/20 rounded transition-colors" title="删除"><Trash2 size={16} /></button></div></td></tr>)))}</tbody></table></div>
            </div>
        )}
    </div>
  );
};
