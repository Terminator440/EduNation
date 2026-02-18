import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchRecipientsForStudent,
  createTicket,
  fetchTicketsForRecipient,
  fetchTicketsSentByParent,
  fetchUnreadTicketsCount,
  markTicketAsRead,
} from "./services/tickets.service";
import type { CreateTicketInput } from "./services/tickets.service";

export function useRecipientsForStudent(studentId: string | null) {
  return useQuery({
    queryKey: ["tickets", "recipients", studentId],
    enabled: Boolean(studentId),
    queryFn: () => fetchRecipientsForStudent(studentId!),
  });
}

export function useTicketsForRecipient() {
  return useQuery({
    queryKey: ["tickets", "inbox"],
    queryFn: fetchTicketsForRecipient,
  });
}

export function useTicketsSentByParent() {
  return useQuery({
    queryKey: ["tickets", "sent"],
    queryFn: fetchTicketsSentByParent,
  });
}

export function useUnreadTicketsCount() {
  return useQuery({
    queryKey: ["tickets", "unread-count"],
    queryFn: fetchUnreadTicketsCount,
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTicketInput) => createTicket(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets", "sent"] });
    },
  });
}

export function useMarkTicketAsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) => markTicketAsRead(ticketId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets", "inbox"] });
      qc.invalidateQueries({ queryKey: ["tickets", "unread-count"] });
    },
  });
}
