export interface SolidtimeAccount {
    name: string;
    baseUrl: string;
    token: string;
    defaultOrganization?: string;
}
export interface SolidtimeContext {
    activeProfile?: string;
    activeOrganization?: string;
}
export interface SolidtimeConfig {
    profiles: SolidtimeAccount[];
    context: SolidtimeContext;
}
export interface SolidtimeUser {
    id: string;
    name: string;
    email: string;
    profile_photo_url?: string;
    timezone: string;
    week_start: string;
}
export interface SolidtimeMembership {
    id: string;
    organization: SolidtimeOrganization;
    role: string;
}
export interface SolidtimeOrganization {
    id: string;
    name: string;
    currency: string;
}
export interface SolidtimeMember {
    id: string;
    user_id: string;
    name: string;
    email: string;
    role: string;
    is_placeholder: boolean;
    billable_rate: number | null;
}
export interface SolidtimeProject {
    id: string;
    name: string;
    color: string;
    client_id: string | null;
    is_archived: boolean;
    billable_rate: number | null;
    is_billable: boolean;
    estimated_time: number | null;
    spent_time: number;
    is_public: boolean;
}
export interface SolidtimeTask {
    id: string;
    name: string;
    is_done: boolean;
    project_id: string;
    estimated_time: number | null;
    spent_time: number;
    created_at: string;
    updated_at: string;
}
export interface SolidtimeTag {
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
}
export interface SolidtimeClient {
    id: string;
    name: string;
    is_archived: boolean;
    created_at: string;
    updated_at: string;
}
export interface SolidtimeTimeEntry {
    id: string;
    start: string;
    end: string | null;
    duration: number;
    description: string;
    task_id: string | null;
    project_id: string | null;
    organization_id: string;
    user_id: string;
    tags: string[];
    billable: boolean;
}
export interface SolidtimePaginatedResponse<T> {
    data: T[];
    links: {
        first: string | null;
        last: string | null;
        prev: string | null;
        next: string | null;
    };
    meta: {
        current_page: number;
        from: number | null;
        last_page: number;
        per_page: number;
        to: number | null;
        total: number;
    };
}
//# sourceMappingURL=types.d.ts.map