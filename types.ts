

export enum MachineStatus {
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  HALTED = 'HALTED',
  COMPLETED = 'COMPLETED',
}

export type StepStatusEnum = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

export type HolidayType = 'SINGLE' | 'DOUBLE' | 'ALTERNATE' | 'NONE';

// --- User & Auth Types ---
export enum UserRole {
  ADMIN = 'ADMIN',       // 管理员: Full Access
  MANAGER = 'MANAGER',   // 生管: Planning, Orders, Models, Holidays
  OPERATOR = 'OPERATOR'  // 生产: Workstation execution only
}

export type View = 'DASHBOARD' | 'WORKSTATION' | 'ANOMALY_LIST' | 'ORDER_DB' | 'MODEL_DB' | 'HOLIDAY_DB' | 'USER_DB' | 'REPORT_DOWNLOAD';

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
  currentStepIndex: number; // Deprecated conceptually, but kept for compatibility or overall progress calc
  workshop: string; // New field: 生产车间
  startDate: string; // ISO Date: 计划上线日
  
  estimatedCompletionDate: string; // ISO Date: 实时的生产完工日 (Production Completion)
  originalEstimatedCompletionDate?: string; // ISO Date: 原始的计划完工日 (Planned Completion)

  businessClosingDate?: string; // New field: 业务结关日
  
  // New Fields for Order Details
  clientName?: string; // 客户名称
  axisHead?: string; // 二轴头
  toolHolderSpec?: string; // 刀柄规格
  magazineCount?: string; // 刀库数
  zAxisTravel?: string; // New field: Z轴行程
  spindleSpeed?: string; // New field: 主轴转速
  
  holidayType: HolidayType; // New field: 假日别

  stepStates: Record<string, StepState>; // New: Track status of each step independently

  logs: StepLog[];
  anomalies?: AnomalyRecord[]; // New field: 异常记录
}

export interface AppState {
  orders: WorkOrder[];
  models: MachineModel[];
  currentUser: string;
}

// Define Prop Types for DB Components ensuring Async support
export interface ModelDatabaseProps {
  models: MachineModel[];
  onAddModel: (model: MachineModel) => Promise<void>;
  onUpdateModel: (model: MachineModel) => Promise<void>;
  onDeleteModel: (id: string) => Promise<void>;
}