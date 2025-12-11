
import React from 'react';
import { WorkOrder, MachineModel, MachineStatus, ProcessStep } from '../types';
import { FileDown, Table, AlertTriangle, FileClock, Download, CalendarDays, Factory } from 'lucide-react';
import * as XLSX from 'xlsx';
import { calculateProjectedDate } from '../services/holidayService';

interface ReportDownloadProps {
  orders: WorkOrder[];
  models: MachineModel[];
}

export const ReportDownload: React.FC<ReportDownloadProps> = ({ orders, models }) => {

  // Helper to format date
  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    const d = new Date(dateString);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  };

  // Helper: Calculate Variance Days (Copied logic for report consistency)
  const calculateVariance = (order: WorkOrder, model: MachineModel) => {
      // 1. Calculate remaining hours
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
      const projected = calculateProjectedDate(now, remainingHours, order.holidayType || 'DOUBLE');

      // 3. Variance
      let variance = 0;
      if (order.businessClosingDate) {
          const closing = new Date(order.businessClosingDate);
          const diff = projected.getTime() - closing.getTime();
          variance = Math.ceil(diff / (1000 * 60 * 60 * 24));
      }

      return { variance, projectedDate: projected };
  };

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

  // 4. Export Daily Schedule (Generic for K1, K2, K3)
  const handleExportDailySchedule = (workshopPrefix: string) => {
      // Filter: Specific Workshop AND In Progress
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

          // A. Calculate Metrics
          const { variance, projectedDate } = calculateVariance(o, model);
          const progress = Math.round((o.currentStepIndex / model.steps.length) * 100);

          // B. Determine Daily Status (Traffic Light)
          // Check if any log entry exists for TODAY
          const hasProgressToday = o.logs?.some(log => new Date(log.completedAt).toDateString() === todayStr);
          const dailyStatus = hasProgressToday ? '🟢 今日有产出' : '🟡 今日无完工';

          // C. Analyze Parallel Modules
          const moduleGroups: Record<string, ProcessStep[]> = {};
          model.steps.forEach(s => {
              const mod = s.parallelModule || '通用';
              if (!moduleGroups[mod]) moduleGroups[mod] = [];
              moduleGroups[mod].push(s);
          });

          // Build detail string for active modules
          const activeModuleDetails: string[] = [];
          
          Object.entries(moduleGroups).forEach(([modName, steps]) => {
              // Rule: If module is fully completed, do not show
              const isModuleComplete = steps.every(s => o.stepStates?.[s.id]?.status === 'COMPLETED');
              
              if (!isModuleComplete) {
                  // Rule: Find Active Step (IN_PROGRESS)
                  let targetStep = steps.find(s => o.stepStates?.[s.id]?.status === 'IN_PROGRESS');
                  let statusSuffix = '(进行中)';

                  // Rule: If none IN_PROGRESS, use Recently Completed
                  if (!targetStep) {
                      const completedSteps = steps.filter(s => o.stepStates?.[s.id]?.status === 'COMPLETED');
                      if (completedSteps.length > 0) {
                          targetStep = completedSteps[completedSteps.length - 1];
                          statusSuffix = '(刚完工)';
                      } else {
                          // Fallback: Pending Start
                          targetStep = steps[0];
                          statusSuffix = '(待开工)';
                      }
                  }

                  if (targetStep) {
                      // Format: [Module] SubModule: Name
                      activeModuleDetails.push(`[${modName}] ${targetStep.module}: ${targetStep.name} ${statusSuffix}`);
                  }
              }
          });

          return {
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
      
      // Auto-width for columns
      ws['!cols'] = [
          { wch: 15 }, // ID
          { wch: 8 },  // Progress
          { wch: 10 }, // Variance
          { wch: 12 }, // Start
          { wch: 12 }, // End
          { wch: 12 }, // Closing
          { wch: 8 },  // Material
          { wch: 15 }, // Status
          { wch: 60 }, // Details (Wide)
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `${workshopPrefix}日排程`);
      XLSX.writeFile(wb, `${workshopPrefix}车间日排程_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
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
             {/* Card 4: Generic Workshop Daily Schedule */}
             <div className="bg-cyber-card border border-cyber-muted/20 p-6 relative overflow-hidden group hover:border-cyan-400/50 transition-all shadow-lg flex flex-col">
                 <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                     <CalendarDays size={100} />
                 </div>
                 
                 <div className="flex items-center gap-3 mb-4">
                     <Factory size={24} className="text-cyan-400" />
                     <h3 className="text-lg font-bold text-white">车间日排程</h3>
                 </div>
                 <p className="text-sm text-cyber-muted mb-6 flex-1">
                     生成指定车间（K1/K2/K3）进行中机台的日报表，包含差异天数、当日红绿灯状态及各平线工序进度。
                 </p>
                 
                 <div className="grid grid-cols-3 gap-2">
                     <button 
                        onClick={() => handleExportDailySchedule('K1')}
                        className="bg-cyan-400/10 border border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-black py-2 font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 shadow-[0_0_5px_rgba(34,211,238,0.3)] text-xs"
                     >
                         <Download size={14} /> K1
                     </button>
                     <button 
                        onClick={() => handleExportDailySchedule('K2')}
                        className="bg-cyan-400/10 border border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-black py-2 font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 shadow-[0_0_5px_rgba(34,211,238,0.3)] text-xs"
                     >
                         <Download size={14} /> K2
                     </button>
                     <button 
                        onClick={() => handleExportDailySchedule('K3')}
                        className="bg-cyan-400/10 border border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-black py-2 font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 shadow-[0_0_5px_rgba(34,211,238,0.3)] text-xs"
                     >
                         <Download size={14} /> K3
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
                    className="w-full bg-cyber-blue/10 border border-cyber-blue text-cyber-blue hover:bg-cyber-blue hover:text-black py-3 px-4 font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-neon-blue"
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
                     彙整全厂所有机台的异常申报记录，包含原因、责任单位及自动计算的影响天数。
                 </p>
                 <button 
                    onClick={handleExportAnomalies}
                    className="w-full bg-cyber-orange/10 border border-cyber-orange text-cyber-orange hover:bg-cyber-orange hover:text-black py-3 px-4 font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-neon-orange"
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
                    className="w-full bg-green-500/10 border border-green-500 text-green-400 hover:bg-green-500 hover:text-black py-3 px-4 font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-[0_0_10px_rgba(34,197,94,0.3)]"
                 >
                     <Download size={18} /> 导出 Excel
                 </button>
            </div>
        </div>
    </div>
  );
};
