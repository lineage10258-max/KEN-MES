
import React, { useState, useEffect, useRef } from 'react';
import { MachineModel, WorkOrder, MachineStatus, HolidayType } from '../types';
import { calculateProjectedDate } from '../services/holidayService';
import { Plus, Calendar, Disc, Hash, Factory, Save, Filter, Edit, Trash2, X, User, Settings, CalendarClock, Lock, FileDown, Upload, Search, ChevronDown, CheckSquare, Square, Layers, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface OrderDatabaseProps {
  orders: WorkOrder[];
  models: MachineModel[];
  onAddOrder: (order: WorkOrder) => void;
  onUpdateOrder: (order: WorkOrder, originalId?: string) => void;
  onDeleteOrder: (id: string) => void;
}

// Helper Component for Multi-Select Dropdown
const MultiSelectFilter: React.FC<{
    label: string;
    options: { value: string; label: string; color?: string }[];
    selectedValues: string[];
    onChange: (values: string[]) => void;
    icon?: React.ReactNode;
}> = ({ label, options, selectedValues, onChange, icon }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (value: string) => {
        if (selectedValues.includes(value)) {
            onChange(selectedValues.filter(v => v !== value));
        } else {
            onChange([...selectedValues, value]);
        }
    };

    const isAllSelected = selectedValues.length === 0;

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-mono border rounded transition-all min-w-[140px] justify-between ${
                    isOpen || !isAllSelected
                        ? 'bg-cyber-blue/10 border-cyber-blue text-white shadow-neon-blue'
                        : 'bg-cyber-bg border-cyber-muted/30 text-cyber-muted hover:text-white hover:border-cyber-muted'
                }`}
            >
                <div className="flex items-center gap-2 overflow-hidden">
                    {icon && <span className={!isAllSelected ? 'text-cyber-blue' : ''}>{icon}</span>}
                    <span className="truncate max-w-[100px]">
                        {isAllSelected ? label : `${label} (${selectedValues.length})`}
                    </span>
                </div>
                <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-cyber-card border border-cyber-blue/30 shadow-xl z-50 rounded overflow-hidden animate-fade-in">
                    <div className="p-2 border-b border-cyber-muted/20 bg-cyber-bg/50 flex justify-between items-center">
                        <span className="text-[10px] text-cyber-muted uppercase tracking-wider">多选筛选</span>
                        {!isAllSelected && (
                            <button 
                                onClick={() => onChange([])}
                                className="text-[10px] text-cyber-blue hover:text-white underline"
                            >
                                清除已选
                            </button>
                        )}
                    </div>
                    <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
                        {options.map(opt => {
                            const isSelected = selectedValues.includes(opt.value);
                            return (
                                <div
                                    key={opt.value}
                                    onClick={() => toggleOption(opt.value)}
                                    className={`flex items-center gap-3 p-2 cursor-pointer rounded hover:bg-white/5 transition-colors text-sm font-mono ${isSelected ? 'text-white' : 'text-cyber-muted'}`}
                                >
                                    {isSelected 
                                        ? <CheckSquare size={16} className="text-cyber-blue" /> 
                                        : <Square size={16} className="opacity-50" />
                                    }
                                    <span className={opt.color}>{opt.label}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export const OrderDatabase: React.FC<OrderDatabaseProps> = ({ orders, models, onAddOrder, onUpdateOrder, onDeleteOrder }) => {
  const [activeTab, setActiveTab] = useState<'LIST' | 'CREATE' | 'EXPORT'>('LIST');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWorkshops, setSelectedWorkshops] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [filterModel, setFilterModel] = useState('ALL'); // Keep Model as single select for now, or could convert too

  // Form State
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  
  const [selectedModelId, setSelectedModelId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [workshop, setWorkshop] = useState('K1(18栋)');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [businessDate, setBusinessDate] = useState('');
  const [holidayType, setHolidayType] = useState<HolidayType>('DOUBLE'); // Default

  // New Fields
  const [clientName, setClientName] = useState('');
  const [axisHead, setAxisHead] = useState('');
  const [toolHolderSpec, setToolHolderSpec] = useState('');
  const [magazineCount, setMagazineCount] = useState('');
  const [zAxisTravel, setZAxisTravel] = useState('');
  const [spindleSpeed, setSpindleSpeed] = useState('');
  
  // Preserve existing state when editing
  const [existingStatus, setExistingStatus] = useState<MachineStatus>(MachineStatus.PLANNED);
  const [existingStepIndex, setExistingStepIndex] = useState<number>(0);
  const [existingLogs, setExistingLogs] = useState<any[]>([]);
  const [existingStepStates, setExistingStepStates] = useState<Record<string, any>>({});
  
  // Preserve original estimated date
  const [existingOriginalDate, setExistingOriginalDate] = useState<string | undefined>(undefined);

  // Filter Logic
  const filteredOrders = orders.filter(order => {
      // Search: ID or Client Name
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch = !term || 
          order.id.toLowerCase().includes(term) || 
          (order.clientName && order.clientName.toLowerCase().includes(term));
      
      // Workshop: If empty, show all. Else show selected.
      const matchesWorkshop = selectedWorkshops.length === 0 || selectedWorkshops.includes(order.workshop);
      
      // Model: Single select logic
      const matchesModel = filterModel === 'ALL' || order.modelId === filterModel;
      
      // Status: If empty, show all. Else show selected.
      const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(order.status);
      
      return matchesSearch && matchesWorkshop && matchesModel && matchesStatus;
  }).sort((a, b) => {
      // Sort by Business Closing Date (Ascending)
      // If businessClosingDate is missing, put it at the end (MAX_SAFE_INTEGER)
      const dateA = a.businessClosingDate ? new Date(a.businessClosingDate).getTime() : Number.MAX_SAFE_INTEGER;
      const dateB = b.businessClosingDate ? new Date(b.businessClosingDate).getTime() : Number.MAX_SAFE_INTEGER;
      return dateA - dateB;
  });

  // Helper function to calculate effective scheduling hours
  // Logic: If a specific schedule module is selected, use that. Otherwise, use the longest parallel line.
  const calculateEffectiveHours = (model: MachineModel) => {
      if (model.scheduleCalculationModule) {
          // Calculate sum of steps for the specific module selected in Model Config
          return model.steps
              .filter(s => s.parallelModule === model.scheduleCalculationModule)
              .reduce((sum, s) => sum + s.estimatedHours, 0);
      } else {
          // Calculate Schedule based on the LONGEST parallel module (Critical Path)
          const moduleHours: Record<string, number> = {};
          model.steps.forEach(s => {
              const key = s.parallelModule || '通用';
              moduleHours[key] = (moduleHours[key] || 0) + s.estimatedHours;
          });
          // Return the maximum duration among all parallel lines
          return Math.max(0, ...Object.values(moduleHours));
      }
  };

  // Auto-calculate Estimated Completion Date
  useEffect(() => {
    if (startDate && selectedModelId) {
        const model = models.find(m => m.id === selectedModelId);
        if (model) {
            // Updated Logic: Use effective hours (longest line or specific module)
            const effectiveHours = calculateEffectiveHours(model);
            
            const start = new Date(startDate);
            // Calculate using the shared service logic
            const projected = calculateProjectedDate(start, effectiveHours, holidayType);
            setEndDate(projected.toISOString().split('T')[0]);
        }
    }
  }, [startDate, selectedModelId, holidayType, models]);

  const resetForm = () => {
    setEditingOrderId(null);
    setMachineId('');
    setSelectedModelId('');
    setWorkshop('K1(18栋)');
    setStartDate('');
    setEndDate('');
    setBusinessDate('');
    setHolidayType('DOUBLE');
    setClientName('');
    setAxisHead('');
    setToolHolderSpec('');
    setMagazineCount('');
    setZAxisTravel('');
    setSpindleSpeed('');
    setExistingStatus(MachineStatus.PLANNED);
    setExistingStepIndex(0);
    setExistingLogs([]);
    setExistingStepStates({});
    setExistingOriginalDate(undefined);
  };

  const handleEditClick = (order: WorkOrder) => {
    setEditingOrderId(order.id);
    setMachineId(order.id);
    setSelectedModelId(order.modelId);
    setWorkshop(order.workshop);
    setStartDate(order.startDate.split('T')[0]); // Extract YYYY-MM-DD
    setEndDate(order.estimatedCompletionDate.split('T')[0]);
    if (order.businessClosingDate) {
        setBusinessDate(order.businessClosingDate.split('T')[0]);
    } else {
        setBusinessDate('');
    }
    setHolidayType(order.holidayType || 'DOUBLE');
    
    // Load new fields
    setClientName(order.clientName || '');
    setAxisHead(order.axisHead || '');
    setToolHolderSpec(order.toolHolderSpec || '');
    setMagazineCount(order.magazineCount || '');
    setZAxisTravel(order.zAxisTravel || '');
    setSpindleSpeed(order.spindleSpeed || '');
    
    // Preserve internal state
    setExistingStatus(order.status);
    setExistingStepIndex(order.currentStepIndex);
    setExistingLogs(order.logs);
    setExistingStepStates(order.stepStates || {});
    setExistingOriginalDate(order.originalEstimatedCompletionDate);

    setActiveTab('CREATE');
  };

  const handleCancelEdit = () => {
      resetForm();
      setActiveTab('LIST');
  };

  const handleSaveOrder = () => {
    if (!selectedModelId || !machineId || !startDate || !endDate) {
        alert("请填写所有必填字段");
        return;
    }

    const estimatedDateISO = new Date(endDate).toISOString();

    const orderPayload: WorkOrder = {
        id: machineId,
        modelId: selectedModelId,
        status: editingOrderId ? existingStatus : MachineStatus.PLANNED,
        currentStepIndex: editingOrderId ? existingStepIndex : 0,
        workshop: workshop,
        startDate: new Date(startDate).toISOString(),
        estimatedCompletionDate: estimatedDateISO,
        // If creating new, set original to the initial estimated. If editing, keep original.
        originalEstimatedCompletionDate: editingOrderId ? existingOriginalDate : estimatedDateISO,
        
        businessClosingDate: businessDate ? new Date(businessDate).toISOString() : undefined,
        
        // Add new fields to payload
        clientName: clientName,
        axisHead: axisHead,
        toolHolderSpec: toolHolderSpec,
        magazineCount: magazineCount,
        zAxisTravel: zAxisTravel,
        spindleSpeed: spindleSpeed,
        
        holidayType: holidayType,

        stepStates: editingOrderId ? existingStepStates : {},
        logs: editingOrderId ? existingLogs : []
    };

    if (editingOrderId) {
        onUpdateOrder(orderPayload, editingOrderId);
    } else {
        onAddOrder(orderPayload);
    }
    
    resetForm();
    setActiveTab('LIST');
  };

  // --- Export Full List Logic ---
  const handleExportCurrentList = () => {
      const exportData = orders.map(order => {
        const modelName = models.find(m => m.id === order.modelId)?.name || order.modelId;
        return {
            "机台号": order.id,
            "机型": modelName,
            "状态": order.status === 'IN_PROGRESS' ? '进行中' : order.status === 'COMPLETED' ? '已完成' : '计划中',
            "生产车间": order.workshop,
            "客户名称": order.clientName || '',
            "计划上线日期": order.startDate ? new Date(order.startDate).toLocaleDateString() : '',
            "生产完工日期": order.estimatedCompletionDate ? new Date(order.estimatedCompletionDate).toLocaleDateString() : '',
            "业务结关日期": order.businessClosingDate ? new Date(order.businessClosingDate).toLocaleDateString() : '',
            "假日别": order.holidayType,
            // Specs
            "二轴头": order.axisHead || '',
            "刀柄规格": order.toolHolderSpec || '',
            "刀库数": order.magazineCount || '',
            "Z轴行程": order.zAxisTravel || '',
            "主轴转速": order.spindleSpeed || ''
        };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "机台名录总表");
    XLSX.writeFile(wb, `机台名录总表_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // --- Excel Import Logic ---
  const handleDownloadTemplate = () => {
    const wsData = [
      { 
        "机台号": "SN-2024-TEST01", 
        "机型名称": "LINMAXB-TEST", 
        "生产车间": "K1(18栋)", 
        "计划上线日期": "2024-05-01", 
        "假日别": "DOUBLE",
        "客户名称": "测试客户A",
        "二轴头": "K4",
        "刀柄规格": "A100",
        "刀库数": "60T",
        "Z轴行程": "1000mm",
        "主轴转速": "12000rpm",
        "业务结关日期": "2024-06-01"
      }
    ];
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "机台投产模板");
    XLSX.writeFile(wb, "机台投产导入模板.xlsx");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsName = wb.SheetNames[0];
          const ws = wb.Sheets[wsName];
          const data = XLSX.utils.sheet_to_json(ws);
          
          let successCount = 0;
          let failCount = 0;

          data.forEach((row: any) => {
              // Map columns
              const id = row['机台号'] || row['MachineID'];
              const modelName = row['机型名称'] || row['ModelName'];
              const workshopVal = row['生产车间'] || row['Workshop'] || 'K1(18栋)';
              const startDateVal = row['计划上线日期'] || row['StartDate'];
              const holidayTypeVal = (row['假日别'] || row['HolidayType'] || 'DOUBLE') as HolidayType;
              
              const client = row['客户名称'] || row['ClientName'] || '';
              const axis = row['二轴头'] || row['AxisHead'] || '';
              const tool = row['刀柄规格'] || row['ToolHolder'] || '';
              const magazine = row['刀库数'] || row['Magazine'] || '';
              const zAxis = row['Z轴行程'] || row['ZAxis'] || '';
              const spindle = row['主轴转速'] || row['SpindleSpeed'] || '';
              const closingDateVal = row['业务结关日期'] || row['BusinessClosingDate'];

              if (!id || !modelName || !startDateVal) {
                  failCount++;
                  return;
              }

              // Find Model ID by Name
              const model = models.find(m => m.name.trim() === modelName.trim());
              if (!model) {
                  console.warn(`Skipping ${id}: Model '${modelName}' not found.`);
                  failCount++;
                  return;
              }

              // Parse Date
              // Handle Excel date serial number or string
              let startIso = '';
              if (typeof startDateVal === 'number') {
                   // Approximate Excel Serial Date to JS Date
                   const date = new Date(Math.round((startDateVal - 25569) * 86400 * 1000));
                   startIso = date.toISOString();
              } else {
                   // Try parsing string
                   const date = new Date(String(startDateVal).replace(/\//g, '-'));
                   if (!isNaN(date.getTime())) {
                       startIso = date.toISOString();
                   }
              }

              if (!startIso) {
                  failCount++;
                  return;
              }

              // Calculate Estimated End Date
              // Updated Logic: Use effective hours (longest line or specific module)
              const effectiveHours = calculateEffectiveHours(model);
              const projected = calculateProjectedDate(new Date(startIso), effectiveHours, holidayTypeVal);
              const projectedISO = projected.toISOString();
              
              // Business Closing Date
              let closingIso = undefined;
              if (closingDateVal) {
                  let d = new Date(closingDateVal);
                   if (typeof closingDateVal === 'number') {
                        d = new Date(Math.round((closingDateVal - 25569) * 86400 * 1000));
                   }
                   if (!isNaN(d.getTime())) closingIso = d.toISOString();
              }

              const newOrder: WorkOrder = {
                  id: String(id),
                  modelId: model.id,
                  status: MachineStatus.PLANNED,
                  currentStepIndex: 0,
                  workshop: workshopVal,
                  startDate: startIso,
                  estimatedCompletionDate: projectedISO,
                  originalEstimatedCompletionDate: projectedISO, // Set original same as initial projected
                  businessClosingDate: closingIso,
                  holidayType: holidayTypeVal,
                  clientName: client,
                  axisHead: axis,
                  toolHolderSpec: tool,
                  magazineCount: magazine,
                  zAxisTravel: zAxis,
                  spindleSpeed: spindle,
                  stepStates: {},
                  logs: []
              };

              onAddOrder(newOrder);
              successCount++;
          });

          alert(`批量导入完成。\n成功: ${successCount} 条\n失败/跳过: ${failCount} 条\n(失败原因通常为：缺少必填项、机型名称不匹配或日期格式错误)`);

      } catch (error) {
          console.error("Excel parse error:", error);
          alert("文件解析失败，请检查格式。");
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const getModelName = (id: string) => models.find(m => m.id === id)?.name || '未知机型';

  // Constants for Filters
  const WORKSHOP_OPTIONS = [
      { value: 'K1(18栋)', label: 'K1(18栋)' },
      { value: 'K2(17栋)', label: 'K2(17栋)' },
      { value: 'K3(戚墅堰)', label: 'K3(戚墅堰)' },
  ];

  const STATUS_OPTIONS = [
      { value: 'PLANNED', label: 'PLANNED (排队中)', color: 'text-cyber-orange' },
      { value: 'IN_PROGRESS', label: 'IN_PROGRESS (进行中)', color: 'text-cyber-blue' },
      { value: 'COMPLETED', label: 'COMPLETED (已完成)', color: 'text-green-500' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
       
        {/* Tabs */}
        <div className="flex border-b border-cyber-blue/30 mb-6">
            <button 
                onClick={() => { setActiveTab('LIST'); resetForm(); }}
                className={`px-6 py-3 font-mono text-sm transition-all ${activeTab === 'LIST' ? 'bg-cyber-blue/10 text-cyber-blue border-b-2 border-cyber-blue' : 'text-cyber-muted hover:text-white'}`}
            >
                [ 机台名录 ]
            </button>
            <button 
                onClick={() => setActiveTab('CREATE')}
                className={`px-6 py-3 font-mono text-sm transition-all ${activeTab === 'CREATE' ? 'bg-cyber-blue/10 text-cyber-blue border-b-2 border-cyber-blue' : 'text-cyber-muted hover:text-white'}`}
            >
                [ {editingOrderId ? '编辑机台数据' : '机台投产登记'} ]
            </button>
             <button 
                onClick={() => setActiveTab('EXPORT')}
                className={`px-6 py-3 font-mono text-sm transition-all ${activeTab === 'EXPORT' ? 'bg-cyber-blue/10 text-cyber-blue border-b-2 border-cyber-blue' : 'text-cyber-muted hover:text-white'}`}
            >
                [ 资料导出 ]
            </button>
        </div>
        
        {activeTab === 'EXPORT' && (
            <div className="bg-cyber-card border border-cyber-blue/30 p-12 shadow-neon-blue flex flex-col items-center justify-center min-h-[400px] animate-fade-in relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                    <Download size={200} />
                </div>
                
                <div className="w-24 h-24 bg-cyber-blue/10 rounded-full flex items-center justify-center mb-6 border border-cyber-blue/30 shadow-[0_0_30px_rgba(0,240,255,0.2)]">
                    <FileDown size={48} className="text-cyber-blue" />
                </div>
                
                <h2 className="text-2xl font-display font-bold text-white mb-2 tracking-widest">机台数据库导出</h2>
                <p className="text-cyber-muted font-mono mb-8 text-center max-w-md">
                    将当前系统内所有机台（包含计划中、进行中、已完成）的完整数据导出为 Excel 报表文件。
                    <br/>
                    <span className="text-xs opacity-60">包含：机台号、机型、车间、客户、各项技术规格、状态及日期信息。</span>
                </p>
                
                <button 
                    onClick={handleExportCurrentList}
                    className="group bg-cyber-blue hover:bg-white text-black font-bold py-4 px-10 shadow-neon-blue transition-all flex items-center justify-center gap-3 tracking-wider hover:scale-105"
                >
                    <Download size={20} className="group-hover:text-black" /> 
                    立即导出 Excel
                </button>
            </div>
        )}

        {activeTab === 'CREATE' && (
             <div className="bg-cyber-card border border-cyber-blue/30 p-8 relative overflow-hidden shadow-neon-blue max-w-5xl mx-auto">
                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                    <Factory size={120} className="text-cyber-blue" />
                </div>

                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
                        {editingOrderId ? <Edit className="text-cyber-orange" /> : <Plus className="text-cyber-blue" />}
                        {editingOrderId ? '编辑生产任务信息' : '创建生产任务'}
                    </h2>
                    {editingOrderId && (
                        <button onClick={handleCancelEdit} className="text-xs text-cyber-muted hover:text-white flex items-center gap-1">
                            <X size={14}/> 取消编辑
                        </button>
                    )}
                </div>

                {/* Bulk Import Tool */}
                {!editingOrderId && (
                    <div className="mb-8 p-4 bg-cyber-bg/40 border border-cyber-muted/20 rounded relative">
                         <h3 className="text-xs font-mono text-cyber-blue uppercase tracking-wider mb-3 flex items-center gap-2">
                             <Layers size={14}/> 批量导入工具
                         </h3>
                         <div className="flex gap-4">
                             <button 
                                onClick={handleDownloadTemplate}
                                className="flex items-center gap-2 px-4 py-2 bg-cyber-card border border-cyber-muted/30 text-cyber-muted text-sm font-mono hover:text-white hover:border-cyber-blue transition-all"
                             >
                                 <FileDown size={16}/> 下载Excel模板
                             </button>
                             <button 
                                onClick={triggerFileUpload}
                                className="flex items-center gap-2 px-4 py-2 bg-cyber-card border border-cyber-muted/30 text-cyber-muted text-sm font-mono hover:text-green-400 hover:border-green-500 transition-all"
                             >
                                 <Upload size={16}/> 导入Excel数据
                             </button>
                             <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept=".xlsx, .xls" 
                                onChange={handleFileUpload}
                            />
                         </div>
                         <p className="text-[10px] text-cyber-muted mt-2 opacity-70">
                             * 请下载模板并按照格式填写。导入时系统将自动根据机型名称匹配ID并计算预计完工日。
                         </p>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                    {/* Column 1: Core Info & Specs */}
                    <div className="space-y-6">
                         <div>
                            <label className="block text-xs font-mono text-cyber-blue mb-2 uppercase tracking-wider flex items-center gap-2">
                                <Disc size={14}/> 选择工艺模型 (机型) <span className="text-red-500">*</span>
                            </label>
                            <select 
                                value={selectedModelId}
                                onChange={(e) => setSelectedModelId(e.target.value)}
                                className="w-full bg-cyber-bg border border-cyber-muted/40 p-3 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"
                            >
                                <option value="">-- 请选择机型 --</option>
                                {models.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-mono text-cyber-blue mb-2 uppercase tracking-wider flex items-center gap-2">
                                <Hash size={14}/> 机台号 (序列号) <span className="text-red-500">*</span>
                            </label>
                            <input 
                                type="text" 
                                value={machineId}
                                onChange={(e) => setMachineId(e.target.value)}
                                placeholder="例如: SN-2024-088"
                                className="w-full bg-cyber-bg border border-cyber-muted/40 p-3 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm transition-shadow focus:shadow-neon-blue"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-mono text-cyber-blue mb-2 uppercase tracking-wider flex items-center gap-2">
                                <Factory size={14}/> 生产车间
                            </label>
                            <select 
                                value={workshop}
                                onChange={(e) => setWorkshop(e.target.value)}
                                className="w-full bg-cyber-bg border border-cyber-muted/40 p-3 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"
                            >
                                <option value="K1(18栋)">K1(18栋)</option>
                                <option value="K2(17栋)">K2(17栋)</option>
                                <option value="K3(戚墅堰)">K3(戚墅堰)</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-mono text-cyber-blue mb-2 uppercase tracking-wider flex items-center gap-2">
                                <User size={14}/> 客户名称
                            </label>
                            <input 
                                type="text" 
                                value={clientName}
                                onChange={(e) => setClientName(e.target.value)}
                                placeholder="例如: 江苏大前机床"
                                className="w-full bg-cyber-bg border border-cyber-muted/40 p-3 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"
                            />
                        </div>
                    </div>

                    {/* Column 2: Schedule & Specs */}
                    <div className="space-y-6">
                        <div>
                            <label className="block text-xs font-mono text-cyber-blue mb-2 uppercase tracking-wider flex items-center gap-2">
                                <Calendar size={14}/> 计划上线日期 <span className="text-red-500">*</span>
                            </label>
                            <input 
                                type="date" 
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full bg-cyber-bg border border-cyber-muted/40 p-3 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-mono text-cyber-blue mb-2 uppercase tracking-wider flex items-center gap-2">
                                    <CalendarClock size={14}/> 假日别 (计算依据)
                                </label>
                                <select 
                                    value={holidayType}
                                    onChange={(e) => setHolidayType(e.target.value as HolidayType)}
                                    className="w-full bg-cyber-bg border border-cyber-muted/40 p-3 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"
                                >
                                    <option value="DOUBLE">双休 (六日)</option>
                                    <option value="SINGLE">单休 (日)</option>
                                    <option value="ALTERNATE">隔周休</option>
                                    <option value="NONE">无休假</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-mono text-cyber-blue mb-2 uppercase tracking-wider flex items-center gap-2">
                                    <Calendar size={14}/> 生产完工 (系统自动)
                                </label>
                                <div className="relative">
                                    <input 
                                        type="date" 
                                        value={endDate}
                                        readOnly
                                        className="w-full bg-cyber-bg/50 border border-cyber-muted/20 p-3 text-cyber-blue focus:outline-none font-mono text-sm cursor-not-allowed font-bold"
                                        title="根据上线日期和工艺工时自动计算 (依据：平行模组最大工时或指定模组)"
                                    />
                                    <Lock size={12} className="absolute right-3 top-3.5 text-cyber-muted opacity-50"/>
                                </div>
                            </div>
                        </div>

                         <div>
                            <label className="block text-xs font-mono text-cyber-orange mb-2 uppercase tracking-wider flex items-center gap-2">
                                <Calendar size={14}/> 业务结关日期 (截止)
                            </label>
                            <input 
                                type="date" 
                                value={businessDate}
                                onChange={(e) => setBusinessDate(e.target.value)}
                                className="w-full bg-cyber-bg border border-cyber-orange/40 p-3 text-white focus:border-cyber-orange focus:outline-none font-mono text-sm"
                            />
                        </div>

                        {/* Technical Specs Group */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className="block text-xs font-mono text-cyber-muted mb-2 uppercase tracking-wider flex items-center gap-2 border-b border-cyber-muted/20 pb-1">
                                    <Settings size={14}/> 技术规格配置
                                </label>
                            </div>
                            
                            <div>
                                <label className="block text-[10px] font-mono text-cyber-blue mb-1 uppercase">二轴头</label>
                                <input 
                                    type="text" 
                                    value={axisHead}
                                    onChange={(e) => setAxisHead(e.target.value)}
                                    placeholder="例如: 直结式"
                                    className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono text-cyber-blue mb-1 uppercase">刀库数</label>
                                <input 
                                    type="text" 
                                    value={magazineCount}
                                    onChange={(e) => setMagazineCount(e.target.value)}
                                    placeholder="例如: 24T"
                                    className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"
                                />
                            </div>
                             <div>
                                <label className="block text-[10px] font-mono text-cyber-blue mb-1 uppercase">刀柄规格</label>
                                <input 
                                    type="text" 
                                    value={toolHolderSpec}
                                    onChange={(e) => setToolHolderSpec(e.target.value)}
                                    placeholder="例如: BT50"
                                    className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono text-cyber-blue mb-1 uppercase">Z轴行程</label>
                                <input 
                                    type="text" 
                                    value={zAxisTravel}
                                    onChange={(e) => setZAxisTravel(e.target.value)}
                                    placeholder="例如: 800mm"
                                    className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-mono text-cyber-blue mb-1 uppercase">主轴转速</label>
                                <input 
                                    type="text" 
                                    value={spindleSpeed}
                                    onChange={(e) => setSpindleSpeed(e.target.value)}
                                    placeholder="例如: 12000rpm"
                                    className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"
                                />
                            </div>
                        </div>

                    </div>
                </div>

                <div className="pt-8 border-t border-cyber-muted/20 mt-8 flex justify-end gap-4">
                     {editingOrderId && (
                        <button 
                            onClick={handleCancelEdit}
                            className="bg-transparent border border-cyber-muted text-cyber-muted hover:text-white px-6 py-3 font-display font-bold uppercase tracking-wider transition-all"
                        >
                            取消
                        </button>
                    )}
                    <button 
                        onClick={handleSaveOrder}
                        className="bg-cyber-blue hover:bg-white text-black font-display font-bold uppercase py-3 px-8 shadow-neon-blue transition-all flex items-center gap-2 tracking-wider"
                    >
                        <Save size={18} /> {editingOrderId ? '更新工单' : '生成工单'}
                    </button>
                </div>
             </div>
        )}

        {activeTab === 'LIST' && (
            <div className="bg-cyber-card border border-cyber-muted/20">
                <div className="p-4 border-b border-cyber-blue/20 bg-cyber-bg/50 space-y-4">
                    <div className="flex flex-wrap items-center gap-4">
                        {/* Search */}
                        <div className="relative group">
                            <Search className="absolute left-3 top-2.5 text-cyber-muted group-focus-within:text-cyber-blue transition-colors" size={16} />
                            <input 
                                type="text" 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="搜索机台号/客户..." 
                                className="bg-cyber-bg border border-cyber-muted/30 pl-10 pr-4 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyber-blue w-64 transition-all"
                            />
                        </div>

                        {/* Workshop Filter (Multi-Select) */}
                        <MultiSelectFilter 
                            label="生产车间" 
                            options={WORKSHOP_OPTIONS}
                            selectedValues={selectedWorkshops}
                            onChange={setSelectedWorkshops}
                            icon={<Factory size={14} />}
                        />

                        {/* Status Filter (Multi-Select) */}
                        <MultiSelectFilter 
                            label="当前状态" 
                            options={STATUS_OPTIONS}
                            selectedValues={selectedStatuses}
                            onChange={setSelectedStatuses}
                            icon={<Filter size={14} />}
                        />

                        {/* Model Filter (Single Select) */}
                        <div className="relative">
                            <Disc size={14} className="absolute left-3 top-3 text-cyber-muted" />
                            <select
                                value={filterModel}
                                onChange={(e) => setFilterModel(e.target.value)}
                                className="bg-cyber-bg border border-cyber-muted/30 pl-9 pr-8 py-2 text-sm font-mono text-white focus:outline-none focus:border-cyber-blue appearance-none min-w-[140px]"
                            >
                                <option value="ALL">全部机型</option>
                                {models.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-3 text-cyber-muted pointer-events-none" />
                        </div>
                        
                        {/* Count */}
                         <div className="flex items-center gap-2 text-cyber-blue font-mono text-sm ml-auto">
                            <Filter size={16} /> 
                            <span>显示: {filteredOrders.length} / 总数: {orders.length}</span>
                        </div>
                    </div>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left font-mono">
                        <thead>
                            <tr className="border-b border-cyber-muted/20 text-cyber-muted text-xs uppercase tracking-wider bg-cyber-bg/30">
                                <th className="p-4">机台号</th>
                                <th className="p-4">机型</th>
                                <th className="p-4">假日别</th>
                                <th className="p-4">状态</th>
                                <th className="p-4">生产车间</th>
                                <th className="p-4">计划上线</th>
                                <th className="p-4 text-cyber-orange">业务结关</th>
                                <th className="p-4 text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm divide-y divide-cyber-muted/10">
                            {filteredOrders.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="p-8 text-center text-cyber-muted opacity-60">
                                        无符合条件的记录
                                    </td>
                                </tr>
                            ) : (
                                filteredOrders.map(order => (
                                    <tr key={order.id} className="hover:bg-cyber-blue/5 transition-colors group">
                                        <td className="p-4 text-white group-hover:text-cyber-blue">
                                            <div className="flex items-baseline gap-0.5">
                                                <span>{order.id}</span>
                                                {order.zAxisTravel && (
                                                    <span className="text-xs font-normal text-cyber-muted/80">
                                                        (Z{order.zAxisTravel.replace(/mm/gi, '').trim()})
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-[10px] text-cyber-muted mt-1 font-normal opacity-70">
                                                {[order.axisHead, order.toolHolderSpec, order.spindleSpeed, order.magazineCount].filter(Boolean).join(' / ') || '-'}
                                            </div>
                                        </td>
                                        <td className="p-4 text-cyber-text/80">{getModelName(order.modelId)}</td>
                                        <td className="p-4 text-cyber-text/80">
                                            <span className="text-[10px] bg-cyber-muted/10 px-1 rounded border border-cyber-muted/20">
                                                {order.holidayType === 'DOUBLE' ? '双休' : 
                                                 order.holidayType === 'SINGLE' ? '单休' :
                                                 order.holidayType === 'ALTERNATE' ? '隔周休' : '无休'}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-0.5 text-[10px] border ${
                                                order.status === 'IN_PROGRESS' ? 'border-cyber-blue text-cyber-blue' :
                                                order.status === 'COMPLETED' ? 'border-green-500 text-green-500' :
                                                'border-cyber-muted text-cyber-muted'
                                            }`}>
                                                {order.status}
                                            </span>
                                        </td>
                                        <td className="p-4 text-cyber-muted">{order.workshop}</td>
                                        <td className="p-4 text-cyber-text/80">{new Date(order.startDate).toLocaleDateString()}</td>
                                        <td className="p-4 text-cyber-orange">
                                            {order.businessClosingDate ? new Date(order.businessClosingDate).toLocaleDateString() : '-'}
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button 
                                                    onClick={() => handleEditClick(order)}
                                                    className="p-1 text-cyber-blue hover:bg-cyber-blue/20 rounded transition-colors"
                                                    title="编辑"
                                                >
                                                    <Edit size={16} />
                                                </button>
                                                <button 
                                                    onClick={() => onDeleteOrder(order.id)}
                                                    className="p-1 text-cyber-muted hover:text-cyber-orange hover:bg-cyber-orange/20 rounded transition-colors"
                                                    title="删除"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        )}
    </div>
  );
};
