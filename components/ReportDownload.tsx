
import React, { useState, useMemo, useRef } from 'react';
import { WorkOrder, MachineModel, MachineStatus, ProcessStep, AnomalyRecord } from '../types';
import { FileDown, Table, AlertTriangle, FileClock, Download, CalendarDays, Factory, X, Play, Image as ImageIcon, AlertOctagon, Info } from 'lucide-react';
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

  // 获取今日异常数据
  const todayAnomalies = useMemo(() => {
      if (!dailyScheduleWorkshop) return [];
      const today = new Date().toISOString().split('T')[0];
      return orders
          .filter(o => o.workshop?.startsWith(dailyScheduleWorkshop))
          .flatMap(o => (o.anomalies || []).map(a => ({ ...a, orderId: o.id })))
          .filter(a => a.startTime.startsWith(today) || !a.endTime); 
  }, [dailyScheduleWorkshop, orders]);

  // 获取生产进度数据
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
              const progress = Math.round((Object.values(o.stepStates || {}).filter((s: any) => s.status === 'COMPLETED' || s.status === 'SKIPPED').length / model.steps.length) * 100);
              const hasProgressToday = o.logs?.some(log => new Date(log.completedAt).toDateString() === todayStr);
              
              const moduleGroups: Record<string, ProcessStep[]> = {};
              model.steps.forEach(s => {
                  const mod = s.parallelModule || '通用';
                  if (!moduleGroups[mod]) moduleGroups[mod] = [];
                  moduleGroups[mod].push(s);
              });
              
              const activeModuleDetails: { moduleName: string; stepModule: string; stepName: string; status: string }[] = [];
              Object.entries(moduleGroups).forEach(([modName, steps]) => {
                  if (steps.every(s => o.stepStates?.[s.id]?.status === 'COMPLETED' || o.stepStates?.[s.id]?.status === 'SKIPPED')) return;
                  let targetStep = steps.find(s => o.stepStates?.[s.id]?.status === 'IN_PROGRESS');
                  let statusStr = '进行中';
                  if (!targetStep) {
                      const completed = steps.filter(s => o.stepStates?.[s.id]?.status === 'COMPLETED' || o.stepStates?.[s.id]?.status === 'SKIPPED');
                      targetStep = completed.length > 0 ? steps.find(s => !o.stepStates?.[s.id] || o.stepStates?.[s.id]?.status === 'PENDING') || steps[steps.length-1] : steps[0];
                      statusStr = '待开工';
                  }
                  activeModuleDetails.push({ 
                    moduleName: modName, 
                    stepModule: targetStep.module, 
                    stepName: targetStep.name, 
                    status: statusStr 
                  });
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
      const anomalyData = todayAnomalies.map(a => ({ "机台号": a.orderId, "工序名称": a.stepName, "原因描述": a.reason, "责任单位": a.department, "状态": a.endTime ? "已处理" : "处理中" }));
      const progressData = dailyScheduleData.map(o => ({ 
        "机台号": o.id, 
        "进度": `${o.progress}%`, 
        "偏差": o.variance, 
        "预计完工": formatDate(o.projectedDate.toISOString()), 
        "业务结关": formatDate(o.closingDate), 
        "详情": o.details.map(d => `[${d.moduleName}] ${d.stepModule}: ${d.stepName} (${d.status})`).join('; ') 
      }));

      const wb = XLSX.utils.book_new();
      if (anomalyData.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(anomalyData), "今日异常");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(progressData), "生产进度");
      XLSX.writeFile(wb, `${workshop}车间日报_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportImage = async () => {
    if (!modalContentRef.current) return;
    const canvas = await html2canvas(modalContentRef.current, { 
        backgroundColor: '#0f172a', 
        scale: 2,
        useCORS: true,
        logging: false
    });
    const link = document.createElement("a");
    link.download = `${dailyScheduleWorkshop}_日报_${new Date().toISOString().split('T')[0]}.jpg`;
    link.href = canvas.toDataURL("image/jpeg", 0.9);
    link.click();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 relative min-h-full">
        {dailyScheduleWorkshop && (
          <div className="absolute inset-0 z-[60] flex items-start justify-center p-4 bg-black/95 backdrop-blur-md overflow-y-auto pt-10">
              <div ref={modalContentRef} className="bg-cyber-card border border-cyber-blue shadow-neon-blue w-full max-w-6xl flex flex-col overflow-hidden mb-20">
                  <div className="p-5 border-b border-cyber-blue/30 flex justify-between items-center bg-cyber-bg/80 backdrop-blur-md">
                      <div className="flex items-center gap-4">
                           <Factory size={32} className="text-cyber-orange" />
                           <div>
                               <h2 className="text-2xl font-display font-bold text-white uppercase tracking-widest">{dailyScheduleWorkshop} 车间日排程动态</h2>
                               <p className="text-xs text-cyber-blue font-mono mt-0.5">{getHeaderDate()}</p>
                           </div>
                      </div>
                      <div className="flex gap-3 no-print">
                          <button onClick={handleExportImage} className="flex items-center gap-1.5 bg-indigo-500/20 border border-indigo-500/50 text-indigo-400 px-4 py-2 rounded text-xs font-bold hover:bg-indigo-500 hover:text-white transition-all"><ImageIcon size={14} /> 导出图片</button>
                          <button onClick={() => handleExportDailySchedule(dailyScheduleWorkshop)} className="flex items-center gap-1.5 bg-green-500/20 border border-green-500/50 text-green-400 px-4 py-2 rounded text-xs font-bold hover:bg-green-500 hover:text-white transition-all"><Download size={14} /> 导出 Excel</button>
                          <button onClick={() => setDailyScheduleWorkshop(null)} className="text-cyber-muted hover:text-white ml-2 transition-colors"><X size={28} /></button>
                      </div>
                  </div>

                  <div className="flex-1 p-8 space-y-10">
                       {/* 上模块：今日异常 */}
                       <section>
                           <div className="flex items-center justify-between mb-4 border-b border-cyber-orange/30 pb-2">
                               <div className="flex items-center gap-2 text-cyber-orange">
                                   <AlertOctagon size={20} />
                                   <h3 className="font-display font-bold text-base tracking-wider uppercase">今日异常回报 (TOP ISSUES)</h3>
                               </div>
                               <span className="text-[10px] text-cyber-muted font-mono uppercase tracking-widest">Real-time Anomaly Tracking</span>
                           </div>
                           {todayAnomalies.length === 0 ? (
                               <div className="py-8 text-center border border-dashed border-cyber-muted/20 text-cyber-muted text-sm font-mono italic bg-white/5">今日暂无显著异常回报，生产状况良好。</div>
                           ) : (
                               <div className="overflow-hidden border border-cyber-orange/20 rounded-sm">
                                   <table className="w-full text-left border-collapse">
                                       <thead>
                                           <tr className="text-[11px] text-cyber-orange font-mono bg-cyber-orange/10 uppercase tracking-wider">
                                               <th className="p-3 border-r border-cyber-orange/10 w-32">机台号</th>
                                               <th className="p-3 border-r border-cyber-orange/10 w-48">工序名称</th>
                                               <th className="p-3 border-r border-cyber-orange/10">异常原因描述</th>
                                               <th className="p-3 w-28 text-center">责任单位</th>
                                           </tr>
                                       </thead>
                                       <tbody className="text-xs font-mono">
                                           {todayAnomalies.map(a => (
                                               <tr key={a.id} className="text-white border-t border-cyber-orange/10 hover:bg-cyber-orange/5 transition-colors">
                                                   <td className="p-3 border-r border-cyber-orange/10 font-bold text-cyber-orange">{a.orderId}</td>
                                                   <td className="p-3 border-r border-cyber-orange/10 text-cyan-200">{a.stepName}</td>
                                                   <td className="p-3 border-r border-cyber-orange/10 leading-relaxed">{a.reason}</td>
                                                   <td className="p-3 text-center"><span className="inline-block px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded text-[10px]">{a.department}</span></td>
                                               </tr>
                                           ))}
                                       </tbody>
                                   </table>
                               </div>
                           )}
                       </section>

                       {/* 下模块：生产进度 */}
                       <section>
                           <div className="flex items-center justify-between mb-4 border-b border-cyber-blue/30 pb-2">
                               <div className="flex items-center gap-2 text-cyber-blue">
                                   <Table size={20} />
                                   <h3 className="font-display font-bold text-base tracking-wider uppercase">生产进度动态 (PRODUCTION PROGRESS)</h3>
                               </div>
                               <span className="text-[10px] text-cyber-muted font-mono uppercase tracking-widest">Active Line Efficiency Monitoring</span>
                           </div>
                           <div className="overflow-hidden border border-cyber-blue/20 rounded-sm">
                               <table className="w-full text-left border-collapse table-fixed">
                                   <thead className="text-[11px] text-cyber-blue font-mono bg-cyber-blue/10 uppercase tracking-wider">
                                       <tr>
                                           <th className="p-3 border-r border-cyber-blue/10 w-32">机台号</th>
                                           <th className="p-3 border-r border-cyber-blue/10 w-16 text-center">进度</th>
                                           <th className="p-3 border-r border-cyber-blue/10 w-16 text-center">偏差</th>
                                           <th className="p-3 border-r border-cyber-blue/10 w-20 text-center">日产状态</th>
                                           <th className="p-3 border-r border-cyber-blue/10 w-28 text-center">预计完工</th>
                                           <th className="p-3 border-r border-cyber-blue/10 w-28 text-center text-cyber-orange">业务结关</th>
                                           <th className="p-3">进行中工序详情 (MODULE DETAILS)</th>
                                       </tr>
                                   </thead>
                                   <tbody className="text-xs font-mono">
                                       {dailyScheduleData.map(o => (
                                           <tr key={o.id} className="text-white border-t border-cyber-blue/10 hover:bg-cyber-blue/5 transition-colors">
                                               <td className="p-3 border-r border-cyber-blue/10 font-bold text-white bg-cyber-blue/5">{o.id}</td>
                                               <td className="p-3 border-r border-cyber-blue/10 text-center text-cyber-blue font-bold">{o.progress}%</td>
                                               <td className={`p-3 border-r border-cyber-blue/10 text-center font-bold ${o.variance > 0 ? 'text-cyber-orange' : 'text-green-400'}`}>{o.variance > 0 ? `+${o.variance}` : o.variance}</td>
                                               <td className="p-3 border-r border-cyber-blue/10 text-center">
                                                   <span className={`px-2 py-0.5 rounded-[2px] text-[10px] font-bold border ${o.dailyStatus === 'GREEN' ? 'border-green-500/40 text-green-400 bg-green-500/10' : 'border-cyber-orange/40 text-cyber-orange bg-cyber-orange/10'}`}>{o.dailyStatus === 'GREEN' ? '正常' : '滞后'}</span>
                                               </td>
                                               <td className="p-3 border-r border-cyber-blue/10 text-center text-cyber-blue/80 font-bold">{new Date(o.projectedDate).toLocaleDateString()}</td>
                                               <td className="p-3 border-r border-cyber-blue/10 text-center text-cyber-orange font-bold">{o.closingDate ? new Date(o.closingDate).toLocaleDateString() : '-'}</td>
                                               <td className="p-3 align-top">
                                                   <div className="flex flex-col gap-1.5 py-0.5">
                                                       {o.details.map((d: any, i: any) => (
                                                           <div key={i} className="flex items-start gap-1.5 leading-[1.3] text-cyber-text/90">
                                                               <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1 ${d.status === '进行中' ? 'bg-cyber-blue animate-pulse' : 'bg-cyber-muted opacity-50'}`}></span>
                                                               <div className="break-words">
                                                                   <span className="text-cyber-blue font-bold opacity-80 mr-1">[{d.moduleName}]</span>
                                                                   <span className="text-cyan-100/90 font-medium">{d.stepModule}:</span>
                                                                   <span className="ml-1 text-white underline decoration-cyber-blue/20 underline-offset-2">{d.stepName}</span>
                                                                   <span className={`ml-1.5 text-[10px] italic px-1 rounded border ${d.status === '进行中' ? 'border-cyber-blue/30 text-cyber-blue/80' : 'border-cyber-muted/30 text-cyber-muted/80'}`}>{d.status}</span>
                                                               </div>
                                                           </div>
                                                       ))}
                                                   </div>
                                               </td>
                                           </tr>
                                       ))}
                                   </tbody>
                               </table>
                           </div>
                       </section>
                  </div>
                  
                  {/* 页脚签章区 */}
                  <div className="p-8 border-t border-cyber-muted/10 bg-cyber-bg/40 flex justify-between items-end">
                      <div className="space-y-4">
                           <div className="flex gap-16 text-cyber-muted text-[10px] font-mono uppercase tracking-[0.2em]">
                               <div className="border-b border-cyber-muted/30 pb-1 w-32">PREPARED BY</div>
                               <div className="border-b border-cyber-muted/30 pb-1 w-32">REVIEWED BY</div>
                               <div className="border-b border-cyber-muted/30 pb-1 w-32">APPROVED BY</div>
                           </div>
                           <p className="text-[10px] text-cyber-muted font-mono italic">AUTOMATED REPORT GENERATED BY KEN MES CLOUD SERVICE. DATA SYNC AT {new Date().toLocaleTimeString()}</p>
                      </div>
                      <div className="text-right">
                          <h4 className="text-xl font-display font-black tracking-widest text-white/20 uppercase">KEN MES <span className="text-cyber-blue/20">INDUSTRY 4.0</span></h4>
                      </div>
                  </div>
              </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
             <div className="bg-cyber-card border border-cyber-muted/20 p-6 group hover:border-cyan-400/50 transition-all shadow-lg relative overflow-hidden">
                 <div className="absolute -right-4 -bottom-4 opacity-5 transform group-hover:scale-110 transition-transform">
                     <Factory size={120} />
                 </div>
                 <div className="flex items-center gap-3 mb-4">
                     <Factory size={24} className="text-cyan-400" />
                     <h3 className="text-lg font-bold text-white">生产车间动态</h3>
                 </div>
                 <p className="text-xs text-cyber-muted mb-6 h-12 leading-relaxed">各车间实时动态日报，包含今日异常清单与生产进度追踪，支持导出高画质看板图片。</p>
                 <div className="grid grid-cols-3 gap-2 relative z-10">
                     {['K1', 'K2', 'K3'].map(ws => <button key={ws} onClick={() => setDailyScheduleWorkshop(ws)} className="bg-cyan-400/10 border border-cyan-400/50 text-cyan-400 hover:bg-cyan-400 hover:text-black py-2 font-bold rounded text-xs transition-all uppercase shadow-sm hover:shadow-cyan-400/20">{ws}</button>)}
                 </div>
            </div>

            <div className="bg-cyber-card border border-cyber-muted/20 p-6 group hover:border-cyber-blue/50 transition-all shadow-lg relative overflow-hidden">
                 <div className="absolute -right-4 -bottom-4 opacity-5 transform group-hover:scale-110 transition-transform">
                     <Table size={120} />
                 </div>
                 <div className="flex items-center gap-3 mb-4"><Table size={24} className="text-cyber-blue" /><h3 className="text-lg font-bold text-white">生产工单总表</h3></div>
                 <p className="text-xs text-cyber-muted mb-6 h-12 leading-relaxed">导出当前所有在产机台的详细数据、客户信息及关键节点日期，支持标准 Excel 格式。</p>
                 <button onClick={handleExportOrders} className="w-full bg-cyber-blue/10 border border-cyber-blue/50 text-cyber-blue hover:bg-cyber-blue hover:text-black py-2.5 font-bold uppercase transition-all flex items-center justify-center gap-2 rounded text-xs shadow-sm hover:shadow-neon-blue"><Download size={16} /> 导出 Excel</button>
            </div>

            <div className="bg-cyber-card border border-cyber-muted/20 p-6 group hover:border-cyber-orange/50 transition-all shadow-lg relative overflow-hidden">
                 <div className="absolute -right-4 -bottom-4 opacity-5 transform group-hover:scale-110 transition-transform">
                     <AlertOctagon size={120} />
                 </div>
                 <div className="flex items-center gap-3 mb-4"><AlertTriangle size={24} className="text-cyber-orange" /><h3 className="text-lg font-bold text-white">异常纪录清单</h3></div>
                 <p className="text-xs text-cyber-muted mb-6 h-12 leading-relaxed">历史异常数据追踪，用于分析瓶颈工序与责任单位分布，帮助提升工厂生产效率。</p>
                 <button onClick={() => {}} className="w-full bg-cyber-orange/10 border border-cyber-orange/50 text-cyber-orange hover:bg-cyber-orange hover:text-black py-2.5 font-bold uppercase transition-all flex items-center justify-center gap-2 rounded text-xs shadow-sm hover:shadow-neon-orange"><Download size={16} /> 导出 Excel</button>
            </div>

            <div className="bg-cyber-card border border-cyber-muted/20 p-6 group hover:border-green-500/50 transition-all shadow-lg relative overflow-hidden">
                 <div className="absolute -right-4 -bottom-4 opacity-5 transform group-hover:scale-110 transition-transform">
                     <FileClock size={120} />
                 </div>
                 <div className="flex items-center gap-3 mb-4"><FileClock size={24} className="text-green-400" /><h3 className="text-lg font-bold text-white">生产日志流水</h3></div>
                 <p className="text-xs text-cyber-muted mb-6 h-12 leading-relaxed">各工序实际完工记录，包含操作人员与具体时间点，用于工时稽核与生产溯源。</p>
                 <button onClick={() => {}} className="w-full bg-green-500/10 border border-green-500/50 text-green-400 hover:bg-green-500 hover:text-white py-2.5 font-bold uppercase transition-all flex items-center justify-center gap-2 rounded text-xs shadow-sm hover:shadow-green-500/20"><Download size={16} /> 导出 Excel</button>
            </div>
        </div>
    </div>
  );
};
