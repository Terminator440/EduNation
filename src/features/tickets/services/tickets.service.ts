import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserSchoolId } from "@/lib/supabase-helpers";
import { handleServiceError } from "@/lib/error-handler";
import type { Ticket, TicketWithDetails, TicketRecipient } from "../types";

export type CreateTicketInput = {
  student_id: string;
  to_user_id: string;
  subject: string;
  body: string;
};

/**
 * Fetch recipients (teachers + homeroom) for a student – parents use this to choose who to message.
 */
export async function fetchRecipientsForStudent(
  studentId: string
): Promise<TicketRecipient[]> {
  const schoolId = await getCurrentUserSchoolId();
  if (!schoolId) return [];

  const { data: student, error: studentErr } = await supabase
    .from("students")
    .select("class_id")
    .eq("id", studentId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (studentErr || !student?.class_id) return [];

  const [classRes, subjectsRes] = await Promise.all([
    supabase
      .from("classes")
      .select("teacher_id")
      .eq("id", student.class_id)
      .eq("school_id", schoolId)
      .maybeSingle(),
    supabase
      .from("subjects")
      .select("id, name, teacher_id")
      .eq("class_id", student.class_id)
      .eq("school_id", schoolId),
  ]);

  const homeroomId = classRes.data?.teacher_id ?? null;
  const subjects = subjectsRes.data ?? [];
  const teacherIds = new Map<string, { name: string; subject_name?: string }>();

  if (homeroomId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", homeroomId)
      .maybeSingle();
    teacherIds.set(homeroomId, {
      name: profile?.full_name ?? null,
      subject_name: "Diriginte",
    });
  }

  for (const sub of subjects) {
    if (!sub.teacher_id) continue;
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", sub.teacher_id)
      .maybeSingle();
    const existing = teacherIds.get(sub.teacher_id);
    teacherIds.set(sub.teacher_id, {
      name: profile?.full_name ?? null,
      subject_name: existing?.subject_name ?? sub.name ?? null,
    });
  }

  const recipients: TicketRecipient[] = [];
  for (const [uid, info] of teacherIds) {
    recipients.push({
      user_id: uid,
      full_name: info.name,
      role: info.subject_name === "Diriginte" ? "homeroom_teacher" : "teacher",
      subject_name: info.subject_name ?? null,
    });
  }
  return recipients;
}

/**
 * Create a ticket (parent sends message to teacher/diriginte).
 */
export async function createTicket(input: CreateTicketInput): Promise<Ticket> {
  const schoolId = await getCurrentUserSchoolId();
  if (!schoolId) throw new Error("Nu aveți o școală asociată");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Trebuie să fiți autentificat");

  const { data, error } = await supabase
    .from("tickets")
    .insert({
      school_id: schoolId,
      student_id: input.student_id,
      from_user_id: user.id,
      to_user_id: input.to_user_id,
      subject: input.subject.trim(),
      body: input.body.trim(),
    })
    .select()
    .single();

  if (error) {
    handleServiceError(error, "Trimitere mesaj");
    throw error;
  }
  return data as Ticket;
}

/**
 * Fetch tickets received by current user (teacher/diriginte), with details.
 */
export async function fetchTicketsForRecipient(): Promise<TicketWithDetails[]> {
  const schoolId = await getCurrentUserSchoolId();
  if (!schoolId) return [];

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("tickets")
    .select(`
      id, school_id, student_id, from_user_id, to_user_id, subject, body, read_at, created_at, updated_at,
      student:students(full_name)
    `)
    .eq("to_user_id", user.id)
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[tickets] fetchTicketsForRecipient:", error);
    return [];
  }

  const rows = (data ?? []) as TicketWithDetails[];
  const fromIds = [...new Set(rows.map((r) => r.from_user_id).filter(Boolean))];
  if (fromIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", fromIds);
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    rows.forEach((r) => {
      r.from_profile = profileMap.get(r.from_user_id) ?? null;
    });
  }
  return rows;
}

/**
 * Fetch tickets sent by current user (parent).
 */
export async function fetchTicketsSentByParent(): Promise<TicketWithDetails[]> {
  const schoolId = await getCurrentUserSchoolId();
  if (!schoolId) return [];

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("tickets")
    .select(`
      id, school_id, student_id, from_user_id, to_user_id, subject, body, read_at, created_at, updated_at,
      student:students(full_name)
    `)
    .eq("from_user_id", user.id)
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[tickets] fetchTicketsSentByParent:", error);
    return [];
  }

  return (data ?? []) as TicketWithDetails[];
}

/**
 * Count unread tickets for current user (recipient).
 */
export async function fetchUnreadTicketsCount(): Promise<number> {
  const schoolId = await getCurrentUserSchoolId();
  if (!schoolId) return 0;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count, error } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("to_user_id", user.id)
    .eq("school_id", schoolId)
    .is("read_at", null);

  if (error) return 0;
  return count ?? 0;
}

/**
 * Mark a ticket as read (recipient).
 */
export async function markTicketAsRead(ticketId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("tickets")
    .update({ read_at: new Date().toISOString() })
    .eq("id", ticketId)
    .eq("to_user_id", user.id);
}
