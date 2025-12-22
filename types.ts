
export enum MachineStatus {
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  HALTED = 'HALTED',
  COMPLETED = 'COMPLETED',
}

export type StepStatusEnum = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';

export type HolidayType = 'SINGLE' | 'DOUBLE' | 'ALTERNATE' | 'NONE';

// --- User & Auth Types ---
export enum UserRole {
  ADMIN = 'ADMIN',       // 管理员: Full Access
  MANAGER = 'MANAGER',   // 生管: Planning, Orders, Models, Holidays
  OPERATOR = 'OPERATOR'  // 生产: Workstation execution only
}

export type View = 'DASHBOARD' | 'WORKSTATION' | 'WORK_SCHEDULE' | 'ANOMALY_LIST' | 'ORDER_DB' | 'MODEL_DB' | 'HOLIDAY_DB' | 'USER_DB' | 'REPORT_DOWNLOAD';

export interface AppUser {
  id: string;
  username: string;
  password?: string; // Optional for frontend display
  name: string;      // Display Name (e.g., 张三)
  role: UserRole;
  department?: string;
  allowedViews?: View[]; // New: Granular permissions
  lastLogin?: string;
}
// -------------------------

export interface HolidayRule {
  type: HolidayType;
  name: string; // e.g., "双休 (周六/日)"
  description: string;
  specificHolidays: string[]; // ISO Date strings for specific days off (e.g., National holidays or specific Saturdays)
}

export interface StepState {
  status: StepStatusEnum;
  startTime?: string;
  endTime?: string;
  operator?: string;
}

export interface ProcessStep {
  id: string;
  parallelModule: string; // New field: 平线模组
  module: string; // 工序模组
  name: string;
  estimatedHours: number;
  description?: string;
}

export interface MachineModel {
  id: string;
  name: string; // e.g., "CNC-Lathe-X500"
  imageUrl?: string;
  steps: ProcessStep[];
  scheduleCalculationModule?: string; // New field: 排程计算依据的模组
}

export interface StepLog {
  stepId: string;
  completedAt: string; // ISO Date
  completedBy: string;
  notes?: string;
}

export interface AnomalyRecord {
  id: string;
  stepName: string; // 工序名称
  reason: string; // 异常原因
  department: string; // 责任单位
  startTime: string; // 发生时间 (ISO)
  endTime: string; // 结束时间 (ISO)
  durationDays: string; // 自动计算异常天数
  reportedAt: string;
}

export interface WorkOrder {
  id: string; // Serial Number, e.g., "SN-2023-884"
  modelId: string;
  status: MachineStatus;
  currentStepIndex: number; 
  workshop: string; 
  startDate: string; 
  
  estimatedCompletionDate: string; 
  originalEstimatedCompletionDate?: string; 

  businessClosingDate?: string; 
  
  // ERP / Order Details
  projectName?: string; // 项目名称 (New)
  issuanceRate?: string; // 发料率 (New)
  
  clientName?: string; 
  axisHead?: string; 
  toolHolderSpec?: string; 
  magazineCount?: string; 
  zAxisTravel?: string; 
  spindleSpeed?: string; 
  
  holidayType: HolidayType; 

  stepStates: Record<string, StepState>; 

  logs: StepLog[];
  anomalies?: AnomalyRecord[]; 
}

export interface AppState {
  orders: WorkOrder[];
  models: MachineModel[];
  currentUser: string;
}

export interface ModelDatabaseProps {
  models: MachineModel[];
  onAddModel: (model: MachineModel) => Promise<void>;
  onUpdateModel: (model: MachineModel) => Promise<void>;
  onDeleteModel: (id: string) => Promise<void>;
}
