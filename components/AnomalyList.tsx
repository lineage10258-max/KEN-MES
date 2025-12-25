
import React, { useState, useMemo, useEffect } from 'react';
import { WorkOrder, MachineModel, AnomalyRecord } from '../types';
import { Filter, Search, Calendar, AlertTriangle, AlertOctagon, Edit, Trash2, X, Save, CheckCircle, Zap, PauseOctagon } from 'lucide-react';

interface AnomalyListProps {
  orders: WorkOrder[];
  models: MachineModel[];
  onUpdateAnomaly: (anomaly: AnomalyRecord, orderId: string) => void;
  onDeleteAnomaly: (anomalyId: string, orderId: string) => void;
}

export const AnomalyList: React.FC<AnomalyListProps> = ({ orders, models, onUpdateAnomaly, onDeleteAnomaly }) => {
  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWorkshop, setSelectedWorkshop] = useState<string>('ALL');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Edit State
  const [editingAnomaly, setEditingAnomaly] = useState<AnomalyRecord & { orderId: string } | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // 1. Flatten all anomalies from all orders
  const allAnomalies = useMemo(() => {
    return orders.flatMap(order => {
      const anomalies = order.anomalies || [];
      const model = models.find(m => m.id === order.modelId);
      
      return anomalies.map(anomaly => ({
        ...anomaly,
        orderId: order.id,
        modelName: model?.name || order.modelId,
        workshop: order.workshop,
        // Helper date object for sorting/filtering
        reportedDate: new Date(anomaly.startTime)
      }));
    });
  }, [orders, models]);

  // 2. Filter Logic
  const filteredAnomalies = useMemo(() => {
    return allAnomalies.filter(item => {
      // Search Term (Order ID, Step Name, Reason)
      const term = searchTerm.toLowerCase();
      const matchSearch = 
        item.orderId.toLowerCase().includes(term) ||
        item.stepName.toLowerCase().includes(term) ||
        item.reason.toLowerCase().includes(term);

      // Workshop
      const matchWorkshop = selectedWorkshop === 'ALL' || item.workshop === selectedWorkshop;

      // Department
      const matchDept = selectedDepartment === 'ALL' || item.department === selectedDepartment;

      // Date Range
      let matchDate = true;
      if (startDate) {
        matchDate = matchDate && item.reportedDate >= new Date(startDate);
      }
      if (endDate) {
        // Set end date to end of day
        const e = new Date(endDate);
        e.setHours(23, 59, 59);
        matchDate = matchDate && item.reportedDate <= e;
      }

      return matchSearch && matchWorkshop && matchDept && matchDate;
    }).sort((a, b) => b.reportedDate.getTime() - a.reportedDate.getTime()); // Newest first
  }, [allAnomalies, searchTerm, selectedWorkshop, selectedDepartment, startDate, endDate]);

  // Unique Departments for Dropdown
  const uniqueDepartments = useMemo(() => {
    const depts = new Set(allAnomalies.map(a => a.department).filter(Boolean));
    return Array.from(depts);
  }, [allAnomalies]);

  // Statistics
  const totalDuration = filteredAnomalies.reduce((sum, a) => sum + parseFloat(a.durationDays || '0'), 0);

  // Helper: Correctly format ISO date to Local "YYYY-MM-DDTHH:mm" for input fields
  const formatLocalTimeForInput = (isoString: string) => {
      if (!isoString) return '';
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return ''; // Invalid date check
      
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      
      return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Edit Logic
  const handleEditClick = (item: any) => {
      setEditingAnomaly({
          ...item,
          startTime: formatLocalTimeForInput(item.startTime),
          endTime: item.endTime ? formatLocalTimeForInput(item.endTime) : ''
      });
      setShowEditModal(true);
  };

  const handleEditChange = (field: keyof AnomalyRecord, value: string) => {
      if (editingAnomaly) {
          setEditingAnomaly({ ...editingAnomaly, [field]: value });
      }
  };

  // Re-calculate duration when dates change in edit modal (Copied logic for consistency)
  useEffect(() => {
      if (editingAnomaly && showEditModal) {
          if (editingAnomaly.startTime && editingAnomaly.endTime) {
              const start = new Date(editingAnomaly.startTime);
              const end = new Date(editingAnomaly.endTime);

              if (start >= end) {
                  setEditingAnomaly(prev => prev ? ({ ...prev, durationDays: '0' }) : null);
                  return;
              }

              const WORK_START_HOUR = 8;
              const WORK_START_MIN = 30;
              const WORK_END_HOUR = 17;
              const WORK_END_MIN = 30;
              const HOURS_PER_DAY = 9;

              let totalMilliseconds = 0;
              const current = new Date(start);
              current.setHours(0,0,0,0);
              const endDateMidnight = new Date(end);
              endDateMidnight.setHours(0,0,0,0);

              while (current <= endDateMidnight) {
                  const shiftStart = new Date(current);
                  shiftStart.setHours(WORK_START_HOUR, WORK_START_MIN, 0, 0);
                  const shiftEnd = new Date(current);
                  shiftEnd.setHours(WORK_END_HOUR, WORK_END_MIN, 0, 0);
                  const overlapStart = start > shiftStart ? start : shiftStart;
                  const overlapEnd = end < shiftEnd ? end : shiftEnd;
                  if (overlapStart < overlapEnd) {
                      totalMilliseconds += overlapEnd.getTime() - overlapStart.getTime();
                  }
                  current.setDate(current.getDate() + 1);
              }

              const totalHours = totalMilliseconds / (1000 * 60 * 60);
              const totalDays = totalHours / HOURS_PER_DAY;
              const formattedDays = parseFloat(totalDays.toFixed(1)).toString();
              
              setEditingAnomaly(prev => prev ? ({ ...prev, durationDays: formattedDays }) : null);
          } else {
               setEditingAnomaly(prev => prev ? ({ ...prev, durationDays: '0' }) : null);
          }
      }
  }, [editingAnomaly?.startTime, editingAnomaly?.endTime]);

  const handleSaveEdit = () => {
      if (editingAnomaly) {
          // Construct sanitized record for API
          const recordToUpdate: AnomalyRecord = {
              id: editingAnomaly.id,
              stepName: editingAnomaly.stepName,
              reason: editingAnomaly.reason,
              department: editingAnomaly.department,
              anomalyStatus: editingAnomaly.anomalyStatus,
              startTime: new Date(editingAnomaly.startTime).toISOString(),
              endTime: editingAnomaly.endTime ? new Date(editingAnomaly.endTime).toISOString() : '',
              durationDays: editingAnomaly.durationDays,
              reportedAt: editingAnomaly.reportedAt
          };
          onUpdateAnomaly(recordToUpdate, editingAnomaly.orderId);
          setShowEditModal(false);
          setEditingAnomaly(null);
      }
  };

  return (
    <div className="w-full space-y-6 animate-fade-in relative font-sans">
       
       {/* Edit Modal */}
       {showEditModal && editingAnomaly && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm font-sans">
                <div className="bg-cyber-card border border-cyber-orange shadow-neon-orange max-w-lg w-full relative">
                    <div className="bg-cyber-orange/10 p-4 border-b border-cyber-orange/30 flex justify-between items-center">
                        <h3 className="text-xl font-bold text-white tracking-wider flex items-center gap-2 font-sans font-bold">
                            <Edit size={20} className="text-cyber-orange"/> 
                            编辑异常记录
                        </h3>
                        <button onClick={() => setShowEditModal(false)} className="text-cyber-muted hover:text-white transition-colors">
                            <X size={24} />
                        </button>
                    </div>
                    
                    <div className="p-6 space-y-4 font-sans">
                        <div className="bg-cyber-bg/30 p-2 border border-cyber-muted/10 text-xs text-cyber-muted font-mono mb-4">
                            ID: {editingAnomaly.id} | 机台: {editingAnomaly.orderId}
                        </div>

                        <div>
                            <label className="block text-xs text-cyber-blue mb-2 uppercase tracking-wider font-sans font-bold">工序名称</label>
                            <input 
                                type="text"
                                value={editingAnomaly.stepName}
                                onChange={(e) => handleEditChange('stepName', e.target.value)}
                                className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-orange focus:outline-none text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-cyber-blue mb-2 uppercase tracking-wider font-sans font-bold">异常原因</label>
                            <textarea 
                                value={editingAnomaly.reason}
                                onChange={(e) => handleEditChange('reason', e.target.value)}
                                rows={3}
                                className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-orange focus:outline-none text-sm"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-cyber-blue mb-2 uppercase tracking-wider font-sans font-bold">责任单位</label>
                                <select 
                                    value={editingAnomaly.department}
                                    onChange={(e) => handleEditChange('department', e.target.value)}
                                    className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-orange focus:outline-none text-sm"
                                >
                                    <option value="生产">生产</option>
                                    <option value="电控">电控</option>
                                    <option value="KA">KA</option>
                                    <option value="应用">应用</option>
                                    <option value="采购">采购</option>
                                    <option value="生管">生管</option>
                                    <option value="仓库">仓库</option>
                                    <option value="设计">设计</option>
                                    <option value="业务">业务</option>
                                    <option value="其他">其他</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-cyber-blue mb-2 uppercase tracking-wider font-sans font-bold">異常狀態</label>
                                <div className="flex bg-cyber-bg border border-cyber-muted/30 rounded p-1 gap-1 font-sans">
                                    <button 
                                        onClick={() => handleEditChange('anomalyStatus', 'CONTINUOUS')}
                                        className={`flex-1 py-1 text-[10px] font-bold rounded flex items-center justify-center gap-1 transition-all ${editingAnomaly.anomalyStatus === 'CONTINUOUS' ? 'bg-cyber-blue text-black shadow-neon-blue' : 'text-cyber-muted hover:text-white'}`}
                                    >
                                        持續生產
                                    </button>
                                    <button 
                                        onClick={() => handleEditChange('anomalyStatus', 'HALTED')}
                                        className={`flex-1 py-1 text-[10px] font-bold rounded flex items-center justify-center gap-1 transition-all ${editingAnomaly.anomalyStatus === 'HALTED' ? 'bg-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'text-cyber-muted hover:text-white'}`}
                                    >
                                        停工
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-cyber-blue mb-2 uppercase tracking-wider font-sans font-bold">开始时间</label>
                                <input 
                                    type="datetime-local"
                                    value={editingAnomaly.startTime}
                                    onChange={(e) => handleEditChange('startTime', e.target.value)}
                                    className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-orange focus:outline-none text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-cyber-blue mb-2 uppercase tracking-wider font-sans font-bold">结束时间</label>
                                <input 
                                    type="datetime-local"
                                    value={editingAnomaly.endTime}
                                    onChange={(e) => handleEditChange('endTime', e.target.value)}
                                    className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-orange focus:outline-none text-sm"
                                />
                            </div>
                        </div>

                         <div className="bg-cyber-bg/50 p-3 border border-cyber-muted/20 flex justify-between items-center font-sans">
                            <span className="text-xs text-cyber-muted uppercase font-sans font-bold">影响天数 (自动计算)</span>
                            <span className="text-lg font-bold text-cyber-orange">{editingAnomaly.durationDays} 天</span>
                        </div>

                        <button 
                            onClick={handleSaveEdit}
                            className="w-full bg-cyber-orange hover:bg-white text-black font-bold py-3 px-4 shadow-neon-orange transition-all flex items-center justify-center gap-2 mt-4 font-sans font-bold"
                        >
                            <Save size={18} /> 保存更改
                        </button>
                    </div>
                </div>
           </div>
       )}

       {/* Header Section */}
       <div className="flex items-center gap-4 border-b border-cyber-blue/30 pb-6 font-sans">
            <div className="p-4 bg-cyber-orange/10 rounded-full border border-cyber-orange/30 shadow-neon-orange">
                <AlertOctagon size={32} className="text-cyber-orange" />
            </div>
            <div>
                <h2 className="text-2xl font-display font-bold text-white font-sans">全厂异常监控中心</h2>
                <p className="text-cyber-muted font-mono text-sm mt-1 font-sans">
                    汇整所有生产机台的异常回报纪录，追踪责任单位 with 处理时效。
                </p>
            </div>
            <div className="ml-auto flex gap-4 font-sans">
                 <div className="bg-cyber-card border border-cyber-orange/30 px-4 py-2 rounded flex flex-col items-center">
                     <span className="text-[10px] text-cyber-muted uppercase tracking-wider font-sans font-bold">当前筛选异常数</span>
                     <span className="text-xl font-bold text-white font-mono">{filteredAnomalies.length} <span className="text-xs font-normal text-cyber-muted font-sans">件</span></span>
                 </div>
                 <div className="bg-cyber-card border border-cyber-orange/30 px-4 py-2 rounded flex flex-col items-center">
                     <span className="text-[10px] text-cyber-muted uppercase tracking-wider font-sans font-bold">累计影响天数</span>
                     <span className="text-xl font-bold text-cyber-orange font-mono">{totalDuration.toFixed(1)} <span className="text-xs font-normal text-cyber-muted font-sans">天</span></span>
                 </div>
            </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-cyber-card border border-cyber-muted/20 p-4 rounded-lg flex flex-wrap gap-4 items-end font-sans">
            <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-mono text-cyber-blue mb-1 uppercase tracking-wider flex items-center gap-2 font-sans font-bold">
                    <Search size={12}/> 关键词搜索
                </label>
                <input 
                    type="text" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="输入机台号、工序或原因..."
                    className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm font-sans"
                />
            </div>

            <div className="w-[150px]">
                 <label className="block text-xs font-mono text-cyber-blue mb-1 uppercase tracking-wider flex items-center gap-2 font-sans font-bold">
                    <Filter size={12}/> 生产廠區
                </label>
                <select 
                    value={selectedWorkshop}
                    onChange={(e) => setSelectedWorkshop(e.target.value)}
                    className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm font-sans font-bold"
                >
                    <option value="ALL">全部廠區</option>
                    <option value="K1廠">K1廠</option>
                    <option value="K2廠">K2廠</option>
                    <option value="K3廠">K3廠</option>
                </select>
            </div>

            <div className="w-[150px]">
                 <label className="block text-xs font-mono text-cyber-blue mb-1 uppercase tracking-wider flex items-center gap-2 font-sans font-bold">
                    <Filter size={12}/> 责任单位
                </label>
                <select 
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm font-sans font-bold"
                >
                    <option value="ALL">全部单位</option>
                    {uniqueDepartments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                    ))}
                </select>
            </div>

             <div className="flex gap-2 items-end font-sans">
                 <div>
                    <label className="block text-xs font-mono text-cyber-blue mb-1 uppercase tracking-wider flex items-center gap-2 font-sans font-bold">
                        <Calendar size={12}/> 开始日期
                    </label>
                    <input 
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm w-[130px]"
                    />
                 </div>
                 <div className="pb-2 text-cyber-muted font-sans">-</div>
                 <div>
                    <label className="block text-xs font-mono text-cyber-blue mb-1 uppercase tracking-wider flex items-center gap-2 font-sans font-bold">
                        <Calendar size={12}/> 结束日期
                    </label>
                    <input 
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm w-[130px]"
                    />
                 </div>
             </div>
        </div>

        {/* Data Table */}
        <div className="bg-cyber-card border border-cyber-blue/20 overflow-hidden rounded-lg shadow-lg font-sans">
             <div className="overflow-x-auto font-sans">
                <table className="w-full text-left font-mono">
                    <thead>
                        <tr className="border-b border-cyber-blue/30 bg-cyber-blue/5 text-cyber-blue text-xs uppercase tracking-wider font-sans font-bold">
                            <th className="p-4 w-[140px]">发生时间</th>
                            <th className="p-4 w-[120px]">机台号</th>
                            <th className="p-4 w-[130px]">状态</th>
                            <th className="p-4 w-[120px]">廠區</th>
                            <th className="p-4 w-[150px]">工序名称</th>
                            <th className="p-4">异常原因描述</th>
                            <th className="p-4 w-[100px]">责任单位</th>
                            <th className="p-4 w-[80px] text-right">天数</th>
                            <th className="p-4 w-[100px] text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-cyber-muted/10 font-sans">
                        {filteredAnomalies.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="p-8 text-center text-cyber-muted font-sans font-bold">
                                    <div className="flex flex-col items-center justify-center opacity-50">
                                        <AlertTriangle size={48} className="mb-2"/>
                                        <span>暂无符合筛选条件的异常记录</span>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filteredAnomalies.map((item, idx) => (
                                <tr key={`${item.id}-${idx}`} className="hover:bg-white/5 transition-colors group font-sans">
                                    <td className="p-4 text-cyber-muted text-xs font-mono">
                                        <div>{item.reportedDate.toLocaleDateString()}</div>
                                        <div className="opacity-60">{item.reportedDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                    </td>
                                    <td className="p-4 font-bold text-white group-hover:text-cyber-blue transition-colors font-mono">
                                        {item.orderId}
                                    </td>
                                    <td className="p-4">
                                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold whitespace-nowrap font-sans ${item.anomalyStatus === 'HALTED' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-cyber-blue/10 text-cyber-blue border border-cyber-blue/20'}`}>
                                            {item.anomalyStatus === 'HALTED' ? <PauseOctagon size={12} /> : <Zap size={12} />}
                                            {item.anomalyStatus === 'HALTED' ? '停工' : '持續生產'}
                                        </div>
                                    </td>
                                    <td className="p-4 text-cyber-muted font-sans font-bold">
                                        {item.workshop}
                                    </td>
                                    <td className="p-4 text-cyber-text/90 font-sans font-bold">
                                        {item.stepName}
                                    </td>
                                    <td className="p-4 text-white font-sans">
                                        {item.reason}
                                    </td>
                                    <td className="p-4 font-sans font-bold">
                                        <span className="px-2 py-1 bg-cyber-muted/10 border border-cyber-muted/30 rounded text-xs text-cyber-text font-sans font-bold">
                                            {item.department}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right font-mono font-bold">
                                        <span className={`font-bold ${parseFloat(item.durationDays) >= 1 ? 'text-red-500' : 'text-cyber-orange'}`}>
                                            {item.durationDays}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button 
                                                onClick={() => handleEditClick(item)}
                                                className="p-1 text-cyber-blue hover:bg-cyber-blue/20 rounded transition-colors"
                                                title="编辑"
                                            >
                                                <Edit size={16} />
                                            </button>
                                            <button 
                                                onClick={() => onDeleteAnomaly(item.id, item.orderId)}
                                                className="p-1 text-cyber-muted hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
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
    </div>
  );
};
