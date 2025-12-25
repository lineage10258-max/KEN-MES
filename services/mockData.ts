
import { MachineModel, WorkOrder, MachineStatus } from '../types';

export const INITIAL_MODELS: MachineModel[] = [
  {
    id: 'LINMAXB',
    name: 'LINMAXB-TEST',
    steps: [
      { id: 's1', parallelModule: 'A线', module: '铸件基础', name: '底座铸件水平校准', estimatedHours: 8 },
      { id: 's2', parallelModule: 'A线', module: '铸件基础', name: '线性滑轨安装', estimatedHours: 16 },
      { id: 's3', parallelModule: 'A线', module: '结构组装', name: '鞍座與工作台组装', estimatedHours: 8 },
      { id: 's4', parallelModule: 'B线', module: '主轴系统', name: '主轴安装', estimatedHours: 8 },
      { id: 's5', parallelModule: 'B线', module: '主轴系统', name: 'ATC (刀库) 安装', estimatedHours: 8 },
      { id: 's6', parallelModule: 'B线', module: '电气系统', name: '电气柜配线', estimatedHours: 16 },
      { id: 's7', parallelModule: 'B线', module: '电气系统', name: '钣金外壳组装', estimatedHours: 24 },
      { id: 's8', parallelModule: 'C线', module: '切削', name: 'SCUT切削', estimatedHours: 8 },
      { id: 's9', parallelModule: 'C线', module: '切削', name: '八边形切削', estimatedHours: 8 },
      { id: 's10', parallelModule: 'C线', module: '质检', name: '成机检验', estimatedHours: 8 },
      { id: 's11', parallelModule: 'C线', module: '质检', name: '机台整改', estimatedHours: 8 },
      { id: 's12', parallelModule: 'D线', module: '出货', name: '拆机固定', estimatedHours: 16 },
      { id: 's13', parallelModule: 'D线', module: '出货', name: '拆机叠车', estimatedHours: 8 },
    ],
  },
  {
    id: 'COMPACTB',
    name: 'COMPACTB-TEST',
    steps: [
      { id: 'h1', parallelModule: 'A线', module: '结构组装', name: '底座组装', estimatedHours: 8 },
      { id: 'h2', parallelModule: 'A线', module: '结构组装', name: '立柱安装', estimatedHours: 8 },
      { id: 'h3', parallelModule: 'A线', module: '工作台', name: '交换工作台安装', estimatedHours: 16 },
      { id: 'h4', parallelModule: 'B线', module: '主轴系统', name: '主轴单元整合', estimatedHours: 24 },
      { id: 'h5', parallelModule: 'B线', module: '液压气动', name: '液压系统配管', estimatedHours: 8 },
      { id: 'h6', parallelModule: 'B线', module: '液压气动', name: '最终配线', estimatedHours: 16 },
      { id: 'h7', parallelModule: 'C线', module: '切削', name: 'SCUT切削', estimatedHours: 8 },
      { id: 'h8', parallelModule: 'C线', module: '切削', name: '重切削', estimatedHours: 8 },
      { id: 'h9', parallelModule: 'C线', module: '质检', name: '精度测试', estimatedHours: 8 },
      { id: 'h10', parallelModule: 'C线', module: '质检', name: '成机检验', estimatedHours: 8 },
      { id: 'h11', parallelModule: 'D线', module: '出货', name: '拆机固定', estimatedHours: 8 },
      { id: 'h12', parallelModule: 'D线', module: '出货', name: '叠车', estimatedHours: 8 },
    ],
  },
];

const generateDate = (daysOffset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString();
};

const generateStates = (modelId: string, completedCount: number) => {
  const model = INITIAL_MODELS.find(m => m.id === modelId);
  const states: any = {};
  if (model) {
    model.steps.forEach((step, index) => {
      if (index < completedCount) {
        states[step.id] = { status: 'COMPLETED', endTime: generateDate(-1) };
      } else if (index === completedCount) {
        states[step.id] = { status: 'IN_PROGRESS', startTime: generateDate(0) };
      } else {
        states[step.id] = { status: 'PENDING' };
      }
    });
  }
  return states;
};

export const INITIAL_ORDERS: WorkOrder[] = [
  {
    id: 'GSB3080C11',
    modelId: 'LINMAXB',
    status: MachineStatus.IN_PROGRESS,
    currentStepIndex: 4, 
    workshop: 'K1廠',
    startDate: generateDate(-5),
    estimatedCompletionDate: generateDate(2),
    businessClosingDate: generateDate(5),
    clientName: '上海电气',
    axisHead: 'K4',
    toolHolderSpec: 'A100',
    magazineCount: '30T',
    zAxisTravel: '1000mm',
    holidayType: 'DOUBLE', 
    stepStates: generateStates('LINMAXB', 4),
    logs: [
      { stepId: 's1', completedAt: generateDate(-5), completedBy: '操作员 A' },
      { stepId: 's2', completedAt: generateDate(-4), completedBy: '操作员 B' },
      { stepId: 's3', completedAt: generateDate(-3), completedBy: '操作员 A' },
      { stepId: 's4', completedAt: generateDate(-1), completedBy: '操作员 C' },
    ],
  },
  {
    id: 'GSB2540C37',
    modelId: 'LINMAXB',
    status: MachineStatus.IN_PROGRESS,
    currentStepIndex: 1,
    workshop: 'K2廠',
    startDate: generateDate(-1),
    estimatedCompletionDate: generateDate(4),
    businessClosingDate: generateDate(7),
    clientName: '江苏重工',
    axisHead: 'K2',
    toolHolderSpec: 'A63',
    magazineCount: '30T',
    zAxisTravel: '1500mm',
    holidayType: 'DOUBLE',
    stepStates: generateStates('LINMAXB', 1),
    logs: [
        { stepId: 's1', completedAt: generateDate(-1), completedBy: '操作员 B' },
    ],
  },
  {
    id: 'GLB3020C32',
    modelId: 'COMPACTB',
    status: MachineStatus.PLANNED,
    currentStepIndex: 0,
    workshop: 'K3廠',
    startDate: generateDate(1), 
    estimatedCompletionDate: generateDate(10),
    businessClosingDate: generateDate(15),
    clientName: '預定單',
    axisHead: 'K4',
    toolHolderSpec: 'A63',
    magazineCount: '30T',
    zAxisTravel: '1250mm',
    holidayType: 'DOUBLE',
    stepStates: {},
    logs: [],
  },
  {
    id: 'GLE2520C47',
    modelId: 'COMPACTB',
    status: MachineStatus.COMPLETED,
    currentStepIndex: 7,
    workshop: 'K1廠',
    startDate: generateDate(-20),
    estimatedCompletionDate: generateDate(-2),
    businessClosingDate: generateDate(0),
    clientName: '預定單',
    axisHead: 'K4',
    toolHolderSpec: 'A63',
    magazineCount: '30T',
    zAxisTravel: '1250mm',
    holidayType: 'DOUBLE',
    stepStates: generateStates('COMPACTB', 12),
    logs: [], 
  },
];
