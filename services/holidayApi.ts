import { supabase } from '../supabaseClient';
import { HolidayRule, HolidayType } from '../types';

// Helper to map DB snake_case to Frontend (though names match mostly)
const mapFromDb = (row: any): HolidayRule => ({
    type: row.type,
    name: row.name,
    description: row.description,
    specificHolidays: row.specific_holidays || []
});

export const holidayApi = {
  // Fetch all holiday rules
  fetchAll: async (): Promise<Record<HolidayType, HolidayRule>> => {
    const { data, error } = await supabase
      .from('holiday_rule')
      .select('*');

    if (error) {
      console.error("Holiday Fetch Error:", error);
      throw error;
    }

    // Convert array to Record<HolidayType, HolidayRule>
    const ruleMap: any = {};
    if (data) {
        data.forEach(row => {
            ruleMap[row.type] = mapFromDb(row);
        });
    }
    return ruleMap;
  },

  // Update a holiday rule (e.g., adding specific dates)
  update: async (rule: HolidayRule): Promise<HolidayRule> => {
    const { data, error } = await supabase
      .from('holiday_rule')
      .update({
          specific_holidays: rule.specificHolidays
      })
      .eq('type', rule.type)
      .select()
      .single();

    if (error) {
      console.error("Holiday Update Error:", error);
      throw error;
    }
    return mapFromDb(data);
  }
};