
import React, { useState, useMemo, useRef } from 'react';
import { WorkOrder, MachineModel, MachineStatus, ProcessStep } from '../types';
import { Table, Download, Factory, X, Image as ImageIcon, AlertOctagon, PauseCircle } from 'lucide-react';
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
      remainingHours = model.steps
        .filter(s => s.parallelModule === model.scheduleCalculationModule)
        .reduce((acc, s) => acc + getRemainingHoursForStep(s), 0);
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
      const p = new Date(projected); p.setHours(0, 0, 0, 0);
      const closing = new Date(order.businessClosingDate); closing.setHours(0, 0, 0, 0);
      variance = Math.ceil((p.getTime() - closing.getTime()) / (1000 * 60 * 60 * 24));
    }
    return { variance, projectedDate: projected };
  };

  // 獲取涵蓋今日日期的所有異常數據
  const todayAnomalies = useMemo(() => {
    if (!dailyScheduleWorkshop) return [];
    
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

    return orders
      .filter(o => o.workshop === dailyScheduleWorkshop)
      .flatMap(o => (o.anomalies || []).map(a => ({ ...a, orderId: o.id })))
      .filter(a => {
        const aStart = new Date(a.startTime).getTime();
        // 如果沒有 endTime，視為持續中 (Infinity)
        const aEnd = (a.endTime && a.endTime.trim() !== '') ? new Date(a.endTime).getTime() : Infinity;
        
        // 區間重疊判定邏輯：異常開始 <= 今日結束 且 異常結束 >= 今日開始
        return aStart <= endOfToday && aEnd >= startOfToday;
      });
  }, [dailyScheduleWorkshop, orders]);

  // 獲取生產進度數據
  const dailyScheduleData = useMemo(() => {
    if (!dailyScheduleWorkshop) return [];
    const todayStr = new Date().toISOString().split('T')[0];

    return orders
      .filter(o => 
        (o.status === MachineStatus.IN_PROGRESS || o.status === MachineStatus.HALTED) && 
        o.workshop === dailyScheduleWorkshop
      )
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
        
        // 判定今日是否有進度 (報工日誌或工序狀態結束時間)
        const hasLogToday = o.logs?.some(log => log.completedAt && log.completedAt.startsWith(todayStr));
        const hasStateToday = Object.values(o.stepStates || {}).some((s: any) => s.status === 'COMPLETED' && s.endTime && s.endTime.startsWith(todayStr));
        const hasProgressToday = hasLogToday || hasStateToday;

        const moduleGroups: Record<string, ProcessStep[]> = {};
        model.steps.forEach(s => {
          const mod = s.parallelModule || '通用';
          if (!moduleGroups[mod]) moduleGroups[mod] = [];
          moduleGroups[mod].push(s);
        });
        
        const activeModuleDetails: any[] = [];
        Object.entries(moduleGroups).forEach(([modName, steps]) => {
          if (steps.every(s => o.stepStates?.[s.id]?.status === 'COMPLETED' || o.stepStates?.[s.id]?.status === 'SKIPPED')) return;
          let targetStep = steps.find(s => o.stepStates?.[s.id]?.status === 'IN_PROGRESS');
          let statusStr = '進行中';
          if (!targetStep) {
            const completed = steps.filter(s => o.stepStates?.[s.id]?.status === 'COMPLETED' || o.stepStates?.[s.id]?.status === 'SKIPPED');
            targetStep = completed.length > 0 ? steps.find(s => !o.stepStates?.[s.id] || o.stepStates?.[s.id]?.status === 'PENDING') || steps[steps.length-1] : steps[0];
            statusStr = '待開工';
          }
          activeModuleDetails.push({ moduleName: modName, stepModule: targetStep.module, stepName: targetStep.name, status: statusStr });
        });

        return { 
          id: o.id, 
          progress, 
          variance, 
          projectedDate, 
          closingDate: o.businessClosingDate, 
          machineStatus: o.status,
          dailyStatus: hasProgressToday ? 'NORMAL' : 'DELAYED', 
          details: activeModuleDetails 
        };
      }).filter(Boolean);
  }, [dailyScheduleWorkshop, orders, models]);

  const handleExportDailySchedule = (workshop: string) => {
    const anomalyData = todayAnomalies.map(a => ({ "機台號": a.orderId, "工序名稱": a.stepName, "原因描述": a.reason, "責任單位": a.department, "狀態": a.endTime ? "已處理" : "處理中" }));
    const progressData = dailyScheduleData.map(o => ({
      "機台號": o.id,
      "進度": `${o.progress}%`,
      "偏差": o.variance,
      "當日生產": o.machineStatus === MachineStatus.HALTED ? '已暫停' : (o.dailyStatus === 'NORMAL' ? '正常' : '滯後'),
      "預計完工": formatDate(o.projectedDate.toISOString()),
      "業務結關": formatDate(o.closingDate),
      "詳情": o.details.map((d: any) => `[${d.moduleName}] ${d.stepModule}: ${d.stepName} (${d.status})`).join('; ')
    }));

    const wb = XLSX.utils.book_new();
    if (anomalyData.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(anomalyData), "今日異常");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(progressData), "生產進度");
    XLSX.writeFile(wb, `${workshop}日報_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportImage = async () => {
    if (!modalContentRef.current) return;
    const canvas = await html2canvas(modalContentRef.current, { backgroundColor: '#0f172a', scale: 2, useCORS: true });
    const link = document.createElement("a");
    link.download = `${dailyScheduleWorkshop}_日報_${new Date().toISOString().split('T')[0]}.jpg`;
    link.href = canvas.toDataURL("image/jpeg", 0.9);
    link.click();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 relative min-h-full font-sans">
      {dailyScheduleWorkshop && (
        <div className="absolute inset-0 z-[60] flex items-start justify-center p-4 bg-black/95 backdrop-blur-md overflow-y-auto pt-10">
          <div ref={modalContentRef} className="bg-cyber-card border border-cyber-blue shadow-neon-blue w-full max-w-6xl flex flex-col overflow-hidden mb-20">
            <div className="p-5 border-b border-cyber-blue/30 flex justify-between items-center bg-cyber-bg/80 backdrop-blur-md">
              <div className="flex items-center gap-4">
                <Factory size={32} className="text-cyber-orange" />
                <div>
                  <h2 className="text-2xl font-display font-bold text-white uppercase tracking-widest">{dailyScheduleWorkshop} 廠區生產動態</h2>
                  <p className="text-xs text-cyber-blue font-mono mt-0.5">{getHeaderDate()}</p>
                </div>
              </div>
              <div className="flex gap-3 no-print">
                <button onClick={handleExportImage} className="flex items-center gap-1.5 bg-indigo-500/20 border border-indigo-500/50 text-indigo-400 px-4 py-2 rounded text-xs font-bold hover:bg-indigo-500 hover:text-white transition-all"><ImageIcon size={14} /> 導出圖片</button>
                <button onClick={() => handleExportDailySchedule(dailyScheduleWorkshop)} className="flex items-center gap-1.5 bg-green-500/20 border border-green-500/50 text-green-400 px-4 py-2 rounded text-xs font-bold hover:bg-green-500 hover:text-white transition-all"><Download size={14} /> 導出 Excel</button>
                <button onClick={() => setDailyScheduleWorkshop(null)} className="text-cyber-muted hover:text-white ml-2 transition-colors"><X size={28} /></button>
              </div>
            </div>

            <div className="flex-1 p-8 space-y-10">
              {/* 今日異常動態 */}
              <section>
                <div className="flex items-center justify-between mb-4 border-b border-cyber-orange/30 pb-2">
                  <div className="flex items-center gap-2 text-cyber-orange font-bold">
                    <AlertOctagon size={20} />
                    <h3 className="font-display font-bold text-base tracking-wider uppercase">今日異常動態 (TOP ISSUES)</h3>
                  </div>
                </div>
                {todayAnomalies.length === 0 ? (
                  <div className="py-8 text-center border border-dashed border-cyber-muted/20 text-cyber-muted text-sm italic bg-white/5">今日暫無符合條件的異常紀錄。</div>
                ) : (
                  <div className="overflow-hidden border border-cyber-orange/20 rounded-sm">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[11px] text-cyber-orange font-mono bg-cyber-orange/10 uppercase tracking-wider font-bold">
                          <th className="p-3 border-r border-cyber-orange/10 w-32">機台號</th>
                          <th className="p-3 border-r border-cyber-orange/10 w-48">工序名稱</th>
                          <th className="p-3 border-r border-cyber-orange/10">異常原因描述</th>
                          <th className="p-3 w-28 text-center">責任單位</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs font-mono font-bold">
                        {todayAnomalies.map((a, idx) => (
                          <tr key={`${a.id}-${idx}`} className="text-white border-t border-cyber-orange/10 hover:bg-cyber-orange/5 transition-colors">
                            <td className="p-3 border-r border-cyber-orange/10 font-bold text-cyber-orange">{a.orderId}</td>
                            <td className="p-3 border-r border-cyber-orange/10 text-cyan-200">{a.stepName}</td>
                            <td className="p-3 border-r border-cyber-orange/10 leading-relaxed font-normal">{a.reason}</td>
                            <td className="p-3 text-center"><span className="inline-block px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded text-[10px]">{a.department}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* 生產進度動態 */}
              <section>
                <div className="flex items-center justify-between mb-4 border-b border-cyber-blue/30 pb-2">
                  <div className="flex items-center gap-2 text-cyber-blue font-bold">
                    <Table size={20} />
                    <h3 className="font-display font-bold text-base tracking-wider uppercase">生產進度動態 (PRODUCTION PROGRESS)</h3>
                  </div>
                </div>
                <div className="overflow-hidden border border-cyber-blue/20 rounded-sm">
                  <table className="w-full text-left border-collapse table-fixed">
                    <thead className="text-[11px] text-cyber-blue font-mono bg-cyber-blue/10 uppercase tracking-wider font-bold">
                      <tr>
                        <th className="p-3 border-r border-cyber-blue/10 w-32">機台號</th>
                        <th className="p-3 border-r border-cyber-blue/10 w-16 text-center">進度</th>
                        <th className="p-3 border-r border-cyber-blue/10 w-16 text-center">偏差</th>
                        <th className="p-3 border-r border-cyber-blue/10 w-32 text-center">當日生產</th>
                        <th className="p-3 border-r border-cyber-blue/10 w-28 text-center">預計完工</th>
                        <th className="p-3 border-r border-cyber-blue/10 w-28 text-center text-cyber-orange">業務結關</th>
                        <th className="p-3">進度詳情 (MODULE DETAILS)</th>
                      </tr>
                    </thead>
                    <tbody className="text-xs font-mono font-bold">
                      {dailyScheduleData.map(o => (
                        <tr key={o.id} className="text-white border-t border-cyber-blue/10 hover:bg-cyber-blue/5 transition-colors">
                          <td className="p-3 border-r border-cyber-blue/10 font-bold text-white bg-cyber-blue/5">{o.id}</td>
                          <td className="p-3 border-r border-cyber-blue/10 text-center text-cyber-blue">{o.progress}%</td>
                          <td className={`p-3 border-r border-cyber-blue/10 text-center font-bold ${o.variance > 0 ? 'text-cyber-orange' : 'text-green-400'}`}>{o.variance > 0 ? `+${o.variance}` : o.variance}</td>
                          <td className="p-3 border-r border-cyber-blue/10 text-center">
                            {o.machineStatus === MachineStatus.HALTED ? (
                              <span className="flex items-center justify-center gap-1 px-2 py-1 rounded-[2px] text-[10px] font-bold border border-red-500/50 text-red-500 bg-red-500/10"><PauseCircle size={12} /> 已暫停</span>
                            ) : (
                              <span className={`px-2 py-0.5 rounded-[2px] text-[10px] font-bold border ${o.dailyStatus === 'NORMAL' ? 'border-green-500/40 text-green-400 bg-green-500/10' : 'border-cyber-orange/40 text-cyber-orange bg-cyber-orange/10'}`}>{o.dailyStatus === 'NORMAL' ? '正常' : '滯後'}</span>
                            )}
                          </td>
                          <td className="p-3 border-r border-cyber-blue/10 text-center text-cyber-blue/80">{formatDate(o.projectedDate.toISOString())}</td>
                          <td className="p-3 border-r border-cyber-blue/10 text-center text-cyber-orange">{formatDate(o.closingDate)}</td>
                          <td className="p-3 align-top">
                            <div className="flex flex-col gap-1.5 py-0.5">
                              {o.details.map((d: any, i: any) => (
                                <div key={i} className="flex items-start gap-1.5 leading-[1.3] text-cyber-text/90">
                                  <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1 ${d.status === '進行中' ? 'bg-cyber-blue animate-pulse' : 'bg-cyber-muted opacity-50'}`}></span>
                                  <div className="break-words">
                                    <span className="text-cyber-blue font-bold opacity-80 mr-1">[{d.moduleName}]</span>
                                    <span className="text-cyan-100/90">{d.stepModule}: {d.stepName}</span>
                                    <span className={`ml-1.5 text-[10px] italic px-1 rounded border ${d.status === '進行中' ? 'border-cyber-blue/30 text-cyber-blue/80' : 'border-cyber-muted/30 text-cyber-muted/80'}`}>{d.status}</span>
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
            <div className="p-8 border-t border-cyber-muted/10 bg-cyber-bg/40 flex justify-between items-end font-mono">
              <div className="space-y-4">
                <div className="flex gap-16 text-cyber-muted text-[10px] uppercase tracking-[0.2em] font-bold">
                  <div className="border-b border-cyber-muted/30 pb-1 w-32">PREPARED BY</div>
                  <div className="border-b border-cyber-muted/30 pb-1 w-32">REVIEWED BY</div>
                  <div className="border-b border-cyber-muted/30 pb-1 w-32">APPROVED BY</div>
                </div>
                <p className="text-[10px] text-cyber-muted italic">AUTOMATED REPORT GENERATED BY KEN MES SERVICE. SYNC AT {new Date().toLocaleTimeString()}</p>
              </div>
              <h4 className="text-xl font-display font-black tracking-widest text-white/20 uppercase">KEN MES <span className="text-cyber-blue/20">INDUSTRY 4.0</span></h4>
            </div>
          </div>
        </div>
      )}

      {/* 報表清單按鈕 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-cyber-card border border-cyber-muted/20 p-6 group hover:border-cyan-400/50 transition-all shadow-lg relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 opacity-5 transform group-hover:scale-110 transition-transform"><Factory size={120} /></div>
          <div className="flex items-center gap-3 mb-4 font-bold">
            <Factory size={24} className="text-cyan-400" />
            <h3 className="text-lg font-bold text-white">生產廠區動態</h3>
          </div>
          <p className="text-xs text-cyber-muted mb-6 h-12 leading-relaxed">提供實時看板視圖，包含所有當前涵蓋的異常與進度狀態。</p>
          <div className="grid grid-cols-3 gap-2 relative z-10">
            {['K1廠', 'K2廠', 'K3廠'].map(ws => <button key={ws} onClick={() => setDailyScheduleWorkshop(ws)} className="bg-cyan-400/10 border border-cyan-400/50 text-cyan-400 hover:bg-cyan-400 hover:text-black py-2 font-bold rounded text-xs transition-all uppercase">{ws}</button>)}
          </div>
        </div>
        {/* 其他按鈕保持原樣 */}
        <div className="bg-cyber-card border border-cyber-muted/20 p-6 opacity-50"><h3 className="text-white text-sm font-bold">更多報表建設中...</h3></div>
      </div>
    </div>
  );
};
