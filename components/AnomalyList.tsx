
import React, { useState, useMemo } from 'react';
import { WorkOrder, MachineModel } from '../types';
import { Filter, Search, Calendar, AlertTriangle, AlertOctagon } from 'lucide-react';

interface AnomalyListProps {
  orders: WorkOrder[];
  models: MachineModel[];
}

export const AnomalyList: React.FC<AnomalyListProps> = ({ orders, models }) => {
  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWorkshop, setSelectedWorkshop] = useState<string>('ALL');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

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
      const matchWorkshop = selectedWorkshop === 'ALL' || item.workshop.startsWith(selectedWorkshop);

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

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
       {/* Header Section */}
       <div className="flex items-center gap-4 border-b border-cyber-blue/30 pb-6">
            <div className="p-4 bg-cyber-orange/10 rounded-full border border-cyber-orange/30 shadow-neon-orange">
                <AlertOctagon size={32} className="text-cyber-orange" />
            </div>
            <div>
                <h2 className="text-2xl font-display font-bold text-white">全厂异常监控中心</h2>
                <p className="text-cyber-muted font-mono text-sm mt-1">
                    彙整所有生產機台的異常回報紀錄，追蹤責任單位與處理時效。
                </p>
            </div>
            <div className="ml-auto flex gap-4">
                 <div className="bg-cyber-card border border-cyber-orange/30 px-4 py-2 rounded flex flex-col items-center">
                     <span className="text-[10px] text-cyber-muted uppercase tracking-wider">当前筛选异常数</span>
                     <span className="text-xl font-bold text-white font-mono">{filteredAnomalies.length} <span className="text-xs font-normal text-cyber-muted">件</span></span>
                 </div>
                 <div className="bg-cyber-card border border-cyber-orange/30 px-4 py-2 rounded flex flex-col items-center">
                     <span className="text-[10px] text-cyber-muted uppercase tracking-wider">累计影响天数</span>
                     <span className="text-xl font-bold text-cyber-orange font-mono">{totalDuration.toFixed(1)} <span className="text-xs font-normal text-cyber-muted">天</span></span>
                 </div>
            </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-cyber-card border border-cyber-muted/20 p-4 rounded-lg flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-mono text-cyber-blue mb-1 uppercase tracking-wider flex items-center gap-2">
                    <Search size={12}/> 关键词搜索
                </label>
                <input 
                    type="text" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="输入机台号、工序或原因..."
                    className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"
                />
            </div>

            <div className="w-[150px]">
                 <label className="block text-xs font-mono text-cyber-blue mb-1 uppercase tracking-wider flex items-center gap-2">
                    <Filter size={12}/> 生产车间
                </label>
                <select 
                    value={selectedWorkshop}
                    onChange={(e) => setSelectedWorkshop(e.target.value)}
                    className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"
                >
                    <option value="ALL">全部车间</option>
                    <option value="K1">K1(18栋)</option>
                    <option value="K2">K2(17栋)</option>
                    <option value="K3">K3(戚墅堰)</option>
                </select>
            </div>

            <div className="w-[150px]">
                 <label className="block text-xs font-mono text-cyber-blue mb-1 uppercase tracking-wider flex items-center gap-2">
                    <Filter size={12}/> 责任单位
                </label>
                <select 
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="w-full bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm"
                >
                    <option value="ALL">全部单位</option>
                    {uniqueDepartments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                    ))}
                </select>
            </div>

             <div className="flex gap-2 items-end">
                 <div>
                    <label className="block text-xs font-mono text-cyber-blue mb-1 uppercase tracking-wider flex items-center gap-2">
                        <Calendar size={12}/> 开始日期
                    </label>
                    <input 
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="bg-cyber-bg border border-cyber-muted/40 p-2 text-white focus:border-cyber-blue focus:outline-none font-mono text-sm w-[130px]"
                    />
                 </div>
                 <div className="pb-2 text-cyber-muted">-</div>
                 <div>
                    <label className="block text-xs font-mono text-cyber-blue mb-1 uppercase tracking-wider flex items-center gap-2">
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
        <div className="bg-cyber-card border border-cyber-blue/20 overflow-hidden rounded-lg shadow-lg">
             <div className="overflow-x-auto">
                <table className="w-full text-left font-mono">
                    <thead>
                        <tr className="border-b border-cyber-blue/30 bg-cyber-blue/5 text-cyber-blue text-xs uppercase tracking-wider">
                            <th className="p-4 w-[140px]">发生时间</th>
                            <th className="p-4 w-[120px]">机台号</th>
                            <th className="p-4 w-[120px]">车间</th>
                            <th className="p-4 w-[150px]">工序名称</th>
                            <th className="p-4">异常原因描述</th>
                            <th className="p-4 w-[100px]">责任单位</th>
                            <th className="p-4 w-[100px] text-right">影响天数</th>
                        </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-cyber-muted/10">
                        {filteredAnomalies.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="p-8 text-center text-cyber-muted">
                                    <div className="flex flex-col items-center justify-center opacity-50">
                                        <AlertTriangle size={48} className="mb-2"/>
                                        <span>暂无符合筛选条件的异常记录</span>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filteredAnomalies.map((item, idx) => (
                                <tr key={`${item.id}-${idx}`} className="hover:bg-white/5 transition-colors group">
                                    <td className="p-4 text-cyber-muted text-xs">
                                        <div>{item.reportedDate.toLocaleDateString()}</div>
                                        <div className="opacity-60">{item.reportedDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                    </td>
                                    <td className="p-4 font-bold text-white group-hover:text-cyber-blue transition-colors">
                                        {item.orderId}
                                    </td>
                                    <td className="p-4 text-cyber-muted">
                                        {item.workshop}
                                    </td>
                                    <td className="p-4 text-cyber-text/90">
                                        {item.stepName}
                                    </td>
                                    <td className="p-4 text-white">
                                        {item.reason}
                                    </td>
                                    <td className="p-4">
                                        <span className="px-2 py-1 bg-cyber-muted/10 border border-cyber-muted/30 rounded text-xs text-cyber-text">
                                            {item.department}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <span className={`font-bold ${parseFloat(item.durationDays) >= 1 ? 'text-red-500' : 'text-cyber-orange'}`}>
                                            {item.durationDays}
                                        </span>
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
