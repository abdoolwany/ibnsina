export type UserRole = 'hospital_entry' | 'hospital_verifier' | 'moh_level1' | 'moh_admin' | 'system_operator'

export type Gender = 'male' | 'female'

export interface Hospital {
  id: string
  name: string
  created_at: string
}

export interface UserProfile {
  id: string
  role: UserRole
  full_name: string
  username?: string | null
}

export interface UserHospitalLink {
  user_id: string
  hospital_id: string
}

export interface WarehouseShipment {
  id: string
  total_quantity: number
  received_by: string
  received_at: string
}

export interface VaccineBatch {
  id: string
  hospital_id: string
  quantity: number
  delivery_date: string
  batch_number: string
  expiry_date: string
  created_by: string
  notes: string | null
  created_at: string
}

export interface Vaccinator {
  id: string
  hospital_id: string
  full_name: string
  is_active: boolean
  added_by: string
  created_at: string
}

export interface ChildVaccinationRecord {
  id: string
  hospital_id: string
  child_full_name: string
  child_gender: Gender
  birth_date: string
  child_nationality: string
  father_first_name: string
  father_grandfather_name: string
  father_great_grandfather_name: string | null
  father_national_id: string
  father_passport_number: string | null
  father_id_image_key: string
  mother_first_name: string
  mother_grandfather_name: string
  mother_great_grandfather_name: string | null
  mother_national_id: string | null
  mother_passport_number: string | null
  mother_id_image_key: string
  vaccination_date: string
  batch_id: string
  vaccinator_id: string
  entered_by: string
  is_verified: boolean
  verified_by: string | null
  verified_at: string | null
  created_at: string
  updated_at: string
  is_deleted: boolean
}

export interface AuditLog {
  id: string
  table_name: string
  record_id: string
  action: 'insert' | 'update' | 'verify' | 'delete_attempt'
  performed_by: string
  performed_at: string
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
}

export interface DeletedChildVaccinationRecord {
  id: string
  original_record_id: string
  batch_id: string
  hospital_id: string
  deleted_at: string
  deleted_by: string | null
}

export interface BatchBalanceView {
  batch_id: string
  hospital_id: string
  batch_number: string
  expiry_date: string
  total_quantity: number
  used_quantity: number
  remaining_balance: number
  delivery_date: string
}

export interface Database {
  public: {
    Tables: {
      hospitals: {
        Row: Hospital
        Insert: Omit<Hospital, 'id' | 'created_at'>
        Update: Partial<Omit<Hospital, 'id'>>
      }
      user_profiles: {
        Row: UserProfile
        Insert: Omit<UserProfile, 'id'>
        Update: Partial<UserProfile>
      }
      user_hospital_links: {
        Row: UserHospitalLink
        Insert: UserHospitalLink
        Update: UserHospitalLink
      }
      warehouse_shipments: {
        Row: WarehouseShipment
        Insert: Omit<WarehouseShipment, 'id'>
        Update: Partial<Omit<WarehouseShipment, 'id'>>
      }
      vaccine_batches: {
        Row: VaccineBatch
        Insert: Omit<VaccineBatch, 'id' | 'created_at'>
        Update: Partial<Omit<VaccineBatch, 'id' | 'created_at'>>
      }
      vaccinators: {
        Row: Vaccinator
        Insert: Omit<Vaccinator, 'id' | 'created_at'>
        Update: Partial<Omit<Vaccinator, 'id' | 'created_at'>>
      }
      child_vaccination_records: {
        Row: ChildVaccinationRecord
        Insert: Omit<ChildVaccinationRecord, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<ChildVaccinationRecord, 'id' | 'created_at' | 'updated_at'>>
      }
      audit_log: {
        Row: AuditLog
        Insert: Omit<AuditLog, 'id' | 'performed_at'>
        Update: Record<string, never>
      }
      deleted_child_vaccination_records: {
        Row: DeletedChildVaccinationRecord
        Insert: Omit<DeletedChildVaccinationRecord, 'id' | 'deleted_at'>
        Update: Record<string, never>
      }
    }
    Views: {
      batch_balance_view: {
        Row: BatchBalanceView
      }
    }
    Functions: {
      [key: string]: unknown
    }
    Enums: {
      user_role: UserRole
      gender: Gender
    }
  }
}
