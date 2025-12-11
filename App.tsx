
import React, { useState, useEffect } from 'react';
import { supabase } from "./supabaseClient"; 
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Workstation } from './components/Workstation';
import { AnomalyList } from './components/AnomalyList'; 
import { ReportDownload } from './components/ReportDownload'; // Import new component
import { ModelDatabase } from './components/ModelDatabase';
import { OrderDatabase } from './components/OrderDatabase';
import { HolidayDatabase } from './components/HolidayDatabase';
import { UserDatabase } from './components/UserDatabase';
import { LoginScreen } from './components/LoginScreen';

import { orderApi } from './services/orderApi';
import { modelApi } from './services/modelApi';
import { holidayApi } from './services/holidayApi';
import { userService } from './services/userService';
import { DEFAULT_HOLIDAY_RULES } from './services/holidayService';
import { View, WorkOrder, MachineStatus, MachineModel, StepStatusEnum, HolidayRule, HolidayType, StepState, AppUser, UserRole, AnomalyRecord } from './types';
import { Loader2 } from 'lucide-react';

function App() {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [currentView, setCurrentView] = useState<View>('DASHBOARD');
  
  // App Data State
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [models, setModels] = useState<MachineModel[]>([]);
  const [holidayRules, setHolidayRules] = useState<Record<HolidayType, HolidayRule>>(DEFAULT_HOLIDAY_RULES);

  // Sync/UI State
  const [isLoading, setIsLoading] = useState<boolean>(false); // Changed default to false, load after login
  const [isDataLoaded, setIsDataLoaded] = useState<boolean>(false);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [lastSaveTime, setLastSaveTime] = useState<Date>(new Date());
  const [dbStatus, setDbStatus] = useState<'CONNECTING' | 'CONNECTED' | 'ERROR'>('CONNECTING');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Check for persisted login on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('ken_mes_current_user');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      // Strictly use the stored permissions without auto-adding REPORT_DOWNLOAD overrides
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
        // Run fetches in parallel
        const [fetchedOrders, fetchedModels, fetchedHolidays] = await Promise.all([
            orderApi.fetchAll(),
            modelApi.fetchAll(),
            holidayApi.fetchAll()
        ]);

        setOrders(fetchedOrders);
        setModels(fetchedModels);
        
        // Merge fetched holidays with default structure to ensure all types exist
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

  // Login Handler
  const handleLogin = (user: AppUser) => {
    setCurrentUser(user);
    localStorage.setItem('ken_mes_current_user', JSON.stringify(user));
    setCurrentView('DASHBOARD');
  };

  // Logout Handler
  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('ken_mes_current_user');
    setIsDataLoaded(false); // Force reload on next login
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
      
      const updatedOrder: WorkOrder = {
          ...targetOrder,
          stepStates: newStepStates,
          logs: newLogs,
          currentStepIndex: completedSteps
      };

      setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));
      
      try {
        await orderApi.update(updatedOrder);
        setLastSync(new Date());
        setLastSaveTime(new Date());
      } catch (e) {
        console.error("Update failed", e);
      }
    };

  const updateStatus = async (orderId: string, status: MachineStatus) => {
    const targetOrder = orders.find(o => o.id === orderId);
    if (!targetOrder) return;

    const updatedOrder = { ...targetOrder, status };

    setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));
    
    try {
        await orderApi.update(updatedOrder);
        setLastSync(new Date());
        setLastSaveTime(new Date());
    } catch (e) {
        console.error("Update status failed", e);
    }
  }

  const handleAddAnomaly = async (orderId: string, anomaly: AnomalyRecord) => {
      // Optimistically update UI
      const targetOrder = orders.find(o => o.id === orderId);
      if (!targetOrder) return;

      const newAnomalies = [...(targetOrder.anomalies || []), anomaly];
      const updatedOrder = { ...targetOrder, anomalies: newAnomalies };
      setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));
      
      try {
        // Save to new table
        await orderApi.createAnomaly(orderId, anomaly);
        setLastSync(new Date());
        setLastSaveTime(new Date());
      } catch (e: any) {
        console.error("Add anomaly failed", e);
        // Rollback on failure
        setOrders(prev => prev.map(o => o.id === orderId ? targetOrder : o));
        // Display specific error message from Supabase (e.g., RLS policy violation)
        const errMsg = e.message || JSON.stringify(e);
        alert(`保存异常记录失败: ${errMsg}\n\n請檢查資料庫 RLS 權限設置。`);
      }
  };

  const handleUpdateAnomaly = async (updatedAnomaly: AnomalyRecord, orderId: string) => {
      // Optimistically update
      setOrders(prev => prev.map(order => {
          if (order.id === orderId && order.anomalies) {
              return {
                  ...order,
                  anomalies: order.anomalies.map(a => a.id === updatedAnomaly.id ? updatedAnomaly : a)
              };
          }
          return order;
      }));

      try {
          await orderApi.updateAnomaly(updatedAnomaly);
          setLastSync(new Date());
          setLastSaveTime(new Date());
      } catch (e: any) {
          console.error("Update anomaly failed", e);
          alert(`更新异常失败: ${e.message}`);
          // Should potentially rollback here by refetching
      }
  };

  const handleDeleteAnomaly = async (anomalyId: string, orderId: string) => {
      if(!confirm("确定要删除这条异常记录吗？")) return;

      // Optimistically delete
      setOrders(prev => prev.map(order => {
          if (order.id === orderId && order.anomalies) {
              return {
                  ...order,
                  anomalies: order.anomalies.filter(a => a.id !== anomalyId)
              };
          }
          return order;
      }));

      try {
          await orderApi.deleteAnomaly(anomalyId);
          setLastSync(new Date());
          setLastSaveTime(new Date());
      } catch (e: any) {
          console.error("Delete anomaly failed", e);
          alert(`删除异常失败: ${e.message}`);
          // Should potentially rollback
      }
  };

  const handleAddOrder = async (newOrder: WorkOrder) => {
    setOrders(prev => [newOrder, ...prev]); 
    try {
      await orderApi.create(newOrder);
      setLastSync(new Date());
      setLastSaveTime(new Date());
    } catch (e: any) {
      console.error("Failed to create order", e);
      setOrders(prev => prev.filter(o => o.id !== newOrder.id));
      alert(`创建失败: ${e.message}\n详情: ${e.details || '无详细信息'}`);
    }
  };

  const handleUpdateOrder = async (updatedOrder: WorkOrder, originalId?: string) => {
    const targetId = originalId || updatedOrder.id;
    setOrders(prev => prev.map(o => o.id === targetId ? updatedOrder : o));
    try {
      await orderApi.update(updatedOrder, originalId);
      setLastSync(new Date());
      setLastSaveTime(new Date());
    } catch (e: any) {
      console.error("Failed to update order", e);
      alert(`更新失败: ${e.message}\n详情: ${e.details || '无详细信息'}`);
    }
  };

  const handleDeleteOrder = async (id: string) => {
    if (confirm(`确定要删除机台 ${id} 的所有生产数据吗？此操作不可恢复。`)) {
      const prevOrders = [...orders];
      setOrders(prev => prev.filter(o => o.id !== id));
      try {
        await orderApi.delete(id);
        setLastSync(new Date());
        setLastSaveTime(new Date());
      } catch (e: any) {
        console.error("Failed to delete order", e);
        setOrders(prevOrders); 
        alert(`删除失败: ${e.message}\n详情: ${e.details || '无详细信息'}`);
      }
    }
  };

  // --- Model Actions ---

  const handleAddModel = async (newModel: MachineModel) => {
    setModels(prev => [...prev, newModel]);
    try {
      await modelApi.create(newModel);
      setLastSync(new Date());
      setLastSaveTime(new Date());
    } catch (e: any) {
        console.error("Failed to create model", e);
        setModels(prev => prev.filter(m => m.id !== newModel.id)); // Rollback optimistic update
        const errMsg = e.message || JSON.stringify(e);
        alert(`创建工艺失败: ${errMsg}`);
        throw e; // Throw so component knows it failed
    }
  };

  const handleUpdateModel = async (updatedModel: MachineModel) => {
    setModels(prev => prev.map(m => m.id === updatedModel.id ? updatedModel : m));
    try {
        await modelApi.update(updatedModel);
        setLastSync(new Date());
        setLastSaveTime(new Date());
    } catch (e: any) {
        console.error("Failed to update model", e);
        const errMsg = e.message || JSON.stringify(e);
        alert(`更新工艺失败: ${errMsg}`);
        throw e; // Throw so component knows it failed
    }
  };

  const handleDeleteModel = async (id: string) => {
    if(confirm('确定删除此工艺模型吗？')) {
        const prevModels = [...models];
        setModels(prev => prev.filter(m => m.id !== id));
        try {
            await modelApi.delete(id);
            setLastSync(new Date());
            setLastSaveTime(new Date());
        } catch (e: any) {
            console.error("Failed to delete model", e);
            setModels(prevModels);
            alert(`删除失败: ${e.message}`);
        }
    }
  };

  // --- Holiday Actions ---

  const handleUpdateHolidayRule = async (updatedRule: HolidayRule) => {
      setHolidayRules(prev => ({
          ...prev,
          [updatedRule.type]: updatedRule
      }));

      try {
          await holidayApi.update(updatedRule);
          setLastSync(new Date());
          setLastSaveTime(new Date());
      } catch (e: any) {
          console.error("Failed to update holiday rule", e);
          alert(`假日更新失败: ${e.message}`);
      }
  };

  // --- Render Logic ---

  if (!currentUser) {
      return <LoginScreen onLoginSuccess={handleLogin} />;
  }

  // Check permission helper
  const canAccess = (view: View) => currentUser.allowedViews?.includes(view);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-cyber-blue animate-pulse">
           <Loader2 size={48} className="animate-spin mb-4"/>
           <span className="font-mono text-xl tracking-widest">正在同步生产数据库...</span>
           <span className="text-xs mt-2 opacity-50">Fetching Orders, Models & Holidays</span>
        </div>
      );
    }

    // Role/Permission Protection Logic
    // FIXED: Strictly respect canAccess without exceptions
    if (!canAccess(currentView)) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center">
                 <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/30">
                     <span className="text-2xl">🚫</span>
                 </div>
                 <h2 className="text-xl font-bold text-white mb-2">访问被拒绝</h2>
                 <p className="text-cyber-muted">您没有权限访问此页面。</p>
                 <button 
                    onClick={() => setCurrentView('DASHBOARD')}
                    className="mt-6 text-cyber-blue hover:text-white underline text-sm"
                 >
                     返回首页
                 </button>
            </div>
        );
    }

    switch (currentView) {
      case 'DASHBOARD':
        return <Dashboard orders={orders} models={models} />;
      case 'WORKSTATION':
        return (
          <Workstation 
            orders={orders} 
            models={models} 
            onUpdateStepStatus={updateStepStatus}
            onStatusChange={updateStatus}
            onAddAnomaly={handleAddAnomaly}
          />
        );
      case 'ANOMALY_LIST':
        return (
          <AnomalyList 
            orders={orders} 
            models={models} 
            onUpdateAnomaly={handleUpdateAnomaly}
            onDeleteAnomaly={handleDeleteAnomaly}
          />
        );
      case 'REPORT_DOWNLOAD':
        return <ReportDownload orders={orders} models={models} />;
      case 'ORDER_DB':
        return (
            <OrderDatabase 
                orders={orders} 
                models={models} 
                onAddOrder={handleAddOrder}
                onUpdateOrder={handleUpdateOrder}
                onDeleteOrder={handleDeleteOrder}
            />
        );
      case 'MODEL_DB':
        return (
            <ModelDatabase 
                models={models} 
                onAddModel={handleAddModel}
                onUpdateModel={handleUpdateModel}
                onDeleteModel={handleDeleteModel}
            />
        );
      case 'HOLIDAY_DB':
        return (
            <HolidayDatabase 
                rules={holidayRules}
                onUpdateRule={handleUpdateHolidayRule}
            />
        );
      case 'USER_DB':
        return <UserDatabase />;
      default:
        return <Dashboard orders={orders} models={models} />;
    }
  };

  return (
    <Layout 
      currentView={currentView} 
      onNavigate={setCurrentView}
      lastSync={lastSync}
      lastSaveTime={lastSaveTime}
      dbStatus={dbStatus === 'ERROR' ? 'ERROR' : dbStatus}
      currentUser={currentUser}
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
}

export default App;
