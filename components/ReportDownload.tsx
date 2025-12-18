
import React, { useState, useMemo, useRef } from 'react';
import { WorkOrder, MachineModel, MachineStatus, ProcessStep } from '../types';
import { FileDown, Table, AlertTriangle, FileClock, Download, CalendarDays, Factory, X, Play, Image as ImageIcon } from 'lucide-react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { calculateProjectedDate } from '../services/holidayService';

interface ReportDownloadProps {
  orders: WorkOrder[];
  models: MachineModel[];
}

export const ReportDownload: React.FC<ReportDownloadProps> = ({ orders, models }) => {
  const [dailyScheduleWorkshop, setDailyScheduleWorkshop] = useState<string | null>(null);
  const modalContentRef = useRef<HTMLDivElement>(null); // Ref for the modal content to capture

  // Helper to format date safely (avoid timezone shifts)
  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    // Use string manipulation for ISO dates to ensure YYYY-MM-DD matches DB exactly
    return dateString.split('T')[0];
  };

  // Helper for Header Date Display
  const getHeaderDate = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const weekMap = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const w = weekMap[now.getDay()];
    
    // Time formatting
    const hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12; // Convert 0 to 12

    return `${y}/${m}/${d} (${w}) ${formattedHours}:${minutes} ${ampm}`;
  };

  // Helper: Calculate Variance Days (Copied logic for report consistency)
  const calculateVariance = (order: WorkOrder, model: MachineModel) => {
      // 1. Calculate remaining hours
      let remainingHours = 0;
      const getRemainingHoursForStep = (s: ProcessStep) => {
          const status = order.stepStates?.[s.id]?.status;
          const isCompleted = status === 'COMPLETED' || status === 'SKIPPED';
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
      const projected = calculateProjectedDate(now, remainingHours, order.holidayType || 'DOUBLE');

      // 3. Variance (Normalize to midnight)
      let variance = 0;
      if (order.businessClosingDate) {
          const p = new Date(projected);
          p.setHours(0,0,0,0);
          const closing = new Date(order.businessClosingDate);
          closing.setHours(0,0,0,0);
          
          const diff = p.getTime() - closing.getTime();
          variance = Math.ceil(diff / (1000 * 60 * 60 * 24));
      }

      return { variance, projectedDate: projected };
  };

   // Helper to generate data for the Daily Schedule Modal
  const getDailyScheduleData = () => {
      if (!dailyScheduleWorkshop) return [];

      const targetOrders = orders.filter(o => 
          o.status === MachineStatus.IN_PROGRESS && 
          o.workshop?.startsWith(dailyScheduleWorkshop)
      );

      const todayStr = new Date().toDateString();

      return targetOrders.map(o => {
          const model = models.find(m => m.id === o.modelId);
          if (!model) return null;

          // Reuse calculateVariance logic
          const { variance, projectedDate } = calculateVariance(o, model);
          const progress = Math.round((o.currentStepIndex / model.steps.length) * 100);

          // Traffic Light Status
          const hasProgressToday = o.logs?.some(log => new Date(log.completedAt).toDateString() === todayStr);
          const dailyStatus = hasProgressToday ? 'GREEN' : 'YELLOW';

          // Parallel Modules Logic
          const moduleGroups: Record<string, ProcessStep[]> = {};
          model.steps.forEach(s => {
              const mod = s.parallelModule || '通用';
              if (!moduleGroups[mod]) moduleGroups[mod] = [];
              moduleGroups[mod].push(s);
          });

          const activeModuleDetails: string[] = [];
          
          Object.entries(moduleGroups).forEach(([modName, steps]) => {
              // Hide if fully complete (either COMPLETED or SKIPPED)
              const isModuleComplete = steps.every(s => {
                  const status = o.stepStates?.[s.id]?.status;
                  return status === 'COMPLETED' || status === 'SKIPPED';
              });
              
              if (isModuleComplete) return;

              // Find logic
              let targetStep = steps.find(s => o.stepStates?.[s.id]?.status === 'IN_PROGRESS');
              let statusSuffix = '(进行中)';

              if (!targetStep) {
                  // Find last completed or skipped
                  const completedSteps = steps.filter(s => {
                      const st = o.stepStates?.[s.id]?.status;
                      return st === 'COMPLETED' || st === 'SKIPPED';
                  });
                  
                  if (completedSteps.length > 0) {
                      targetStep = completedSteps[completedSteps.length - 1];
                      statusSuffix = '(近期完工)';
                  } else {
                      targetStep = steps[0];
                      statusSuffix = '(待开工)';
                  }
              }

              if (targetStep) {
                  activeModuleDetails.push(`【${modName}】${targetStep.module}: ${targetStep.name} ${statusSuffix}`);
              }
          });

          return {
              id: o.id,
              clientName: o.clientName,
              progress,
              variance,
              startDate: o.startDate,
              projectedDate,
              closingDate: o.businessClosingDate,
              materialRate: "60%",
              dailyStatus,
              details: activeModuleDetails
          };
      }).filter(Boolean) as any[]; // Cast to avoid TS null issues
  };

  const dailyScheduleData = useMemo(() => getDailyScheduleData(), [dailyScheduleWorkshop, orders, models]);

  // 1. Export All Production Orders
  const handleExportOrders = () => {
    const data = orders.map(o => {
      const model = models.find(m => m.id === o.modelId);
      const progress = model ? Math.round((o.currentStepIndex / model.steps.length) * 100) : 0;
      
      return {
        "机台号": o.id,
        "机型名称": model?.name || o.modelId,
        "客户": o.clientName || '',
        "状态": o.status,
        "车间": o.workshop,
        "进度": `${progress}%`,
        "计划上线日": formatDate(o.startDate),
        "预计完工日": formatDate(o.estimatedCompletionDate),
        "业务结关日": formatDate(o.businessClosingDate),
        "假日规则": o.holidayType,
        "Z轴行程": o.zAxisTravel,
        "刀库": o.magazineCount
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "生产工单清单");
    XLSX.writeFile(wb, `生产工单报表_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // 2. Export Anomalies
  const handleExportAnomalies = () => {
    const anomalies = orders.flatMap(o => {
      return (o.anomalies || []).map(a => ({
        "机台号": o.id,
        "车间": o.workshop,
        "异常工序": a.stepName,
        "异常原因": a.reason,
        "责任单位": a.department,
        "开始时间": new Date(a.startTime).toLocaleString(),
        "结束时间": a.endTime ? new Date(a.endTime).toLocaleString() : '未结束',
        "影响天数": a.durationDays
      }));
    });

    if (anomalies.length === 0) {
        alert("暂无异常记录可导出");
        return;
    }

    const ws = XLSX.utils.json_to_sheet(anomalies);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "异常记录");
    XLSX.writeFile(wb, `异常记录报表_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // 3. Export Logs (Completed Steps)
  const handleExportLogs = () => {
      const logs = orders.flatMap(o => {
          const model = models.find(m => m.id === o.modelId);
          return (o.logs || []).map(l => {
              const stepName = model?.steps.find(s => s.id === l.stepId)?.name || l.stepId;
              return {
                  "机台号": o.id,
                  "工序名称": stepName,
                  "完成时间": new Date(l.completedAt).toLocaleString(),
                  "操作员": l.completedBy,
                  "备注": l.notes || ''
              };
          });
      });

      if (logs.length === 0) {
          alert("暂无生产日志可导出");
          return;
      }

      const ws = XLSX.utils.json_to_sheet(logs);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "生产日志");
      XLSX.writeFile(wb, `生产日志报表_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // 4. Export Daily Schedule Logic (Reusable for the modal button)
  const handleExportDailySchedule = (workshopPrefix: string) => {
      const targetOrders = orders.filter(o => 
          o.status === MachineStatus.IN_PROGRESS && 
          o.workshop?.startsWith(workshopPrefix)
      );

      if (targetOrders.length === 0) {
          alert(`${workshopPrefix}车间当前无进行中的机台。`);
          return;
      }

      const todayStr = new Date().toDateString();

      const data = targetOrders.map(o => {
          const model = models.find(m => m.id === o.modelId);
          if (!model) return null;

          const { variance, projectedDate } = calculateVariance(o, model);
          const progress = Math.round((o.currentStepIndex / model.steps.length) * 100);
          const hasProgressToday = o.logs?.some(log => new Date(log.completedAt).toDateString() === todayStr);
          const dailyStatus = hasProgressToday ? '🟢 正常 (今日有产出)' : '🟡 滞后 (今日无产出)';

          const moduleGroups: Record<string, ProcessStep[]> = {};
          model.steps.forEach(s => {
              const mod = s.parallelModule || '通用';
              if (!moduleGroups[mod]) moduleGroups[mod] = [];
              moduleGroups[mod].push(s);
          });

          const activeModuleDetails: string[] = [];
          
          Object.entries(moduleGroups).forEach(([modName, steps]) => {
              const isModuleComplete = steps.every(s => {
                  const st = o.stepStates?.[s.id]?.status;
                  return st === 'COMPLETED' || st === 'SKIPPED';
              });
              if (isModuleComplete) return;

              let targetStep = steps.find(s => o.stepStates?.[s.id]?.status === 'IN_PROGRESS');
              let statusSuffix = ' (进行中)';

              if (!targetStep) {
                  const completedSteps = steps.filter(s => {
                      const st = o.stepStates?.[s.id]?.status;
                      return st === 'COMPLETED' || st === 'SKIPPED';
                  });
                  if (completedSteps.length > 0) {
                      targetStep = completedSteps[completedSteps.length - 1];
                      statusSuffix = ' (近期完工)';
                  } else {
                      targetStep = steps[0];
                      statusSuffix = ' (待开工)';
                  }
              }

              if (targetStep) {
                  activeModuleDetails.push(`【${modName}】${targetStep.module}: ${targetStep.name}${statusSuffix}`);
              }
          });

          return {
              "客户": o.clientName || '',
              "机台号": o.id,
              "进度": `${progress}%`,
              "差异天数": variance > 0 ? `+${variance}` : variance,
              "上线日": formatDate(o.startDate),
              "计划完工": formatDate(projectedDate.toISOString()),
              "结关日": formatDate(o.businessClosingDate),
              "发料率": "60%",
              "当日状态": dailyStatus,
              "各平线模组进度": activeModuleDetails.join("\n") 
          };
      }).filter(Boolean);

      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [
          { wch: 10 }, { wch: 18 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 20 }, { wch: 60 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `${workshopPrefix}日排程`);
      XLSX.writeFile(wb, `${workshopPrefix}车间日排程_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // 5. Export Image (JPG) Logic
  const handleExportImage = async () => {
    if (!modalContentRef.current) return;
    
    // Create clone to capture full height content
    const element = modalContentRef.current;
    const clone = element.cloneNode(true) as HTMLElement;
    
    // Setup clone styles to expand full height
    clone.style.position = 'fixed'; 
    clone.style.top = '-10000px';
    clone.style.left = '-10000px';
    clone.style.width = `${element.offsetWidth}px`;
    clone.style.height = 'auto';
    clone.style.maxHeight = 'none';
    clone.style.overflow = 'visible';
    clone.style.zIndex = '-1000';
    
    // Expand the scrollable content container
    const scrollableContainer = clone.querySelector('.overflow-y-auto') as HTMLElement;
    if (scrollableContainer) {
        scrollableContainer.style.overflow = 'visible';
        scrollableContainer.style.height = 'auto';
        scrollableContainer.style.maxHeight = 'none';
    }
    
    // Fix sticky header for screenshot (make it static so it sits at top)
    const stickyHeader = clone.querySelector('thead.sticky') as HTMLElement;
    if (stickyHeader) {
        stickyHeader.style.position = 'static';
    }

    document.body.appendChild(clone);
    
    try {
        // Short delay to ensure rendering
        await new Promise(resolve => setTimeout(resolve, 100));

        const canvas = await html2canvas(clone, {
            backgroundColor: '#0f172a', // force background color to match cyber-card
            scale: 2, // higher resolution
            logging: false,
            useCORS: true,
            ignoreElements: (element) => {
                // Ignore the button group during capture so it looks like a report
                return element.classList.contains('no-print');
            },
            windowHeight: clone.scrollHeight,
            height: clone.scrollHeight
        });
        
        const image = canvas.toDataURL("image/jpeg", 0.9);
        const link = document.createElement("a");
        link.download = `${dailyScheduleWorkshop || 'Schedule'}_日报表_${new Date().toISOString().split('T')[0]}.jpg`;
        link.href = image;
        link.click();
    } catch (err) {
        console.error("Image Export Failed:", err);
        alert("图片导出失败，请重试");
    } finally {
        if (document.body.contains(clone)) {
            document.body.removeChild(clone);
        }
    }
  };

  return (
    <>
        {/* Full Screen Modal for Daily Schedule View */}
        {dailyScheduleWorkshop && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-fade-in">
              <div ref={modalContentRef} className="bg-cyber-card border border-cyber-blue shadow-neon-blue w-full max-w-6xl h-[80vh] flex flex-col relative mx-auto">
                  {/* Modal Header */}
                  <div className="bg-cyber-blue/10 p-4 border-b border-cyber-blue/30 flex justify-between items-center">
                      <div className="flex items-center gap-4">
                           <Factory size={28} className="text-cyber-orange" />
                           <div>
                               <h2 className="text-xl font-display font-bold text-white tracking-widest">{dailyScheduleWorkshop} 车间日排程动态</h2>
                               <p className="text-xs text-white/90 font-mono opacity-90">{getHeaderDate()}</p>
                           </div>
                      </div>
                      
                      {/* Button Group (Ignored in Screenshot) */}
                      <div className="flex gap-4 items-center no-print">
                          <button 
                             onClick={handleExportImage}
                             className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500 text-indigo-400 hover:bg-indigo-500 hover:text-black px-4 py-1.5 rounded text-xs font-bold transition-all shadow-[0_0_10px_rgba(99,102,241,0.3)]"
                          >
                             <ImageIcon size={16} /> 导出图片
                          </button>
                          <button 
                             onClick={() => handleExportDailySchedule(dailyScheduleWorkshop)}
                             className="flex items-center gap-2 bg-green-500/10 border border-green-500 text-green-400 hover:bg-green-500 hover:text-black px-4 py-1.5 rounded text-xs font-bold transition-all shadow-[0_0_10px_rgba(34,197,94,0.3)]"
                          >
                             <Download size={16} /> 导出 Excel
                          </button>
                          <button onClick={() => setDailyScheduleWorkshop(null)} className="text-cyber-muted hover:text-white transition-colors bg-cyber-bg p-1 rounded-full border border-cyber-muted/30">
                              <X size={24} />
                          </button>
                      </div>
                  </div>

                  {/* Modal Content - Table */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                       {dailyScheduleData.length === 0 ? (
                           <div className="h-full flex flex-col items-center justify-center text-cyber-muted opacity-50">
                               <CalendarDays size={48} className="mb-4"/>
                               <p>该车间当前无进行中的机台排程</p>
                           </div>
                       ) : (
                           <table className="w-full text-left border-collapse">
                               <thead className="sticky top-0 bg-cyber-card z-10 text-xs font-mono uppercase tracking-wider text-cyber-blue shadow-lg">
                                   <tr>
                                       <th className="p-1.5 border-b border-cyber-blue/30 w-12">客户</th>
                                       <th className="p-1.5 border-b border-cyber-blue/30">机台号</th>
                                       <th className="p-1.5 border-b border-cyber-blue/30 w-16">进度</th>
                                       <th className="p-1.5 border-b border-cyber-blue/30 w-16">差异</th>
                                       <th className="p-1.5 border-b border-cyber-blue/30 w-24">当日状态</th>
                                       <th className="p-1.5 border-b border-cyber-blue/30 w-24">上线日</th>
                                       <th className="p-1.5 border-b border-cyber-blue/30 w-24">计划完工</th>
                                       <th className="p-1.5 border-b border-cyber-blue/30 w-24 text-cyber-orange">结关日</th>
                                       <th className="p-1.5 border-b border-cyber-blue/30 w-20">发料率</th>
                                       <th className="p-1.5 border-b border-cyber-blue/30 w-[250px]">进行中平线模组详情</th>
                                   </tr>
                               </thead>
                               <tbody className="text-sm font-mono divide-y divide-cyber-muted/10">
                                   {dailyScheduleData.map((row) => (
                                       <tr key={row.id} className="hover:bg-cyber-blue/5 transition-colors group">
                                           <td className="p-1.5 text-cyber-muted text-xs">{(row.clientName || '').substring(0, 2)}</td>
                                           <td className="p-1.5 font-bold text-white">{row.id}</td>
                                           <td className="p-1.5">
                                               <span className={`font-bold ${row.progress === 100 ? 'text-green-400' : 'text-cyber-blue'}`}>
                                                   {row.progress}%
                                               </span>
                                           </td>
                                           <td className="p-1.5">
                                                <span className={`font-bold ${row.variance > 0 ? 'text-cyber-orange' : 'text-green-400'}`}>
                                                    {row.variance > 0 ? `+${row.variance}` : row.variance}
                                                </span>
                                           </td>
                                           <td className="p-1.5">
                                               {row.dailyStatus === 'GREEN' ? (
                                                   <span className="flex items-center gap-1 text-green-400 border border-green-500/30 bg-green-500/10 px-2 py-0.5 rounded text-xs w-fit">
                                                       <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span> 正常
                                                   </span>
                                               ) : (
                                                   <span className="flex items-center gap-1 text-cyber-orange border border-cyber-orange/30 bg-cyber-orange/10 px-2 py-0.5 rounded text-xs w-fit">
                                                       <span className="w-2 h-2 rounded-full bg-cyber-orange"></span> 滞后
                                                   </span>
                                               )}
                                           </td>
                                           <td className="p-1.5 text-cyber-muted">{new Date(row.startDate).toLocaleDateString()}</td>
                                           <td className="p-1.5 text-white">{new Date(row.projectedDate).toLocaleDateString()}</td>
                                           <td className="p-1.5 text-cyber-orange font-bold">
                                               {row.closingDate ? new Date(row.closingDate).toLocaleDateString() : '-'}
                                           </td>
                                           <td className="p-1.5 text-cyber-muted">{row.materialRate}</td>
                                           <td className="p-1.5 text-xs">
                                               <div className="flex flex-col gap-1 w-[250px]">
                                                   {row.details.map((detail: string, idx: number) => (
                                                       <div key={idx} className="bg-cyber-bg/50 px-2 py-1 rounded border border-cyber-muted/20 text-cyber-text/80 whitespace-nowrap overflow-hidden text-ellipsis max-w-full" title={detail}>
                                                           {detail}
                                                       </div>
                                                   ))}
                                                   {row.details.length === 0 && <span className="text-cyber-muted opacity-50">全线完工或无数据</span>}
                                               </div>
                                           </td>
                                       </tr>
                                   ))}
                               </tbody>
                           </table>
                       )}
                  </div>
              </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto animate-fade-in relative">
            <div className="flex items-center gap-4 border-b border-cyber-blue/30 pb-6 mb-8">
                <div className="p-4 bg-cyber-blue/10 rounded-full border border-cyber-blue/30 shadow-neon-blue">
                    <FileDown size={32} className="text-cyber-blue" />
                </div>
                <div>
                    <h2 className="text-2xl font-display font-bold text-white">数据报表中心</h2>
                    <p className="text-cyber-muted font-mono text-sm mt-1">
                        导出工厂运营数据，支持 Excel 格式。
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                 {/* Card 4: Production Workshop Dynamic (Moved from Workstation) */}
                 <div className="bg-cyber-card border border-cyber-muted/20 p-6 relative overflow-hidden group hover:border-cyan-400/50 transition-all shadow-lg flex flex-col">
                     <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                         <CalendarDays size={100} />
                     </div>
                     
                     <div className="flex items-center gap-3 mb-4">
                         <Factory size={24} className="text-cyan-400" />
                         <h3 className="text-lg font-bold text-white">生产车间动态</h3>
                     </div>
                     <p className="text-sm text-cyber-muted mb-6 flex-1">
                         查看各车间（K1/K2/K3）进行中机台的日报表图表。包含红绿灯状态与平线模组进度。
                     </p>
                     
                     <div className="grid grid-cols-3 gap-2">
                         <button 
                            onClick={() => setDailyScheduleWorkshop('K1')}
                            className="bg-cyan-400/10 border border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-black py-2 font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 shadow-[0_0_5px_rgba(34,211,238,0.3)] text-xs rounded"
                         >
                             <Play size={12} fill="currentColor"/> K1
                         </button>
                         <button 
                            onClick={() => setDailyScheduleWorkshop('K2')}
                            className="bg-cyan-400/10 border border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-black py-2 font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 shadow-[0_0_5px_rgba(34,211,238,0.3)] text-xs rounded"
                         >
                             <Play size={12} fill="currentColor"/> K2
                         </button>
                         <button 
                            onClick={() => setDailyScheduleWorkshop('K3')}
                            className="bg-cyan-400/10 border border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-black py-2 font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 shadow-[0_0_5px_rgba(34,211,238,0.3)] text-xs rounded"
                         >
                             <Play size={12} fill="currentColor"/> K3
                         </button>
                     </div>
                </div>

                {/* Card 1: Production Orders */}
                <div className="bg-cyber-card border border-cyber-muted/20 p-6 relative overflow-hidden group hover:border-cyber-blue/50 transition-all shadow-lg flex flex-col">
                     <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                         <Table size={100} />
                     </div>
                     
                     <div className="flex items-center gap-3 mb-4">
                         <Table size={24} className="text-cyber-blue" />
                         <h3 className="text-lg font-bold text-white">生产工单总表</h3>
                     </div>
                     <p className="text-sm text-cyber-muted mb-6 flex-1">
                         包含所有机台的详细信息、当前状态、生产进度百分比、客户信息及计划/实际日期对比。
                     </p>
                     <button 
                        onClick={handleExportOrders}
                        className="w-full bg-cyber-blue/10 border border-cyber-blue text-cyber-blue hover:bg-cyber-blue hover:text-black py-3 px-4 font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-neon-blue rounded"
                     >
                         <Download size={18} /> 导出 Excel
                     </button>
                </div>

                {/* Card 2: Anomalies */}
                <div className="bg-cyber-card border border-cyber-muted/20 p-6 relative overflow-hidden group hover:border-cyber-orange/50 transition-all shadow-lg flex flex-col">
                     <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                         <AlertTriangle size={100} />
                     </div>
                     
                     <div className="flex items-center gap-3 mb-4">
                         <AlertTriangle size={24} className="text-cyber-orange" />
                         <h3 className="text-lg font-bold text-white">异常记录清单</h3>
                     </div>
                     <p className="text-sm text-cyber-muted mb-6 flex-1">
                         汇整全厂所有机台的异常申报记录，包含原因、责任单位及自动计算的影响天数。
                     </p>
                     <button 
                        onClick={handleExportAnomalies}
                        className="w-full bg-cyber-orange/10 border border-cyber-orange text-cyber-orange hover:bg-cyber-orange hover:text-black py-3 px-4 font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-neon-orange rounded"
                     >
                         <Download size={18} /> 导出 Excel
                     </button>
                </div>

                {/* Card 3: Logs */}
                <div className="bg-cyber-card border border-cyber-muted/20 p-6 relative overflow-hidden group hover:border-green-500/50 transition-all shadow-lg flex flex-col">
                     <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                         <FileClock size={100} />
                     </div>
                     
                     <div className="flex items-center gap-3 mb-4">
                         <FileClock size={24} className="text-green-400" />
                         <h3 className="text-lg font-bold text-white">生产日志流水</h3>
                     </div>
                     <p className="text-sm text-cyber-muted mb-6 flex-1">
                         详细的工序完工记录流水帐，包含具体的操作人员、完工时间点及相关备注。
                     </p>
                     <button 
                        onClick={handleExportLogs}
                        className="w-full bg-green-500/10 border border-green-500 text-green-400 hover:bg-green-500 hover:text-black py-3 px-4 font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-[0_0_10px_rgba(34,197,94,0.3)] rounded"
                     >
                         <Download size={18} /> 导出 Excel
                     </button>
                </div>
            </div>
        </div>
    </>
  );
};
