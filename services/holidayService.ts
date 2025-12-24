import { HolidayType, HolidayRule } from "../types";

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
                // If Even Week -> Holiday (return false)
                // If Odd Week -> Workday (return true)
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
 * Calculate the projected completion date
 * @param startFromDate The date to start counting from (usually "today" or "start date")
 * @param hoursNeeded Total estimated hours remaining
 * @param holidayType The holiday rule to apply
 * @param customRules Optional: Pass the full DB of rules if they are editable
 */
export const calculateProjectedDate = (
    startFromDate: Date, 
    hoursNeeded: number, 
    holidayType: HolidayType,
    customRules: Record<HolidayType, HolidayRule> = DEFAULT_HOLIDAY_RULES
): Date => {
    if (hoursNeeded <= 0) return new Date(startFromDate);

    // 將剩餘工時轉換為所需天數，以每日 8 小時為計算基准
    let daysRemaining = Math.ceil(hoursNeeded / 8);
    let currentDate = new Date(startFromDate);
    const rule = customRules[holidayType];

    // 安全計數器，防止無限循環
    let iterations = 0;
    const MAX_ITERATIONS = 730; 

    // 優化後的邏輯：如果起始日期（通常是今天）是工作日，則應該從今天開始抵扣工時。
    // 這確保了如果剩餘 8 小時工作，且今天是工作日，完工日將顯示為「今天」。
    if (isWorkingDay(currentDate, rule)) {
        daysRemaining--;
    }

    // 如果還有剩餘天數需要完成，則繼續往後尋找工作日
    while (daysRemaining > 0 && iterations < MAX_ITERATIONS) {
        currentDate.setDate(currentDate.getDate() + 1);
        
        if (isWorkingDay(currentDate, rule)) {
            daysRemaining--;
        }
        iterations++;
    }

    return currentDate;
};