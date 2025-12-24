
import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Workstation } from './components/Workstation';
import { AnomalyList } from './components/AnomalyList'; 
import { ReportDownload } from './components/ReportDownload'; 
import { ModelDatabase } from './components/ModelDatabase';
import { OrderDatabase } from './components/OrderDatabase';
import { HolidayDatabase } from './components/HolidayDatabase';
import { UserDatabase } from './components/UserDatabase';
import { LoginScreen } from './components/LoginScreen';

import { orderApi } from './services/orderApi';
import { modelApi } from './services/modelApi';
import { holidayApi } from './services/holidayApi';
import { DEFAULT_HOLIDAY_RULES, calculateOrderCompletionDate } from './services/holidayService';
import { View, WorkOrder, MachineStatus, MachineModel, StepStatusEnum, HolidayRule, HolidayType, StepState, AppUser, AnomalyRecord } from './types';
import { Loader2 } from 'lucide-react';

function App() {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [currentView, setCurrentView] = useState<View>('DASHBOARD');
  
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [models, setModels] = useState<MachineModel[]>([]);
  const [holidayRules, setHolidayRules] = useState<Record<HolidayType, HolidayRule>>(DEFAULT_HOLIDAY_RULES);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDataLoaded, setIsDataLoaded] = useState<boolean>(false);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [lastSaveTime, setLastSaveTime] = useState<Date>(new Date());
  const [dbStatus, setDbStatus] = useState<'CONNECTING' | 'CONNECTED' | 'ERROR'>('CONNECTING');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const storedUser = localStorage.getItem('ken_mes_current_user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const initData = async () => {
      setIsLoading(true);
      setDbStatus('CONNECTING');
      try {
        const [fetchedOrders, fetchedModels, fetchedHolidays] = await Promise.all([
            orderApi.fetchAll(),
            modelApi.fetchAll(),
            holidayApi.fetchAll()
        ]);
        setOrders(fetchedOrders);
        setModels(fetchedModels);
        setHolidayRules(prev => ({ ...prev, ...fetchedHolidays }));
        setLastSync(new Date());
        setDbStatus('CONNECTED');
        setIsDataLoaded(true);
      } catch (error: any) {
        console.error("Failed to fetch initial data:", error);
        setDbStatus('ERROR');
        setErrorMessage(error.message || 'Unknown DB Error');
      } finally {
        setIsLoading(false);
      }
    };
    if (!isDataLoaded) initData();
  }, [currentUser, isDataLoaded]);

  const handleLogin = (user: AppUser) => {
    setCurrentUser(user);
    localStorage.setItem('ken_mes_current_user', JSON.stringify(user));
    setCurrentView('DASHBOARD');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('ken_mes_current_user');
    setIsDataLoaded(false); 
  };

  const updateStepStatus = async (orderId: string, stepId: string, status: StepStatusEnum) => {
      const targetOrder = orders.find(o => o.id === orderId);
      if (!targetOrder) return;
      const model = models.find(m => m.id === targetOrder.modelId);
      const newStepStates = { ...targetOrder.stepStates };
      newStepStates[stepId] = {
          status,
          startTime: status === 'IN_PROGRESS' ? new Date().toISOString() : newStepStates[stepId]?.startTime,
          endTime: (status === 'COMPLETED' || status === 'SKIPPED') ? new Date().toISOString() : undefined,
          operator: currentUser?.name || 'Unknown'
      };

      let newEstimatedDate = targetOrder.estimatedCompletionDate;
      if (model) {
          const projectedDate = calculateOrderCompletionDate({ ...targetOrder, stepStates: newStepStates }, model, holidayRules);
          newEstimatedDate = projectedDate.toISOString();
      }

      const updatedOrder: WorkOrder = {
          ...targetOrder,
          stepStates: newStepStates,
          currentStepIndex: Object.values(newStepStates).filter((s: StepState) => s.status === 'COMPLETED' || s.status === 'SKIPPED').length,
          estimatedCompletionDate: newEstimatedDate
      };

      setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));
      try { 
        await orderApi.update(updatedOrder); 
        setLastSaveTime(new Date()); 
      } catch (e: any) { alert(`更新失敗: ${e.message}`); }
  };

  const updateStatus = async (orderId: string, status: MachineStatus) => {
    const targetOrder = orders.find(o => o.id === orderId);
    if (!targetOrder) return;
    const updatedOrder = { ...targetOrder, status };
    setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));
    try { await orderApi.update(updatedOrder); setLastSaveTime(new Date()); } catch (e) { console.error(e); }
  }

  const handleAddAnomaly = async (orderId: string, anomaly: AnomalyRecord) => {
      const targetOrder = orders.find(o => o.id === orderId);
      if (!targetOrder) return;
      const newAnomalies = [...(targetOrder.anomalies || []), anomaly];
      setOrders(prev => prev.map(o => o.id === orderId ? { ...targetOrder, anomalies: newAnomalies } : o));
      try { await orderApi.createAnomaly(orderId, anomaly); setLastSaveTime(new Date()); } catch (e) { console.error(e); }
  };

  const handleUpdateAnomaly = async (updatedAnomaly: AnomalyRecord, orderId: string) => {
      setOrders(prev => prev.map(order => {
          if (order.id === orderId && order.anomalies) {
              return { ...order, anomalies: order.anomalies.map(a => a.id === updatedAnomaly.id ? updatedAnomaly : a) };
          }
          return order;
      }));
      try { await orderApi.updateAnomaly(updatedAnomaly); setLastSaveTime(new Date()); } catch (e) { console.error(e); }
  };

  const handleDeleteAnomaly = async (anomalyId: string, orderId: string) => {
      if(!confirm("確定要刪除這條異常記錄嗎？")) return;
      setOrders(prev => prev.map(order => {
          if (order.id === orderId && order.anomalies) {
              return { ...order, anomalies: order.anomalies.filter(a => a.id !== anomalyId) };
          }
          return order;
      }));
      try { await orderApi.deleteAnomaly(anomalyId); setLastSaveTime(new Date()); } catch (e) { console.error(e); }
  };

  const handleAddOrder = async (newOrder: WorkOrder) => {
    setOrders(prev => [newOrder, ...prev]); 
    try { await orderApi.create(newOrder); setLastSaveTime(new Date()); } catch (e) { console.error(e); }
  };

  const handleUpdateOrder = async (updatedOrder: WorkOrder, originalId?: string) => {
    setOrders(prev => prev.map(o => o.id === (originalId || updatedOrder.id) ? updatedOrder : o));
    try { await orderApi.update(updatedOrder, originalId); setLastSaveTime(new Date()); } catch (e) { console.error(e); }
  };

  const handleDeleteOrder = async (id: string) => {
    if (confirm(`確定要刪除機台 ${id} 嗎？`)) {
      setOrders(prev => prev.filter(o => o.id !== id));
      try { await orderApi.delete(id); setLastSaveTime(new Date()); } catch (e) { console.error(e); }
    }
  };

  const handleAddModel = async (newModel: MachineModel) => {
    setModels(prev => [...prev, newModel]);
    try { await modelApi.create(newModel); setLastSaveTime(new Date()); } catch (e) { console.error(e); }
  };

  const handleUpdateModel = async (updatedModel: MachineModel) => {
    setModels(prev => prev.map(m => m.id === updatedModel.id ? updatedModel : m));
    try { await modelApi.update(updatedModel); setLastSaveTime(new Date()); } catch (e) { console.error(e); }
  };

  const handleDeleteModel = async (id: string) => {
    if(confirm('確定刪除此工藝模型嗎？')) {
        setModels(prev => prev.filter(m => m.id !== id));
        try { await modelApi.delete(id); setLastSaveTime(new Date()); } catch (e) { console.error(e); }
    }
  };

  const handleUpdateHolidayRule = async (updatedRule: HolidayRule) => {
      setHolidayRules(prev => ({ ...prev, [updatedRule.type]: updatedRule }));
      try { await holidayApi.update(updatedRule); setLastSaveTime(new Date()); } catch (e) { console.error(e); }
  };

  const canAccess = (view: View) => currentUser?.allowedViews?.includes(view);

  const renderContent = () => {
    if (!currentUser) return <LoginScreen onLoginSuccess={handleLogin} />;
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-cyber-blue animate-pulse">
           <Loader2 size={48} className="animate-spin mb-4"/>
           <span className="font-mono text-xl tracking-widest">正在同步生產數據庫...</span>
        </div>
      );
    }
    if (!canAccess(currentView)) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center">
                 <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/30">
                     <span className="text-2xl">🚫</span>
                 </div>
                 <h2 className="text-xl font-bold text-white mb-2">訪問被拒絕</h2>
                 <p className="text-cyber-muted">您沒有權限訪問此頁面。</p>
                 <button onClick={() => setCurrentView('DASHBOARD')} className="mt-6 text-cyber-blue hover:text-white underline text-sm">返回首頁</button>
            </div>
        );
    }

    switch (currentView) {
      case 'DASHBOARD': return <Dashboard orders={orders} models={models} />;
      case 'WORK_SCHEDULE': return <Workstation orders={orders} models={models} holidayRules={holidayRules} onUpdateStepStatus={() => {}} onStatusChange={() => {}} onAddAnomaly={() => {}} isReadOnly={true} />;
      case 'WORKSTATION': return <Workstation orders={orders} models={models} holidayRules={holidayRules} onUpdateStepStatus={updateStepStatus} onStatusChange={updateStatus} onAddAnomaly={handleAddAnomaly} />;
      case 'ANOMALY_LIST': return <AnomalyList orders={orders} models={models} onUpdateAnomaly={handleUpdateAnomaly} onDeleteAnomaly={handleDeleteAnomaly} />;
      case 'REPORT_DOWNLOAD': return <ReportDownload orders={orders} models={models} />;
      case 'ORDER_DB': return <OrderDatabase orders={orders} models={models} onAddOrder={handleAddOrder} onUpdateOrder={handleUpdateOrder} onDeleteOrder={handleDeleteOrder} />;
      case 'MODEL_DB': return <ModelDatabase models={models} onAddModel={handleAddModel} onUpdateModel={handleUpdateModel} onDeleteModel={handleDeleteModel} />;
      case 'HOLIDAY_DB': return <HolidayDatabase rules={holidayRules} onUpdateRule={handleUpdateHolidayRule} />;
      case 'USER_DB': return <UserDatabase />;
      default: return <Dashboard orders={orders} models={models} />;
    }
  };

  return (
    <div className="h-screen w-screen bg-cyber-bg overflow-hidden flex flex-col font-sans">
      {!currentUser ? (
        <LoginScreen onLoginSuccess={handleLogin} />
      ) : (
        <Layout 
          currentView={currentView} 
          onNavigate={setCurrentView} 
          lastSync={lastSync} 
          lastSaveTime={lastSaveTime} 
          dbStatus={dbStatus} 
          currentUser={currentUser!} 
          onLogout={handleLogout}
        >
          {dbStatus === 'ERROR' && errorMessage && (
            <div className="bg-red-500/10 border-b border-red-500/50 p-2 text-center text-red-500 text-xs font-mono">
              DB Error: {errorMessage}
            </div>
          )}
          {/* Main render container - ensures scrolling happens here */}
          <div className="flex-1 min-h-0">
            {renderContent()}
          </div>
        </Layout>
      )}
    </div>
  );
}

export default App;
