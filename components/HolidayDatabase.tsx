import React, { useRef, useState } from 'react';
import { Calendar, Info, Shield, Plus, X, FileDown, Upload } from 'lucide-react';
import { HolidayType, HolidayRule } from '../types';
import * as XLSX from 'xlsx';

interface HolidayDatabaseProps {
    rules: Record<HolidayType, HolidayRule>;
    onUpdateRule: (rule: HolidayRule) => void;
}

export const HolidayDatabase: React.FC<HolidayDatabaseProps> = ({ rules, onUpdateRule }) => {
    const [activeType, setActiveType] = useState<HolidayType>('DOUBLE');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Guard against empty rules during initial load
    const currentRule = rules[activeType] || { 
        type: 'DOUBLE', 
        name: '加载中...', 
        description: '', 
        specificHolidays: [] 
    };

    const handleAddDate = () => {
        const dateStr = prompt("请输入假日日期 (格式 YYYY-MM-DD):", new Date().toISOString().split('T')[0]);
        if (dateStr) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                alert("日期格式不正确，请使用 YYYY-MM-DD");
                return;
            }
            const updatedRule = { 
                ...currentRule, 
                specificHolidays: Array.from(new Set([...currentRule.specificHolidays, dateStr])).sort() 
            };
            onUpdateRule(updatedRule);
        }
    };

    const handleRemoveDate = (dateStr: string) => {
        const updatedRule = {
            ...currentRule,
            specificHolidays: currentRule.specificHolidays.filter(d => d !== dateStr)
        };
        onUpdateRule(updatedRule);
    };

    const handleDownloadTemplate = () => {
        const wsData = [
          { "日期": "2024/05/01" },
          { "日期": "2024/10/01" },
          { "日期": "2025/01/01" }
        ];
        const ws = XLSX.utils.json_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "假日导入模板");
        XLSX.writeFile(wb, "假日导入模板.xlsx");
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
        
              const newDates: string[] = [];
              data.forEach((row: any) => {
                  let dateVal = row['日期'] || row['Date'];
                   if (dateVal) {
                       let dateStr = String(dateVal).trim();
                       if (dateStr.includes('/')) {
                           dateStr = dateStr.replace(/\//g, '-');
                       }
                       if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                           newDates.push(dateStr);
                       }
                   }
              });
        
              if (newDates.length > 0) {
                const uniqueDates = Array.from(new Set([...currentRule.specificHolidays, ...newDates])).sort();
                const updatedRule = { 
                    ...currentRule, 
                    specificHolidays: uniqueDates
                };
                onUpdateRule(updatedRule);
                alert(`成功导入 ${newDates.length} 个日期。`);
              } else {
                alert("未找到有效日期格式 (YYYY/MM/DD 或 YYYY-MM-DD)。请确保列名为 '日期' 或 'Date'");
              }
          } catch (error) {
              console.error("Excel parse error:", error);
              alert("文件解析失败，请检查文件格式");
          }
          
          if (fileInputRef.current) fileInputRef.current.value = '';
        };
        reader.readAsBinaryString(file);
    };
    
    const triggerFileUpload = () => {
        fileInputRef.current?.click();
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
            <div className="flex items-center gap-4 border-b border-cyber-blue/30 pb-6">
                <div className="p-4 bg-cyber-blue/10 rounded-full border border-cyber-blue/30 shadow-neon-blue">
                    <Calendar size={32} className="text-cyber-blue" />
                </div>
                <div>
                    <h2 className="text-2xl font-display font-bold text-white">工厂行事历配置</h2>
                    <p className="text-cyber-muted font-mono text-sm mt-1">配置不同类型的假日规则，用于生产排程的自动计算。</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Left Sidebar: Type Selection */}
                <div className="lg:col-span-1 space-y-2">
                    <div className="text-xs font-mono text-cyber-blue uppercase tracking-wider mb-2">选择假日类型</div>
                    {(Object.values(rules) as HolidayRule[]).map((rule) => (
                        <button
                            key={rule.type}
                            onClick={() => setActiveType(rule.type)}
                            className={`w-full text-left p-4 border transition-all duration-300 relative overflow-hidden group ${
                                activeType === rule.type 
                                ? 'bg-cyber-blue/10 border-cyber-blue text-white shadow-neon-blue' 
                                : 'bg-cyber-card border-cyber-muted/20 text-cyber-muted hover:border-cyber-blue/50 hover:text-white'
                            }`}
                        >
                             <div className="relative z-10 flex justify-between items-center">
                                 <span className="font-display font-bold">{rule.name}</span>
                                 {activeType === rule.type && <Shield size={16} className="text-cyber-blue" />}
                             </div>
                             <div className={`absolute left-0 top-0 bottom-0 w-1 ${activeType === rule.type ? 'bg-cyber-blue' : 'bg-transparent group-hover:bg-cyber-muted'}`}></div>
                        </button>
                    ))}
                </div>

                {/* Main Content: Configuration */}
                <div className="lg:col-span-3 bg-cyber-card border border-cyber-blue/30 p-6 relative shadow-lg">
                    {/* Tech Corners */}
                    <div className="absolute top-0 left-0 w-3 h-3 border-l border-t border-cyber-blue"></div>
                    <div className="absolute top-0 right-0 w-3 h-3 border-r border-t border-cyber-blue"></div>
                    <div className="absolute bottom-0 left-0 w-3 h-3 border-l border-b border-cyber-blue"></div>
                    <div className="absolute bottom-0 right-0 w-3 h-3 border-r border-b border-cyber-blue"></div>

                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h3 className="text-xl font-bold text-white mb-2">{currentRule.name}规则设置</h3>
                            <p className="text-cyber-muted font-mono text-sm flex items-center gap-2">
                                <Info size={14}/> {currentRule.description}
                            </p>
                        </div>
                        <div className="text-xs font-mono px-3 py-1 border border-cyber-blue/30 rounded bg-cyber-blue/5 text-cyber-blue">
                            Code: {currentRule.type}
                        </div>
                    </div>

                    <div className="border-t border-cyber-muted/20 pt-6">
                         <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                             <h4 className="text-sm font-bold text-cyber-orange uppercase tracking-wider flex items-center gap-2">
                                 特殊停工日期 / 额外假日
                             </h4>
                             
                             <div className="flex gap-2">
                                 <button 
                                    onClick={handleDownloadTemplate}
                                    className="text-xs flex items-center gap-1 bg-cyber-bg border border-cyber-muted/40 hover:border-cyber-blue hover:text-cyber-blue text-cyber-muted px-3 py-1.5 transition-colors"
                                 >
                                     <FileDown size={12} /> 模板
                                 </button>
                                 <button 
                                    onClick={triggerFileUpload}
                                    className="text-xs flex items-center gap-1 bg-cyber-bg border border-cyber-muted/40 hover:border-green-500 hover:text-green-400 text-cyber-muted px-3 py-1.5 transition-colors"
                                 >
                                     <Upload size={12} /> 导入
                                 </button>
                                 <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    className="hidden" 
                                    accept=".xlsx, .xls" 
                                    onChange={handleFileUpload}
                                />
                                 <button 
                                    onClick={handleAddDate}
                                    className="text-xs flex items-center gap-1 bg-cyber-blue/10 hover:bg-cyber-blue text-cyber-blue hover:text-black px-3 py-1.5 border border-cyber-blue/50 transition-colors"
                                 >
                                     <Plus size={12} /> 添加日期
                                 </button>
                             </div>
                         </div>
                         
                         {currentRule.specificHolidays.length === 0 ? (
                             <div className="p-8 border border-dashed border-cyber-muted/20 text-center text-cyber-muted/50 font-mono text-sm">
                                 暂无特殊指定假日。
                                 <br/>
                                 系统将仅依照 "{currentRule.name}" 的默认周休规则进行计算。
                             </div>
                         ) : (
                             <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                                 {currentRule.specificHolidays.map(date => (
                                     <div key={date} className="bg-cyber-bg border border-cyber-muted/30 px-3 py-2 flex justify-between items-center group hover:border-cyber-orange/50 transition-colors">
                                         <span className="font-mono text-white text-sm">{date}</span>
                                         <button onClick={() => handleRemoveDate(date)} className="text-cyber-muted hover:text-red-500 opacity-50 group-hover:opacity-100 transition-opacity">
                                             <X size={14} />
                                         </button>
                                     </div>
                                 ))}
                             </div>
                         )}
                    </div>

                    <div className="mt-8 pt-6 border-t border-cyber-muted/20">
                         <h4 className="text-sm font-bold text-cyber-blue uppercase tracking-wider mb-2">应用说明</h4>
                         <ul className="list-disc list-inside text-xs text-cyber-muted space-y-1 font-mono">
                             <li>更改此处的规则將實時保存至數據庫，并影响所有绑定了 "{currentRule.name}" 类型的机台排程。</li>
                             <li>计划完工日会自动跳过上述定义的休息日。</li>
                             <li>支持批量导入日期格式：YYYY/MM/DD 或 YYYY-MM-DD</li>
                         </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};