

import { supabase } from '../supabaseClient';
import { MachineModel } from '../types';

export const modelApi = {
  // Fetch all models
  fetchAll: async (): Promise<MachineModel[]> => {
    const { data, error } = await supabase
      .from('machine_model')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error("Model Fetch Error:", error);
      throw error;
    }
    
    // Map DB column snake_case to CamelCase if necessary, or pass through if Supabase doesn't auto-convert
    // Assuming Supabase returns objects with keys matching DB columns
    return (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        steps: row.steps,
        scheduleCalculationModule: row.schedule_calculation_module // Map from DB
    }));
  },

  // Create a new model
  create: async (model: MachineModel): Promise<MachineModel> => {
    const { data, error } = await supabase
      .from('machine_model')
      .insert([{
        id: model.id,
        name: model.name,
        steps: model.steps,
        schedule_calculation_module: model.scheduleCalculationModule // Insert new field
      }])
      .select()
      .single();

    if (error) {
      console.error("Model Create Error:", error);
      throw error;
    }
    
    return {
        id: data.id,
        name: data.name,
        steps: data.steps,
        scheduleCalculationModule: data.schedule_calculation_module
    };
  },

  // Update an existing model
  update: async (model: MachineModel): Promise<MachineModel> => {
    const { data, error } = await supabase
      .from('machine_model')
      .update({
        name: model.name,
        steps: model.steps,
        schedule_calculation_module: model.scheduleCalculationModule // Update new field
      })
      .eq('id', model.id)
      .select()
      .single();

    if (error) {
      console.error("Model Update Error:", error);
      throw error;
    }
    
    return {
        id: data.id,
        name: data.name,
        steps: data.steps,
        scheduleCalculationModule: data.schedule_calculation_module
    };
  },

  // Delete a model
  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('machine_model')
      .delete()
      .eq('id', id);

    if (error) {
      console.error("Model Delete Error:", error);
      throw error;
    }
  }
};