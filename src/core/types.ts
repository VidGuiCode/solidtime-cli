export interface SolidtimeAccount {
  name: string;
  baseUrl: string;
  token: string;
  defaultOrganization?: string;
  memberId?: string;
}

export interface SolidtimeContext {
  activeProfile?: string;
  activeOrganization?: string;
}

export interface SolidtimeConfig {
  profiles: SolidtimeAccount[];
  context: SolidtimeContext;
}

// API response shapes

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
  is_personal: boolean;
  billable_rate: number | null;
  employees_can_see_billable_rates: boolean;
  employees_can_manage_tasks: boolean;
  prevent_overlapping_time_entries: boolean;
  currency: string;
  currency_symbol: string;
  number_format: string;
  currency_format: string;
  date_format: string;
  interval_format: string;
  time_format: string;
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

export interface SolidtimeInvitation {
  id: string;
  email: string;
  role: string;
}

export interface SolidtimeProjectMember {
  id: string;
  member_id: string;
  billable_rate: number | null;
  project_id: string;
}

export interface SolidtimeBulkResult {
  success: string[];
  error: string[];
}

/** One row of the time-entries/aggregate response. `key` is a project/task/
 * client/user id, a tag name, or a date string depending on the group type. */
export interface SolidtimeAggregateRow {
  key: string | null;
  seconds: number;
  cost: number | null;
  grouped_type: string | null;
  grouped_data: SolidtimeAggregateRow[] | null;
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
