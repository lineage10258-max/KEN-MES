
import React, { useState, useEffect } from 'react';
import { supabase } from "./supabaseClient"; 
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
import { userService } from './services/userService';
import { DEFAULT_HOLIDAY_RULES, calculateProjectedDate } from './services/holidayService';
import { View, WorkOrder, MachineStatus, MachineModel, StepStatusEnum, HolidayRule, HolidayType, StepState, AppUser, UserRole, AnomalyRecord, ProcessStep } from './types';
import { Loader2 } from 'lucide-react';

function App() {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [currentView, setCurrentView] = useState<View>('DASHBOARD');
  
  // App Data State
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [models, setModels] = useState<MachineModel[]>([]);
  const [holidayRules, setHolidayRules] = useState<Record<HolidayType, HolidayRule>>(DEFAULT_HOLIDAY_RULES);

  // Sync/UI State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDataLoaded, setIsDataLoaded] = useState<boolean>(false);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [lastSaveTime, setLastSaveTime] = useState<Date>(new Date());
  const [dbStatus, setDbStatus] = useState<'CONNECTING' | 'CONNECTED' | 'ERROR'>('CONNECTING');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Scaling State
  const [scaleProps, setScaleProps] = useState({ scale: 1, x: 0, y: 0 });

  // Handle Window Resize & Auto-Scale (1920x1080)
  useEffect(() => {
    const calculateScale = () => {
      const targetWidth = 1920;
      const targetHeight = 1080;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      // Calculate the scale to fit the window while maintaining aspect ratio
      const scaleX = windowWidth / targetWidth;
      const scaleY = windowHeight / targetHeight;
      const scale = Math.min(scaleX, scaleY);

      // Calculate position to center the scaled content
      const x = (windowWidth - targetWidth * scale) / 2;
      const y = (windowHeight - targetHeight * scale) / 2;

      setScaleProps({ scale, x, y });
    };

    calculateScale(); // Initial calc
    window.addEventListener('resize', calculateScale);
    return () => window.removeEventListener('resize', calculateScale);
  }, []);

  // Check for persisted login on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('ken_mes_current_user');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      setCurrentUser(user);
    }
  }, []);

  // Fetch data only after login
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

    if (!isDataLoaded) {
        initData();
    }
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

  // --- Order Actions ---
  const updateStepStatus = async (orderId: string, stepId: string, status: StepStatusEnum) => {
      const targetOrder = orders.find(o => o.id === orderId);
      if (!targetOrder) return;

      const model = models.find(m => m.id === targetOrder.modelId);
      const stepInfo = model?.steps.find(s => s.id === stepId);

      const newStepStates = { ...targetOrder.stepStates };
      newStepStates[stepId] = {
          status: status,
          startTime: status === 'IN_PROGRESS' ? new Date().toISOString() : newStepStates[stepId]?.startTime,
          endTime: status === 'COMPLETED' ? new Date().toISOString() : undefined,
          operator: currentUser ? `${currentUser.name}` : 'Unknown'
      };

      const newLogs = [...(targetOrder.logs || [])];
      if (status === 'COMPLETED') {
           newLogs.push({
               stepId,
               completedAt: new Date().toISOString(),
               completedBy: currentUser ? currentUser.name : 'Unknown',
               notes: `工序完成: ${stepInfo?.name || stepId}`
           });
      }

      const completedSteps = Object.values(newStepStates).filter((s: StepState) => s.status === 'COMPLETED').length;
      
      let newEstimatedDate = targetOrder.estimatedCompletionDate;
      if (model) {
          const getRemainingHoursForStep = (s: ProcessStep) => {
             const currentStatus = newStepStates[s.id]?.status;
             return currentStatus === 'COMPLETED' ? 0 : s.estimatedHours;
          };

          let remainingHours = 0;
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
          const now = new Date();
          newEstimatedDate = calculateProjectedDate(now, remainingHours, targetOrder.holidayType).toISOString();
      }

      const updatedOrder: WorkOrder = {
          ...targetOrder,
          stepStates: newStepStates,
          logs: newLogs,
          currentStepIndex: completedSteps,
          estimatedCompletionDate: newEstimatedDate
      };

      setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));
      try { await orderApi.update(updatedOrder); setLastSync(new Date()); setLastSaveTime(new Date()); } catch (e) { console.error("Update failed", e); }
  };

  const updateStatus = async (orderId: string, status: MachineStatus) => {
    const targetOrder = orders.find(o => o.id === orderId);
    if (!targetOrder) return;
    const updatedOrder = { ...targetOrder, status };
    setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));
    try { await orderApi.update(updatedOrder); setLastSync(new Date()); setLastSaveTime(new Date()); } catch (e) { console.error("Update status failed", e); }
  }

  const handleAddAnomaly = async (orderId: string, anomaly: AnomalyRecord) => {
      const targetOrder = orders.find(o => o.id === orderId);
      if (!targetOrder) return;
      const newAnomalies = [...(targetOrder.anomalies || []), anomaly];
      const updatedOrder = { ...targetOrder, anomalies: newAnomalies };
      setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));
      try { await orderApi.createAnomaly(orderId, anomaly); setLastSync(new Date()); setLastSaveTime(new Date()); } catch (e: any) {
        console.error("Add anomaly failed", e);
        setOrders(prev => prev.map(o => o.id === orderId ? targetOrder : o));
        const errMsg = e.message || JSON.stringify(e);
        alert(`保存异常记录失败: ${errMsg}\n\n请检查数据库 RLS 权限设置。`);
      }
  };

  const handleUpdateAnomaly = async (updatedAnomaly: AnomalyRecord, orderId: string) => {
      setOrders(prev => prev.map(order => {
          if (order.id === orderId && order.anomalies) {
              return { ...order, anomalies: order.anomalies.map(a => a.id === updatedAnomaly.id ? updatedAnomaly : a) };
          }
          return order;
      }));
      try { await orderApi.updateAnomaly(updatedAnomaly); setLastSync(new Date()); setLastSaveTime(new Date()); } catch (e: any) { alert(`更新异常失败: ${e.message}`); }
  };

  const handleDeleteAnomaly = async (anomalyId: string, orderId: string) => {
      if(!confirm("确定要删除这条异常记录吗？")) return;
      setOrders(prev => prev.map(order => {
          if (order.id === orderId && order.anomalies) {
              return { ...order, anomalies: order.anomalies.filter(a => a.id !== anomalyId) };
          }
          return order;
      }));
      try { await orderApi.deleteAnomaly(anomalyId); setLastSync(new Date()); setLastSaveTime(new Date()); } catch (e: any) { alert(`删除异常失败: ${e.message}`); }
  };

  const handleAddOrder = async (newOrder: WorkOrder) => {
    setOrders(prev => [newOrder, ...prev]); 
    try { await orderApi.create(newOrder); setLastSync(new Date()); setLastSaveTime(new Date()); } catch (e: any) {
      setOrders(prev => prev.filter(o => o.id !== newOrder.id));
      alert(`创建失败: ${e.message}\n详情: ${e.details || '无详细信息'}`);
    }
  };

  const handleUpdateOrder = async (updatedOrder: WorkOrder, originalId?: string) => {
    const targetId = originalId || updatedOrder.id;
    setOrders(prev => prev.map(o => o.id === targetId ? updatedOrder : o));
    try { await orderApi.update(updatedOrder, originalId); setLastSync(new Date()); setLastSaveTime(new Date()); } catch (e: any) {
      alert(`更新失败: ${e.message}\n详情: ${e.details || '无详细信息'}`);
    }
  };

  const handleDeleteOrder = async (id: string) => {
    if (confirm(`确定要删除机台 ${id} 的所有生产数据吗？此操作不可恢复。`)) {
      const prevOrders = [...orders];
      setOrders(prev => prev.filter(o => o.id !== id));
      try { await orderApi.delete(id); setLastSync(new Date()); setLastSaveTime(new Date()); } catch (e: any) {
        setOrders(prevOrders); 
        alert(`删除失败: ${e.message}\n详情: ${e.details || '无详细信息'}`);
      }
    }
  };

  const handleAddModel = async (newModel: MachineModel) => {
    setModels(prev => [...prev, newModel]);
    try { await modelApi.create(newModel); setLastSync(new Date()); setLastSaveTime(new Date()); } catch (e: any) {
        setModels(prev => prev.filter(m => m.id !== newModel.id)); 
        alert(`创建工艺失败: ${e.message}`); throw e; 
    }
  };

  const handleUpdateModel = async (updatedModel: MachineModel) => {
    setModels(prev => prev.map(m => m.id === updatedModel.id ? updatedModel : m));
    try { await modelApi.update(updatedModel); setLastSync(new Date()); setLastSaveTime(new Date()); } catch (e: any) {
        alert(`更新工艺失败: ${e.message}`); throw e;
    }
  };

  const handleDeleteModel = async (id: string) => {
    if(confirm('确定删除此工艺模型吗？')) {
        const prevModels = [...models];
        setModels(prev => prev.filter(m => m.id !== id));
        try { await modelApi.delete(id); setLastSync(new Date()); setLastSaveTime(new Date()); } catch (e: any) {
            setModels(prevModels); alert(`删除失败: ${e.message}`);
        }
    }
  };

  const handleUpdateHolidayRule = async (updatedRule: HolidayRule) => {
      setHolidayRules(prev => ({ ...prev, [updatedRule.type]: updatedRule }));
      try { await holidayApi.update(updatedRule); setLastSync(new Date()); setLastSaveTime(new Date()); } catch (e: any) { alert(`假日更新失败: ${e.message}`); }
  };

  // --- Render Logic ---
  const canAccess = (view: View) => currentUser?.allowedViews?.includes(view);

  const renderContent = () => {
    if (!currentUser) return <LoginScreen onLoginSuccess={handleLogin} />;

    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-cyber-blue animate-pulse">
           <Loader2 size={48} className="animate-spin mb-4"/>
           <span className="font-mono text-xl tracking-widest">正在同步生产数据库...</span>
           <span className="text-xs mt-2 opacity-50">Fetching Orders, Models & Holidays</span>
        </div>
      );
    }

    if (!canAccess(currentView)) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center">
                 <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/30">
                     <span className="text-2xl">🚫</span>
                 </div>
                 <h2 className="text-xl font-bold text-white mb-2">访问被拒绝</h2>
                 <p className="text-cyber-muted">您没有权限访问此页面。</p>
                 <button onClick={() => setCurrentView('DASHBOARD')} className="mt-6 text-cyber-blue hover:text-white underline text-sm">
                     返回首页
                 </button>
            </div>
        );
    }

    switch (currentView) {
      case 'DASHBOARD': return <Dashboard orders={orders} models={models} />;
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

  const appContent = (
    <Layout 
      currentView={currentView} 
      onNavigate={setCurrentView}
      lastSync={lastSync}
      lastSaveTime={lastSaveTime}
      dbStatus={dbStatus === 'ERROR' ? 'ERROR' : dbStatus}
      currentUser={currentUser!}
      onLogout={handleLogout}
    >
      {dbStatus === 'ERROR' && errorMessage && (
          <div className="bg-red-500/10 border-b border-red-500/50 p-2 text-center text-red-500 text-xs font-mono">
              DB Error: {errorMessage}
          </div>
      )}
      {renderContent()}
    </Layout>
  );

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      backgroundColor: '#000',
      overflow: 'hidden',
      position: 'relative'
    }}>
      <div style={{
        width: '1920px',
        height: '1080px',
        position: 'absolute',
        top: 0,
        left: 0,
        transform: `translate(${scaleProps.x}px, ${scaleProps.y}px) scale(${scaleProps.scale})`,
        transformOrigin: 'top left',
        backgroundColor: '#050b14', // Match the app background
        boxShadow: '0 0 50px rgba(0,0,0,0.8)', // Shadow to separate from letterboxing
        overflow: 'hidden'
      }}>
        {!currentUser ? <LoginScreen onLoginSuccess={handleLogin} /> : appContent}
      </div>
    </div>
  );
}

export default App;
