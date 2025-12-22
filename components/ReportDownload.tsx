
import React, { useState, useMemo, useRef } from 'react';
import { WorkOrder, MachineModel, MachineStatus, ProcessStep, AnomalyRecord } from '../types';
import { FileDown, Table, AlertTriangle, FileClock, Download, CalendarDays, Factory, X, Play, Image as ImageIcon, AlertOctagon } from 'lucide-react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { calculateProjectedDate } from '../services/holidayService';

interface ReportDownloadProps {
  orders: WorkOrder[];
  models: MachineModel[];
}

export const ReportDownload: React.FC<ReportDownloadProps> = ({ orders, models }) => {
  const [dailyScheduleWorkshop, setDailyScheduleWorkshop] = useState<string | null>(null);
  const modalContentRef = useRef<HTMLDivElement>(null);

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return dateString.split('T')[0];
  };

  const getHeaderDate = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const weekMap = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const w = weekMap[now.getDay()];
    const hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${d} (${w}) ${hours}:${minutes}`;
  };

  const calculateVariance = (order: WorkOrder, model: MachineModel) => {
      let remainingHours = 0;
      const getRemainingHoursForStep = (s: ProcessStep) => {
          const status = order.stepStates?.[s.id]?.status;
          return (status === 'COMPLETED' || status === 'SKIPPED') ? 0 : s.estimatedHours;
      };
      if (model.scheduleCalculationModule) {
          remainingHours = model.steps.filter(s => s.parallelModule === model.scheduleCalculationModule).reduce((acc, s) => acc + getRemainingHoursForStep(s), 0);
      } else {
          const moduleRemaining: Record<string, number> = {};
          model.steps.forEach(s => {
              const key = s.parallelModule || '通用';
              moduleRemaining[key] = (moduleRemaining[key] || 0) + getRemainingHoursForStep(s);
          });
          remainingHours = Math.max(0, ...Object.values(moduleRemaining));
      }
      const now = new Date();
      const projected = calculateProjectedDate(now, remainingHours, order.holidayType || 'DOUBLE');
      let variance = 0;
      if (order.businessClosingDate) {
          const p = new Date(projected); p.setHours(0,0,0,0);
          const closing = new Date(order.businessClosingDate); closing.setHours(0,0,0,0);
          variance = Math.ceil((p.getTime() - closing.getTime()) / (1000 * 60 * 60 * 24));
      }
      return { variance, projectedDate: projected };
  };

  // 獲取今日異常數據
  const todayAnomalies = useMemo(() => {
      if (!dailyScheduleWorkshop) return [];
      const today = new Date().toISOString().split('T')[0];
      return orders
          .filter(o => o.workshop?.startsWith(dailyScheduleWorkshop))
          .flatMap(o => (o.anomalies || []).map(a => ({ ...a, orderId: o.id })))
          .filter(a => a.startTime.startsWith(today) || !a.endTime); // 今天開始或尚未結束
  }, [dailyScheduleWorkshop, orders]);

  // 獲取生產進度數據
  const dailyScheduleData = useMemo(() => {
      if (!dailyScheduleWorkshop) return [];
      const todayStr = new Date().toDateString();
      return orders
          .filter(o => o.status === MachineStatus.IN_PROGRESS && o.workshop?.startsWith(dailyScheduleWorkshop))
          .sort((a, b) => {
              const dateA = a.businessClosingDate ? new Date(a.businessClosingDate).getTime() : Number.MAX_SAFE_INTEGER;
              const dateB = b.businessClosingDate ? new Date(b.businessClosingDate).getTime() : Number.MAX_SAFE_INTEGER;
              return dateA - dateB;
          })
          .map(o => {
              const model = models.find(m => m.id === o.modelId);
              if (!model) return null;
              const { variance, projectedDate } = calculateVariance(o, model);
              const progress = Math.round((o.currentStepIndex / model.steps.length) * 100);
              const hasProgressToday = o.logs?.some(log => new Date(log.completedAt).toDateString() === todayStr);
              
              const moduleGroups: Record<string, ProcessStep[]> = {};
              model.steps.forEach(s => {
                  const mod = s.parallelModule || '通用';
                  if (!moduleGroups[mod]) moduleGroups[mod] = [];
                  moduleGroups[mod].push(s);
              });
              const activeModuleDetails: string[] = [];
              Object.entries(moduleGroups).forEach(([modName, steps]) => {
                  if (steps.every(s => o.stepStates?.[s.id]?.status === 'COMPLETED' || o.stepStates?.[s.id]?.status === 'SKIPPED')) return;
                  let targetStep = steps.find(s => o.stepStates?.[s.id]?.status === 'IN_PROGRESS');
                  let suffix = '(进行中)';
                  if (!targetStep) {
                      const completed = steps.filter(s => o.stepStates?.[s.id]?.status === 'COMPLETED' || o.stepStates?.[s.id]?.status === 'SKIPPED');
                      targetStep = completed.length > 0 ? completed[completed.length - 1] : steps[0];
                      suffix = completed.length > 0 ? '(近期完工)' : '(待开工)';
                  }
                  activeModuleDetails.push(`【${modName}】${targetStep.module}: ${targetStep.name} ${suffix}`);
              });

              return { id: o.id, clientName: o.clientName, progress, variance, startDate: o.startDate, projectedDate, closingDate: o.businessClosingDate, dailyStatus: hasProgressToday ? 'GREEN' : 'YELLOW', details: activeModuleDetails };
          }).filter(Boolean);
  }, [dailyScheduleWorkshop, orders, models]);

  const handleExportOrders = () => {
    const data = orders.map(o => {
      const model = models.find(m => m.id === o.modelId);
      return { "机台号": o.id, "机型": model?.name || o.modelId, "客户": o.clientName || '', "状态": o.status, "车间": o.workshop, "进度": `${model ? Math.round((o.currentStepIndex / model.steps.length) * 100) : 0}%`, "计划上线": formatDate(o.startDate), "预计完工": formatDate(o.estimatedCompletionDate), "业务结关": formatDate(o.businessClosingDate) };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "生产工单");
    XLSX.writeFile(wb, `生产工单_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportDailySchedule = (workshop: string) => {
      // 異常表數據
      const anomalyData = todayAnomalies.map(a => ({ "机台号": a.orderId, "工序名称": a.stepName, "原因描述": a.reason, "责任单位": a.department, "状态": a.endTime ? "已处理" : "处理中" }));
      // 進度表數據
      const progressData = dailyScheduleData.map(o => ({ "机台号": o.id, "进度": `${o.progress}%`, "偏差": o.variance, "预计完工": formatDate(o.projectedDate.toISOString()), "业务结关": formatDate(o.closingDate), "详情": o.details.join('; ') }));

      const wb = XLSX.utils.book_new();
      if (anomalyData.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(anomalyData), "今日异常");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(progressData), "生产进度");
      XLSX.writeFile(wb, `${workshop}车间日报_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportImage = async () => {
    if (!modalContentRef.current) return;
    const canvas = await html2canvas(modalContentRef.current, { backgroundColor: '#0f172a', scale: 2 });
    const link = document.createElement("a");
    link.download = `${dailyScheduleWorkshop}_日报_${new Date().toISOString().split('T')[0]}.jpg`;
    link.href = canvas.toDataURL("image/jpeg", 0.9);
    link.click();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
        {dailyScheduleWorkshop && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
              <div ref={modalContentRef} className="bg-cyber-card border border-cyber-blue shadow-neon-blue w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-cyber-blue/30 flex justify-between items-center bg-cyber-bg/50">
                      <div className="flex items-center gap-4">
                           <Factory size={28} className="text-cyber-orange" />
                           <div>
                               <h2 className="text-xl font-display font-bold text-white uppercase tracking-widest">{dailyScheduleWorkshop} 車間日排程動態</h2>
                               <p className="text-[10px] text-cyber-blue font-mono">{getHeaderDate()}</p>
                           </div>
                      </div>
                      <div className="flex gap-3 no-print">
                          <button onClick={handleExportImage} className="flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/50 text-indigo-400 px-3 py-1.5 rounded text-xs font-bold hover:bg-indigo-500 hover:text-white transition-all"><ImageIcon size={14} /> 導出圖片</button>
                          <button onClick={() => handleExportDailySchedule(dailyScheduleWorkshop)} className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/50 text-green-400 px-3 py-1.5 rounded text-xs font-bold hover:bg-green-500 hover:text-white transition-all"><Download size={14} /> 導出 Excel</button>
                          <button onClick={() => setDailyScheduleWorkshop(null)} className="text-cyber-muted hover:text-white"><X size={24} /></button>
                      </div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                       {/* 上模組：今日異常 */}
                       <section>
                           <div className="flex items-center gap-2 mb-3 text-cyber-orange border-b border-cyber-orange/30 pb-1">
                               <AlertOctagon size={18} />
                               <h3 className="font-display font-bold text-sm tracking-wider uppercase">今日異常回報 (TOP ISSUES)</h3>
                           </div>
                           {todayAnomalies.length === 0 ? (
                               <div className="py-4 text-center border border-dashed border-cyber-muted/20 text-cyber-muted text-xs font-mono italic">今日暫無異常回報</div>
                           ) : (
                               <table className="w-full text-left border-collapse">
                                   <thead>
                                       <tr className="text-[10px] text-cyber-orange font-mono bg-cyber-orange/5">
                                           <th className="p-2 border border-cyber-orange/20">機台號</th>
                                           <th className="p-2 border border-cyber-orange/20">工序名稱</th>
                                           <th className="p-2 border border-cyber-orange/20">異常原因描述</th>
                                           <th className="p-2 border border-cyber-orange/20 w-24">責任單位</th>
                                       </tr>
                                   </thead>
                                   <tbody className="text-xs font-mono">
                                       {todayAnomalies.map(a => (
                                           <tr key={a.id} className="text-white border-b border-cyber-orange/10 hover:bg-cyber-orange/5">
                                               <td className="p-2 border border-cyber-orange/10 font-bold">{a.orderId}</td>
                                               <td className="p-2 border border-cyber-orange/10 text-cyan-200">{a.stepName}</td>
                                               <td className="p-2 border border-cyber-orange/10">{a.reason}</td>
                                               <td className="p-2 border border-cyber-orange/10 text-center"><span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded">{a.department}</span></td>
                                           </tr>
                                       ))}
                                   </tbody>
                               </table>
                           )}
                       </section>

                       {/* 下模組：生產進度 */}
                       <section>
                           <div className="flex items-center gap-2 mb-3 text-cyber-blue border-b border-cyber-blue/30 pb-1">
                               <Table size={18} />
                               <h3 className="font-display font-bold text-sm tracking-wider uppercase">生產進度動態 (PRODUCTION PROGRESS)</h3>
                           </div>
                           <table className="w-full text-left border-collapse">
                               <thead className="text-[10px] text-cyber-blue font-mono bg-cyber-blue/5">
                                   <tr>
                                       <th className="p-2 border border-cyber-blue/20">機台號</th>
                                       <th className="p-2 border border-cyber-blue/20 w-12 text-center">進度</th>
                                       <th className="p-2 border border-cyber-blue/20 w-12 text-center">差異</th>
                                       <th className="p-2 border border-cyber-blue/20 w-20 text-center">狀態</th>
                                       <th className="p-2 border border-cyber-blue/20 w-20">預計完工</th>
                                       <th className="p-2 border border-cyber-blue/20 w-20 text-cyber-orange">結關日</th>
                                       <th className="p-2 border border-cyber-blue/20">進行中模組詳情</th>
                                   </tr>
                               </thead>
                               <tbody className="text-xs font-mono">
                                   {dailyScheduleData.map(o => (
                                       <tr key={o.id} className="text-white border-b border-cyber-blue/10 hover:bg-cyber-blue/5">
                                           <td className="p-2 border border-cyber-blue/10 font-bold">{o.id}</td>
                                           <td className="p-2 border border-cyber-blue/10 text-center text-cyber-blue">{o.progress}%</td>
                                           <td className={`p-2 border border-cyber-blue/10 text-center font-bold ${o.variance > 0 ? 'text-cyber-orange' : 'text-green-400'}`}>{o.variance > 0 ? `+${o.variance}` : o.variance}</td>
                                           <td className="p-2 border border-cyber-blue/10 text-center">
                                               <span className={`px-1 py-0.5 rounded text-[9px] border ${o.dailyStatus === 'GREEN' ? 'border-green-500/30 text-green-400 bg-green-500/5' : 'border-cyber-orange/30 text-cyber-orange bg-cyber-orange/5'}`}>{o.dailyStatus === 'GREEN' ? '正常' : '滯後'}</span>
                                           </td>
                                           <td className="p-2 border border-cyber-blue/10">{new Date(o.projectedDate).toLocaleDateString()}</td>
                                           <td className="p-2 border border-cyber-blue/10 text-cyber-orange">{o.closingDate ? new Date(o.closingDate).toLocaleDateString() : '-'}</td>
                                           <td className="p-2 border border-cyber-blue/10">
                                               <div className="flex flex-col gap-1">
                                                   {o.details.map((d: any, i: any) => <div key={i} className="text-[10px] text-cyber-muted leading-tight truncate max-w-[300px]" title={d}>{d}</div>)}
                                               </div>
                                           </td>
                                       </tr>
                                   ))}
                               </tbody>
                           </table>
                       </section>
                  </div>
              </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
             <div className="bg-cyber-card border border-cyber-muted/20 p-6 group hover:border-cyan-400/50 transition-all shadow-lg">
                 <div className="flex items-center gap-3 mb-4">
                     <Factory size={24} className="text-cyan-400" />
                     <h3 className="text-lg font-bold text-white">生產車間動態</h3>
                 </div>
                 <p className="text-xs text-cyber-muted mb-6 h-12">各車間實時動態日報，包含今日異常清單與生產進度追蹤。</p>
                 <div className="grid grid-cols-3 gap-2">
                     {['K1', 'K2', 'K3'].map(ws => <button key={ws} onClick={() => setDailyScheduleWorkshop(ws)} className="bg-cyan-400/10 border border-cyan-400/50 text-cyan-400 hover:bg-cyan-400 hover:text-black py-2 font-bold rounded text-xs transition-all uppercase">{ws}</button>)}
                 </div>
            </div>

            <div className="bg-cyber-card border border-cyber-muted/20 p-6 group hover:border-cyber-blue/50 transition-all shadow-lg">
                 <div className="flex items-center gap-3 mb-4"><Table size={24} className="text-cyber-blue" /><h3 className="text-lg font-bold text-white">生產工單總表</h3></div>
                 <p className="text-xs text-cyber-muted mb-6 h-12">匯出當前所有在產機台的詳細數據、客戶信息及關鍵節點日期。</p>
                 <button onClick={handleExportOrders} className="w-full bg-cyber-blue/10 border border-cyber-blue/50 text-cyber-blue hover:bg-cyber-blue hover:text-black py-2.5 font-bold uppercase transition-all flex items-center justify-center gap-2 rounded text-xs"><Download size={16} /> 導出 Excel</button>
            </div>

            <div className="bg-cyber-card border border-cyber-muted/20 p-6 group hover:border-cyber-orange/50 transition-all shadow-lg">
                 <div className="flex items-center gap-3 mb-4"><AlertTriangle size={24} className="text-cyber-orange" /><h3 className="text-lg font-bold text-white">異常紀錄清單</h3></div>
                 <p className="text-xs text-cyber-muted mb-6 h-12">歷史異常數據追蹤，用於分析瓶頸工序與責任單位分佈。</p>
                 <button onClick={() => {}} className="w-full bg-cyber-orange/10 border border-cyber-orange/50 text-cyber-orange hover:bg-cyber-orange hover:text-black py-2.5 font-bold uppercase transition-all flex items-center justify-center gap-2 rounded text-xs"><Download size={16} /> 導出 Excel</button>
            </div>

            <div className="bg-cyber-card border border-cyber-muted/20 p-6 group hover:border-green-500/50 transition-all shadow-lg">
                 <div className="flex items-center gap-3 mb-4"><FileClock size={24} className="text-green-400" /><h3 className="text-lg font-bold text-white">生產日誌流水</h3></div>
                 <p className="text-xs text-cyber-muted mb-6 h-12">各工序實際完工記錄，包含操作人員與具體時間點。</p>
                 <button onClick={() => {}} className="w-full bg-green-500/10 border border-green-500/50 text-green-400 hover:bg-green-500 hover:text-white py-2.5 font-bold uppercase transition-all flex items-center justify-center gap-2 rounded text-xs"><Download size={16} /> 導出 Excel</button>
            </div>
        </div>
    </div>
  );
};
