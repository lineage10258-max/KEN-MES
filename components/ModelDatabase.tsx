
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { MachineModel, ProcessStep, ModelDatabaseProps } from '../types';
import { Plus, Trash2, Save, Database, Cpu, FileDown, Upload, Edit, X, Calculator, Loader2, Users, Check, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';

const DEPT_MAP = [
    { label: '生', fullName: '生產' },
    { label: '電', fullName: '電控' },
    { label: '品', fullName: '品檢' },
    { label: '技', fullName: '技術' },
    { label: '應', fullName: '應用' }
];

const DeptToggleGroup: React.FC<{
    selected: string[];
    onChange: (depts: string[]) => void;
}> = ({ selected = [], onChange }) => {
    const toggleDept = (fullName: string) => {
        const newDepts = selected.includes(fullName)
            ? selected.filter(d => d !== fullName)
            : [...selected, fullName];
        onChange(newDepts);
    };

    return (
        <div className="flex gap-1">
            {DEPT_MAP.map((dept) => {
                const isActive = selected.includes(dept.fullName);
                return (
                    <button
                        key={dept.fullName}
                        type="button"
                        onClick={() => toggleDept(dept.fullName)}
                        title={dept.fullName}
                        className={`w-7 h-7 flex items-center justify-center rounded-sm text-[11px] font-bold transition-all duration-300 border ${
                            isActive
                                ? 'bg-cyber-blue border-cyber-blue text-black shadow-neon-blue scale-110'
                                : 'bg-cyber-bg border-cyber-muted/20 text-cyber-muted hover:border-cyber-blue/50 hover:text-cyber-blue/70'
                        }`}
                    >
                        {dept.label}
                    </button>
                );
            })}
        </div>
    );
};

export const ModelDatabase: React.FC<ModelDatabaseProps> = ({ models, onAddModel, onUpdateModel, onDeleteModel }) => {
  const [activeTab, setActiveTab] = useState<'LIST' | 'CREATE'>('LIST');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newModelName, setNewModelName] = useState('');
  const [scheduleCalculationModule, setScheduleCalculationModule] = useState('');
  const [steps, setSteps] = useState<Omit<ProcessStep, 'id'>[]>([{ parallelModule: '', module: '', name: '', estimatedHours: 0, departments: [] }]);
  
  // Saving State
  const [isSaving, setIsSaving] = useState(false);

  // Derived unique parallel modules for the dropdown
  const uniqueParallelModules = useMemo(() => {
      const modules = steps.map(s => s.parallelModule).filter(m => m && m.trim() !== '');
      return Array.from(new Set(modules));
  }, [steps]);

  const handleAddStepField = () => {
    setSteps([...steps, { parallelModule: '', module: '', name: '', estimatedHours: 0, departments: [] }]);
  };

  const handleRemoveStepField = (index: number) => {
    const newSteps = [...steps];
    newSteps.splice(index, 1);
    setSteps(newSteps);
  };

  const handleStepChange = (index: number, field: keyof Omit<ProcessStep, 'id'>, value: any) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setSteps(newSteps);
  };

  const handleEditClick = (model: MachineModel) => {
      setEditingId(model.id);
      setNewModelName(model.name);
      setScheduleCalculationModule(model.scheduleCalculationModule || '');
      // Map existing steps to form format
      const formSteps = model.steps.map(s => ({
          parallelModule: s.parallelModule || '通用',
          module: s.module,
          name: s.name,
          estimatedHours: s.estimatedHours,
          departments: s.departments || []
      }));
      setSteps(formSteps.length > 0 ? formSteps : [{ parallelModule: '', module: '', name: '', estimatedHours: 0, departments: [] }]);
      setActiveTab('CREATE');
  };

  const handleCancelEdit = () => {
      setEditingId(null);
      setNewModelName('');
      setScheduleCalculationModule('');
      setSteps([{ parallelModule: '', module: '', name: '', estimatedHours: 0, departments: [] }]);
      setActiveTab('LIST');
  };

  const handleSaveModel = async () => {
    if (!newModelName.trim()) return;
    
    const modelId = editingId || `M-${newModelName.substring(0, 3).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
    
    const fullSteps: ProcessStep[] = steps
        .filter(s => s.name.trim() !== '')
        .map((s, i) => ({
            id: `s-${modelId}-${i}`,
            parallelModule: s.parallelModule || '通用',
            module: s.module || '通用',
            name: s.name,
            estimatedHours: Number(s.estimatedHours),
            departments: s.departments || []
        }));

    const modelPayload: MachineModel = {
        id: modelId,
        name: newModelName,
        steps: fullSteps,
        scheduleCalculationModule: scheduleCalculationModule || undefined
    };

    setIsSaving(true);
    try {
        if (editingId) {
            await onUpdateModel(modelPayload);
        } else {
            await onAddModel(modelPayload);
        }
        handleCancelEdit();
    } catch (error) {
        console.error("Error saving model:", error);
    } finally {
        setIsSaving(false);
    }
  };

  // Excel Logic
  const handleDownloadTemplate = () => {
    const wsData = [
      { "平线模组": "A线", "工序模组": "铸件基础", "工序名称": "底座安装", "部門別": "生產,技術", "预计工时": 4 },
      { "平线模组": "A线", "工序模组": "主轴系统", "工序名称": "主轴校正", "部門別": "生產,品檢", "预计工时": 2.5 },
      { "平线模组": "B线", "工序模组": "电气系统", "工序名称": "电气配线", "部門別": "電控", "预计工时": 8 }
    ];
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "工序模板");
    XLSX.writeFile(wb, "工序導入模板_V2.xlsx");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsName = wb.SheetNames[0];
      const ws = wb.Sheets[wsName];
      const data = XLSX.utils.sheet_to_json(ws);

      const validDeptNames = DEPT_MAP.map(d => d.fullName);
      const mappedSteps = data.map((row: any) => {
        const deptStr = String(row['部門別'] || row['Departments'] || '');
        const departments = deptStr ? deptStr.split(',').map(d => d.trim()).filter(d => validDeptNames.includes(d)) : [];
        
        return {
          parallelModule: row['平线模组'] || row['ParallelModule'] || '通用',
          module: row['工序模组'] || row['Module'] || '通用',
          name: row['工序名称'] || row['StepName'] || '',
          departments: departments,
          estimatedHours: Number(row['预计工时'] || row['EstimatedHours'] || 0)
        };
      }).filter(s => s.name);

      if (mappedSteps.length > 0) {
        setSteps(mappedSteps);
      } else {
        alert("未在文件中找到有效的工序数据。请確保列名為：'平线模组', '工序模组', '工序名称', '部門別', '预计工时'");
      }
      
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 text-cyber-text">
        
        <div className="flex border-b border-cyber-blue/30 mb-6">
            <button 
                onClick={() => { setActiveTab('LIST'); setEditingId(null); }}
                className={`px-6 py-3 font-mono text-sm transition-all ${activeTab === 'LIST' ? 'bg-cyber-blue/10 text-cyber-blue border-b-2 border-cyber-blue' : 'text-cyber-muted hover:text-white'}`}
            >
                [ 數據庫視圖 ]
            </button>
            <button 
                onClick={() => setActiveTab('CREATE')}
                className={`px-6 py-3 font-mono text-sm transition-all ${activeTab === 'CREATE' ? 'bg-cyber-blue/10 text-cyber-blue border-b-2 border-cyber-blue' : 'text-cyber-muted hover:text-white'}`}
            >
                [ {editingId ? '編輯工藝藍圖' : '新建工藝藍圖'} ]
            </button>
        </div>

      {activeTab === 'CREATE' ? (
        <div className="bg-cyber-card border border-cyber-blue/30 p-8 relative overflow-hidden shadow-neon-blue">
            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                <Database size={120} className="text-cyber-blue" />
            </div>

            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
                    {editingId ? <Edit className="text-cyber-orange" /> : <Plus className="text-cyber-blue" />}
                    {editingId ? '編輯機型工藝配置' : '創建新機型工藝'}
                </h2>
                {editingId && (
                    <button onClick={handleCancelEdit} className="text-xs text-cyber-muted hover:text-white flex items-center gap-1">
                        <X size={14}/> 取消編輯
                    </button>
                )}
            </div>

            <div className="space-y-6 relative z-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-mono text-cyber-blue mb-1 uppercase tracking-wider">機型名稱 / 代號</label>
                            <input 
                                type="text" 
                                value={newModelName}
                                onChange={(e) => setNewModelName(e.target.value)}
                                placeholder="例如: LINMAXB-G2"
                                className="w-full bg-cyber-bg border border-cyber-muted/40 p-3 text-white focus:border-cyber-blue focus:outline-none focus:shadow-[0_0_10px_rgba(0,240,255,0.3)] transition-all font-mono"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-mono text-cyber-orange mb-1 uppercase tracking-wider flex items-center gap-1">
                                <Calculator size={12} /> 排程計算 (主線)
                            </label>
                            <select 
                                value={scheduleCalculationModule}
                                onChange={(e) => setScheduleCalculationModule(e.target.value)}
                                className="w-full bg-cyber-bg border border-cyber-muted/40 p-3 text-white focus:border-cyber-orange focus:outline-none font-mono text-sm"
                            >
                                <option value="">-- 全工序彙總 (默認) --</option>
                                {uniqueParallelModules.map(mod => (
                                    <option key={mod} value={mod}>{mod} (獨立計算)</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    
                    <div className="flex flex-col justify-end pb-1">
                        <label className="block text-xs font-mono text-cyber-muted mb-2 uppercase tracking-wider">批量導入工具</label>
                        <div className="flex gap-2">
                            <button 
                                onClick={handleDownloadTemplate}
                                className="flex-1 bg-cyber-bg border border-cyber-muted/40 hover:border-cyber-blue hover:text-cyber-blue text-cyber-muted p-2 flex items-center justify-center gap-2 text-xs font-mono transition-all"
                            >
                                <FileDown size={14} /> 下載 Excel 模板
                            </button>
                            <button 
                                onClick={triggerFileUpload}
                                className="flex-1 bg-cyber-bg border border-cyber-muted/40 hover:border-green-500 hover:text-green-400 text-cyber-muted p-2 flex items-center justify-center gap-2 text-xs font-mono transition-all"
                            >
                                <Upload size={14} /> 導入 Excel 工序
                            </button>
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept=".xlsx, .xls" 
                                onChange={handleFileUpload}
                            />
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-mono text-cyber-blue mb-3 uppercase tracking-wider flex items-center gap-2">
                        <Users size={14}/> 生產工序流程配置
                    </label>
                    <div className="space-y-3">
                        {/* Headers */}
                        <div className="flex gap-3 px-2 mb-2 text-[10px] font-mono text-cyber-muted uppercase tracking-wider bg-cyber-bg/30 py-2 border-b border-cyber-muted/10">
                            <div className="w-8 text-center">#</div>
                            <div className="w-[10%]">平線模組</div>
                            <div className="w-[10%]">工序模組</div>
                            <div className="w-[160px] text-cyber-blue">責任部門 (生/電/品/技/應)</div>
                            <div className="flex-1">工序名稱</div>
                            <div className="w-24">預計工時</div>
                            <div className="w-8"></div>
                        </div>

                        {steps.map((step, idx) => (
                            <div key={idx} className="flex gap-3 items-center animate-fade-in group">
                                <div className="w-8 h-10 flex items-center justify-center font-mono text-cyber-muted text-sm border border-cyber-muted/20 bg-cyber-bg/50">
                                    {idx + 1}
                                </div>
                                <input 
                                    type="text" 
                                    value={step.parallelModule}
                                    onChange={(e) => handleStepChange(idx, 'parallelModule', e.target.value)}
                                    placeholder="平線"
                                    className="w-[10%] bg-cyber-bg border border-cyber-muted/40 p-2 text-cyber-orange focus:border-cyber-orange focus:outline-none font-mono text-xs"
                                />
                                <input 
                                    type="text" 
                                    value={step.module}
                                    onChange={(e) => handleStepChange(idx, 'module', e.target.value)}
                                    placeholder="模組"
                                    className="w-[10%] bg-cyber-bg border border-cyber-muted/40 p-2 text-cyber-blue focus:border-cyber-blue focus:outline-none font-mono text-xs"
                                />
                                <div className="w-[160px] flex items-center justify-center">
                                    <DeptToggleGroup 
                                        selected={step.departments || []} 
                                        onChange={(vals) => handleStepChange(idx, 'departments', vals)} 
                                    />
                                </div>
                                <input 
                                    type="text" 
                                    value={step.name}
                                    onChange={(e) => handleStepChange(idx, 'name', e.target.value)}
                                    placeholder="工序描述"
                                    className="flex-1 bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-xs"
                                />
                                <div className="flex items-center bg-cyber-bg border border-cyber-muted/40 px-2 w-24 focus-within:border-cyber-blue">
                                    <input 
                                        type="number" 
                                        value={step.estimatedHours}
                                        onChange={(e) => handleStepChange(idx, 'estimatedHours', e.target.value)}
                                        className="w-full bg-transparent p-2 text-white outline-none font-mono text-xs text-right"
                                    />
                                    <span className="text-[10px] text-cyber-muted ml-1">H</span>
                                </div>
                                <button 
                                    onClick={() => handleRemoveStepField(idx)}
                                    className="p-2 text-cyber-muted hover:text-cyber-orange transition-colors opacity-50 group-hover:opacity-100"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                    <button 
                        onClick={handleAddStepField}
                        className="mt-4 flex items-center gap-2 text-xs font-mono text-cyber-blue hover:text-white transition-colors border border-dashed border-cyber-blue/30 px-4 py-2 hover:border-cyber-blue bg-cyber-blue/5"
                    >
                        <Plus size={14} /> 添加工序行
                    </button>
                </div>

                <div className="pt-6 border-t border-cyber-muted/20 flex justify-end gap-4">
                     {editingId && (
                        <button 
                            onClick={handleCancelEdit}
                            className="bg-transparent border border-cyber-muted text-cyber-muted hover:text-white px-6 py-3 font-display font-bold uppercase tracking-wider transition-all"
                        >
                            取消
                        </button>
                    )}
                    <button 
                        onClick={handleSaveModel}
                        disabled={!newModelName || isSaving}
                        className="bg-cyber-blue/10 hover:bg-cyber-blue text-cyber-blue hover:text-black border border-cyber-blue px-8 py-3 font-display font-bold uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-neon-blue"
                    >
                        {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        {editingId ? '更新工藝藍圖' : '保存工藝藍圖'}
                    </button>
                </div>
            </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {models.map(model => (
                <div key={model.id} className="bg-cyber-card border border-cyber-muted/20 p-6 group hover:border-cyber-blue/50 transition-colors relative shadow-lg">
                     <div className="absolute top-0 left-0 w-1 h-0 group-hover:h-full bg-cyber-blue transition-all duration-300"></div>
                     <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                            <Cpu className="text-cyber-muted group-hover:text-cyber-blue transition-colors" />
                            <h3 className="text-lg font-display font-bold text-white">{model.name}</h3>
                        </div>
                        <span className="font-mono text-[10px] text-cyber-muted bg-cyber-bg px-2 py-0.5 rounded border border-cyber-muted/20">{model.id}</span>
                     </div>
                     
                     {model.scheduleCalculationModule && (
                         <div className="mb-4 text-xs font-mono text-cyber-orange border border-cyber-orange/30 px-2 py-1 bg-cyber-orange/5 inline-flex items-center gap-1 rounded">
                             <Calculator size={10} />
                             排程依據: {model.scheduleCalculationModule}
                         </div>
                     )}

                     <div className="space-y-2 mb-4 h-32 overflow-hidden relative">
                        {model.steps.slice(0, 4).map((step, i) => (
                            <div key={i} className="flex justify-between text-xs font-mono text-cyber-muted border-b border-cyber-muted/10 pb-1">
                                <div className="flex gap-2 truncate">
                                    <span className="text-cyber-orange/70 flex-shrink-0">[{step.parallelModule || '通'}]</span>
                                    <span className="text-cyber-blue flex-shrink-0">[{step.departments?.map(d => d.substring(0,1)).join('/') || '-'}]</span>
                                    <span className="truncate">{step.name}</span>
                                </div>
                                <span className="flex-shrink-0 ml-2">{step.estimatedHours}H</span>
                            </div>
                        ))}
                        {model.steps.length > 4 && (
                            <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-cyber-card to-transparent flex items-end justify-center">
                                <span className="text-[10px] text-cyber-blue font-mono mb-1">
                                    + 還有 {model.steps.length - 4} 道工序
                                </span>
                            </div>
                        )}
                     </div>

                     <div className="flex justify-between items-center text-xs font-mono text-cyber-muted mt-4 pt-4 border-t border-cyber-muted/20">
                         <span>總預計: {model.steps.reduce((acc, s) => acc + s.estimatedHours, 0)} 小時</span>
                         <div className="flex gap-3">
                             <button 
                                onClick={() => handleEditClick(model)}
                                className="flex items-center gap-1 text-cyber-blue hover:text-white transition-colors"
                            >
                                <Edit size={12} /> 編輯
                            </button>
                             <button 
                                onClick={() => onDeleteModel(model.id)}
                                className="flex items-center gap-1 text-cyber-muted hover:text-cyber-orange transition-colors"
                            >
                                <Trash2 size={12} /> 刪除
                            </button>
                         </div>
                     </div>
                </div>
            ))}
        </div>
      )}
    </div>
  );
};
