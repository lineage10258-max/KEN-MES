
import { supabase } from '../supabaseClient';
import { WorkOrder, AnomalyRecord } from '../types';

// Helper: Map Database (snake_case) -> Frontend (camelCase)
const mapFromDb = (row: any): WorkOrder => ({
    id: row.id,
    modelId: row.model_id,
    status: row.status,
    currentStepIndex: row.current_step_index || 0,
    workshop: row.workshop,
    startDate: row.start_date,
    estimatedCompletionDate: row.estimated_completion_date,
    businessClosingDate: row.business_closing_date,
    holidayType: row.holiday_type || 'DOUBLE',
    
    // Optional / New Fields
    clientName: row.client_name,
    axisHead: row.axis_head,
    toolHolderSpec: row.tool_holder_spec,
    magazineCount: row.magazine_count,
    zAxisTravel: row.z_axis_travel,
    spindleSpeed: row.spindle_speed,
    
    // JSONB Fields
    stepStates: row.step_states || {},
    logs: row.logs || [],
    // Map from the joined 'order_error' table if available, fallback to legacy JSONB for compatibility
    anomalies: (row.order_error && Array.isArray(row.order_error)) 
        ? row.order_error.map((err: any) => ({
            id: err.id,
            stepName: err.step_name,
            reason: err.reason,
            department: err.department,
            startTime: err.start_time,
            endTime: err.end_time,
            durationDays: err.duration_days,
            reportedAt: err.reported_at
        })) 
        : (row.anomalies || [])
});

// Helper: Map Frontend (camelCase) -> Database (snake_case)
const mapToDb = (order: WorkOrder) => ({
    id: order.id,
    model_id: order.modelId,
    status: order.status,
    current_step_index: order.currentStepIndex,
    workshop: order.workshop,
    start_date: order.startDate,
    estimated_completion_date: order.estimatedCompletionDate,
    business_closing_date: order.businessClosingDate,
    holiday_type: order.holidayType,
    
    client_name: order.clientName,
    axis_head: order.axisHead,
    tool_holder_spec: order.toolHolderSpec,
    magazine_count: order.magazineCount,
    z_axis_travel: order.zAxisTravel,
    spindle_speed: order.spindleSpeed,
    
    step_states: order.stepStates || {},
    logs: order.logs || [],
    // We no longer write to the 'anomalies' JSONB column, data is stored in 'order_error' table
});

export const orderApi = {
  
  // 1. Fetch All
  fetchAll: async (): Promise<WorkOrder[]> => {
    // We select *, and join the order_error table
    const { data, error } = await supabase
        .from('production_order')
        .select('*, order_error(*)') 
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Supabase Fetch Error:", error);
        throw error;
    }
    
    return (data || []).map(mapFromDb);
  },

  // 2. Create
  create: async (order: WorkOrder): Promise<WorkOrder> => {
    const payload = mapToDb(order);
    const { data, error } = await supabase
        .from('production_order')
        .insert([payload])
        .select()
        .single();

    if (error) {
        throw error; 
    }
    return mapFromDb(data);
  },

  // 3. Update
  update: async (order: WorkOrder, originalId?: string): Promise<WorkOrder> => {
    const payload = mapToDb(order);
    const targetId = originalId || order.id;

    const { data, error } = await supabase
        .from('production_order')
        .update(payload)
        .eq('id', targetId)
        .select('*, order_error(*)') // Also return joined errors to keep state consistent
        .single();

    if (error) {
        throw error;
    }
    return mapFromDb(data);
  },

  // 4. Delete
  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
        .from('production_order')
        .delete()
        .eq('id', id);

    if (error) {
        throw error;
    }
  },

  // 5. Create Anomaly (New Table)
  createAnomaly: async (orderId: string, anomaly: AnomalyRecord): Promise<void> => {
      const payload = {
          id: anomaly.id, // Explicitly insert the UUID to ensure sync
          order_id: orderId,
          step_name: anomaly.stepName,
          reason: anomaly.reason,
          department: anomaly.department,
          start_time: anomaly.startTime,
          end_time: anomaly.endTime || null,
          duration_days: anomaly.durationDays,
          reported_at: anomaly.reportedAt
      };

      const { error } = await supabase
          .from('order_error')
          .insert([payload]);

      if (error) {
          console.error("Failed to insert anomaly:", error);
          throw error;
      }
  },

  // 6. Update Anomaly
  updateAnomaly: async (anomaly: AnomalyRecord): Promise<void> => {
      const payload = {
          step_name: anomaly.stepName,
          reason: anomaly.reason,
          department: anomaly.department,
          start_time: anomaly.startTime,
          end_time: anomaly.endTime || null,
          duration_days: anomaly.durationDays
      };

      const { error } = await supabase
          .from('order_error')
          .update(payload)
          .eq('id', anomaly.id); // Assuming anomaly.id matches the DB id (usually int8 or uuid)

      if (error) {
          console.error("Failed to update anomaly:", error);
          throw error;
      }
  },

  // 7. Delete Anomaly
  deleteAnomaly: async (anomalyId: string): Promise<void> => {
      // NOTE: Because local ID might be "AN-Date.now()", check if it's a temp ID or DB ID
      // But usually we just pass the ID we have. If it's not in DB, delete won't affect rows.
      const { error } = await supabase
          .from('order_error')
          .delete()
          .eq('id', anomalyId);

      if (error) {
          console.error("Failed to delete anomaly:", error);
          throw error;
      }
  }
};
