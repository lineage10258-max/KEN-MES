
import { supabase } from '../supabaseClient';
import { AppUser, UserRole, View } from "../types";

// Helper: Generate default views based on role if DB is empty (Backward Compatibility)
const getDefaultViews = (role: UserRole): View[] => {
    switch (role) {
        case UserRole.ADMIN:
            return ['DASHBOARD', 'WORKSTATION', 'ANOMALY_LIST', 'REPORT_DOWNLOAD', 'ORDER_DB', 'MODEL_DB', 'HOLIDAY_DB', 'USER_DB'];
        case UserRole.MANAGER:
            return ['DASHBOARD', 'WORKSTATION', 'ANOMALY_LIST', 'REPORT_DOWNLOAD', 'ORDER_DB', 'MODEL_DB', 'HOLIDAY_DB'];
        case UserRole.OPERATOR:
            return ['DASHBOARD', 'WORKSTATION', 'ANOMALY_LIST'];
        default:
            return ['DASHBOARD'];
    }
};

// Helper: Map Database (snake_case) -> Frontend (camelCase)
const mapFromDb = (row: any): AppUser => ({
    id: String(row.id), // Force String to ensure strict equality works in UI filters
    username: row.username,
    name: row.name,
    role: row.role as UserRole,
    department: row.department,
    // Use stored views if array exists, otherwise fallback to role default
    allowedViews: (row.allowed_views && Array.isArray(row.allowed_views)) 
        ? row.allowed_views 
        : getDefaultViews(row.role as UserRole),
    lastLogin: row.last_login
});

// Helper: Standardize Error Throwing
const throwError = (context: string, error: any) => {
    // Log full object for debugging
    console.error(`${context} Error Object:`, error);
    
    // Extract meaningful message
    let msg = '未知错误';
    if (error?.message) msg = error.message;
    else if (error?.details) msg = error.details;
    else if (typeof error === 'string') msg = error;
    else msg = JSON.stringify(error);

    throw new Error(msg);
};

export const userService = {
    // 1. Login
    login: async (username: string, password: string): Promise<AppUser | null> => {
        try {
            const { data, error } = await supabase
                .from('app_users')
                .select('*')
                .eq('username', username)
                .eq('password', password) // In production, hash this!
                .maybeSingle(); 

            if (error) throwError('Login', error);

            if (!data) {
                return null;
            }

            // Update last login
            const { error: updateError } = await supabase
                .from('app_users')
                .update({ last_login: new Date().toISOString() })
                .eq('id', data.id);
            
            if (updateError) {
                console.warn("Failed to update login timestamp:", updateError);
            }

            return mapFromDb(data);
        } catch (e: any) {
            if (e instanceof Error) throw e;
            throwError('Login Exception', e);
            return null;
        }
    },

    // 2. Get All Users
    getAll: async (): Promise<AppUser[]> => {
        const { data, error } = await supabase
            .from('app_users')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throwError('GetAll', error);
        return (data || []).map(mapFromDb);
    },

    // 3. Create User
    create: async (u: AppUser): Promise<AppUser> => {
        const views = (u.allowedViews && u.allowedViews.length > 0)
            ? u.allowedViews 
            : getDefaultViews(u.role);

        // Prepare payload
        const payload: any = {
            username: u.username,
            password: u.password,
            name: u.name,
            role: u.role,
            department: u.department,
            allowed_views: views 
        };

        const { data, error } = await supabase
            .from('app_users')
            .insert([payload])
            .select()
            .single();
        
        if (error) {
            // Fallback: If DB schema is outdated (missing allowed_views), retry without it
            if (error.message?.includes('allowed_views') || error.message?.includes('schema cache')) {
                console.warn("Migration missing: 'allowed_views' column not found. Retrying create without permissions.");
                delete payload.allowed_views;
                
                const { data: retryData, error: retryError } = await supabase
                    .from('app_users')
                    .insert([payload])
                    .select()
                    .single();
                
                if (retryError) throwError('CreateUserRetry', retryError);
                return mapFromDb(retryData);
            }
            throwError('CreateUser', error);
        }
        return mapFromDb(data);
    },

    // 4. Update User
    update: async (u: AppUser): Promise<AppUser> => {
         const payload: any = {
                username: u.username,
                password: u.password,
                name: u.name,
                role: u.role,
                department: u.department,
                allowed_views: u.allowedViews ?? []
         };

         const { data, error } = await supabase
            .from('app_users')
            .update(payload)
            .eq('id', u.id)
            .select()
            .single();

        if (error) {
             // Fallback: If DB schema is outdated, retry without permissions column
             if (error.message?.includes('allowed_views') || error.message?.includes('schema cache')) {
                console.warn("Migration missing: 'allowed_views' column not found. Retrying update without permissions.");
                delete payload.allowed_views;
                
                const { data: retryData, error: retryError } = await supabase
                    .from('app_users')
                    .update(payload)
                    .eq('id', u.id)
                    .select()
                    .single();
                
                if (retryError) throwError('UpdateUserRetry', retryError);
                return mapFromDb(retryData);
             }
            throwError('UpdateUser', error);
        }
        return mapFromDb(data);
    },

    // 5. Delete User
    delete: async (id: string): Promise<void> => {
        // Request 'exact' count to verify deletion actually happened (catches RLS silent failures)
        const { error, count } = await supabase
            .from('app_users')
            .delete({ count: 'exact' }) 
            .eq('id', id);
        
        if (error) throwError('DeleteUser', error);

        // If count is 0, it means no rows were deleted. 
        // This usually happens if the ID doesn't exist OR RLS policy blocked the delete silently.
        if (count === null || count === 0) {
            throw new Error("删除失败：数据库未受影响。请检查用户是否存在，或是否具有刪除權限 (RLS Policy)。");
        }
    }
};
