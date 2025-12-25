
import { HolidayType, HolidayRule, ProcessStep, AnomalyRecord } from "../types";

// Helper to get ISO Week Number
const getISOWeek = (date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

// Default configuration for the 4 types
export const DEFAULT_HOLIDAY_RULES: Record<HolidayType, HolidayRule> = {
    'DOUBLE': {
        type: 'DOUBLE',
        name: '双休',
        description: '每周六、周日休息',
        specificHolidays: [] 
    },
    'SINGLE': {
        type: 'SINGLE',
        name: '单休',
        description: '每周日休息',
        specificHolidays: []
    },
    'ALTERNATE': {
        type: 'ALTERNATE',
        name: '隔周休',
        description: '每周日休息，双周周六自动休息 (默认偶数周休)',
        specificHolidays: []
    },
    'NONE': {
        type: 'NONE',
        name: '无休假',
        description: '全年无固定周休 (仅特定法定假日)',
        specificHolidays: []
    }
};

/**
 * Check if a specific date is a working day based on the rule
 */
export const isWorkingDay = (date: Date, rule: HolidayRule): boolean => {
    if (!date || isNaN(date.getTime())) return true;
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
    const dateString = date.toISOString().split('T')[0];

    // 1. Check Specific Holidays (Overrides everything)
    if (rule.specificHolidays.includes(dateString)) {
        return false;
    }

    // 2. Check Standard Weekly Rules
    switch (rule.type) {
        case 'DOUBLE':
            // Off on Sat (6) and Sun (0)
            return dayOfWeek !== 0 && dayOfWeek !== 6;
        
        case 'SINGLE':
            // Off on Sun (0)
            return dayOfWeek !== 0;

        case 'ALTERNATE':
            // Always Off on Sun (0)
            if (dayOfWeek === 0) return false;
            
            // Logic for Saturday: Off on Even ISO Weeks
            if (dayOfWeek === 6) {
                const weekNum = getISOWeek(date);
                if (weekNum % 2 === 0) return false;
            }
            return true;

        case 'NONE':
            return true;

        default:
            return true;
    }
};

/**
 * Check if a date is within a HALTED anomaly period
 */
const isHaltedDay = (date: Date, anomalies: AnomalyRecord[]): boolean => {
    if (!date || isNaN(date.getTime()) || !anomalies || anomalies.length === 0) return false;
    const targetTime = date.getTime();
    
    return anomalies.some(a => {
        if (a.anomalyStatus !== 'HALTED') return false;
        const start = new Date(a.startTime);
        if (isNaN(start.getTime())) return false;
        start.setHours(0,0,0,0);
        
        // If no end time, assume it's still halted up to "today"
        const end = a.endTime ? new Date(a.endTime) : new Date();
        if (isNaN(end.getTime())) return false;
        end.setHours(23,59,59,999);
        
        return targetTime >= start.getTime() && targetTime <= end.getTime();
    });
};

/**
 * Standardized Order Completion Projection
 */
export function calculateOrderCompletionDate(
    order: { startDate: string, stepStates: Record<string, any>, holidayType: HolidayType, anomalies?: AnomalyRecord[] },
    model: { steps: ProcessStep[], scheduleCalculationModule?: string },
    customRules: Record<HolidayType, HolidayRule> = DEFAULT_HOLIDAY_RULES
): Date {
    const rule = customRules[order.holidayType] || DEFAULT_HOLIDAY_RULES['DOUBLE'];
    const modules = Array.from(new Set(model.steps.map(s => s.parallelModule || '通用')));
    const anomalies = order.anomalies || [];
    
    if (model.scheduleCalculationModule && modules.includes(model.scheduleCalculationModule)) {
        const modSteps = model.steps.filter(s => (s.parallelModule || '通用') === model.scheduleCalculationModule);
        return projectStepList(order.startDate, modSteps, order.stepStates, rule, anomalies);
    }

    const completionDates = modules.map(mod => {
        const modSteps = model.steps.filter(s => (s.parallelModule || '通用') === mod);
        return projectStepList(order.startDate, modSteps, order.stepStates, rule, anomalies);
    });

    return new Date(Math.max(...completionDates.map(d => d.getTime())));
}

/**
 * Projects a sequence of steps starting from startDateStr.
 */
function projectStepList(startDateStr: string, steps: ProcessStep[], states: Record<string, any>, rule: HolidayRule, anomalies: AnomalyRecord[]): Date {
    // 強化起始日期安全性
    let cursor = new Date(startDateStr);
    if (isNaN(cursor.getTime())) {
        cursor = new Date();
    }
    cursor.setHours(0,0,0,0);
    
    // 取得當前時間與 21:00 順延邏輯
    const now = new Date();
    const todayAtMidnight = new Date(now);
    todayAtMidnight.setHours(0,0,0,0);
    
    // 如果現在超過 21:00，有效「今日」視為「明日」
    const effectiveEarliestStart = new Date(todayAtMidnight);
    if (now.getHours() >= 21) {
        effectiveEarliestStart.setDate(effectiveEarliestStart.getDate() + 1);
    }

    let lastUsedDate = new Date(cursor);

    steps.forEach(step => {
        const state = states[step.id] || { status: 'PENDING' };
        
        if (state.status === 'COMPLETED' || state.status === 'SKIPPED') {
            const endStr = state.endTime || state.startTime || startDateStr;
            const endTime = new Date(endStr);
            const dateOnly = isNaN(endTime.getTime()) ? new Date(cursor) : new Date(endTime);
            dateOnly.setHours(0,0,0,0);
            
            if (dateOnly > lastUsedDate) lastUsedDate = new Date(dateOnly);
            if (dateOnly >= cursor) {
                cursor = new Date(dateOnly);
                cursor.setDate(cursor.getDate() + 1);
            }
        } else {
            // 對於未開工(PENDING)或進行中(IN_PROGRESS)的任务：
            // 起點游標不得早於有效起點
            if (cursor < effectiveEarliestStart) {
                cursor = new Date(effectiveEarliestStart);
            }

            let hoursRemaining = step.estimatedHours;
            while (hoursRemaining > 0) {
                let safety = 0;
                // 檢查是否為工作日 且 不是停工日
                while ((!isWorkingDay(cursor, rule) || isHaltedDay(cursor, anomalies)) && safety < 100) {
                    cursor.setDate(cursor.getDate() + 1);
                    safety++;
                }
                
                lastUsedDate = new Date(cursor);
                hoursRemaining -= 8; // 假設每日 8 小時
                cursor.setDate(cursor.getDate() + 1);
            }
        }
    });

    return lastUsedDate;
}

/**
 * Simplified Projection (Legacy / Backwards Compatibility)
 */
export const calculateProjectedDate = (
    startFromDate: Date, 
    hoursNeeded: number, 
    holidayType: HolidayType,
    customRules: Record<HolidayType, HolidayRule> = DEFAULT_HOLIDAY_RULES
): Date => {
    if (hoursNeeded <= 0) return new Date(startFromDate);
    
    const now = new Date();
    let startD = isNaN(startFromDate.getTime()) ? new Date() : startFromDate;
    let effectiveStart = new Date(startD);
    if (now.getHours() >= 21 && startD.toDateString() === now.toDateString()) {
        effectiveStart.setDate(effectiveStart.getDate() + 1);
    }

    let daysRemaining = Math.ceil(hoursNeeded / 8);
    let currentDate = new Date(effectiveStart);
    const rule = customRules[holidayType] || DEFAULT_HOLIDAY_RULES['DOUBLE'];
    let iterations = 0;
    
    if (isWorkingDay(currentDate, rule)) daysRemaining--;
    while (daysRemaining > 0 && iterations < 730) {
        currentDate.setDate(currentDate.getDate() + 1);
        if (isWorkingDay(currentDate, rule)) daysRemaining--;
        iterations++;
    }
    return currentDate;
};
