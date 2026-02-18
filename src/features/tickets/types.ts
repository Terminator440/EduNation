export type Ticket = {
  id: string;
  school_id: string;
  student_id: string;
  from_user_id: string;
  to_user_id: string;
  subject: string;
  body: string;
  read_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TicketWithDetails = Ticket & {
  student?: { full_name: string | null } | null;
  from_profile?: { full_name: string | null; email: string | null } | null;
};

export type TicketRecipient = {
  user_id: string;
  full_name: string | null;
  role: "teacher" | "homeroom_teacher";
  subject_name?: string | null;
};
