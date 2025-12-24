
import { supabase } from '../supabaseClient';
import { AppUser, UserRole, View } from "../types";

// Helper: Generate default views based on role if DB is empty (Backward Compatibility)
const getDefaultViews = (role: UserRole): View[] => {
    switch (role) {
        case UserRole.ADMIN:
            return ['DASHBOARD', 'WORKSTATION', 'WORK_SCHEDULE', 'ANOMALY_LIST', 'REPORT_DOWNLOAD', 'ORDER_DB', 'MODEL_DB', 'HOLIDAY_DB', 'USER_DB'];
        case UserRole.MANAGER:
            return ['DASHBOARD', 'WORKSTATION', 'WORK_SCHEDULE', 'ANOMALY_LIST', 'REPORT_DOWNLOAD', 'ORDER_DB', 'MODEL_DB', 'HOLIDAY_DB'];
        case UserRole.OPERATOR:
            return ['DASHBOARD', 'WORK_SCHEDULE', 'WORKSTATION', 'ANOMALY_LIST'];
        default:
            return ['DASHBOARD', 'WORK_SCHEDULE'];
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

// Helper: Standardize Error Throwing with better serialization
const throwError = (context: string, error: any) => {
    console.error(`${context} Full Error:`, error);
    
    let msg = '未知错误';
    
    if (error instanceof Error) {
        msg = error.message;
        // Check for common fetch failures
        if (msg === 'Load failed' || msg === 'Failed to fetch') {
            msg = '网络连接失败：请检查 Supabase 项目網址是否正確，或是否被防火墙/插件攔截。';
        }
    } else if (typeof error === 'object' && error !== null) {
        // Handle Supabase specific error objects
        msg = error.message || error.details || error.hint || JSON.stringify(error);
    } else if (typeof error === 'string') {
        msg = error;
    }

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
                .eq('password', password)
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
            // Rethrow identified errors
            if (e instanceof Error && (e.message.includes('网络') || e.message.includes('连接'))) {
                throw e;
            }
            throwError('Login Exception', e);
            return null;
        }
    },

    // 2. Get All Users
    getAll: async (): Promise<AppUser[]> => {
        try {
            const { data, error } = await supabase
                .from('app_users')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throwError('GetAll', error);
            return (data || []).map(mapFromDb);
        } catch (e) {
            throwError('GetAll Exception', e);
            return [];
        }
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
        const { error, count } = await supabase
            .from('app_users')
            .delete({ count: 'exact' }) 
            .eq('id', id);
        
        if (error) throwError('DeleteUser', error);

        if (count === null || count === 0) {
            throw new Error("删除失败：数据库未受影響。请检查用户是否存在，或是否具有删除权限 (RLS Policy)。");
        }
    }
};
