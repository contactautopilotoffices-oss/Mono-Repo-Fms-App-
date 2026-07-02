-- Add optional comment/notes to meeting room bookings
alter table public.meeting_room_bookings
  add column if not exists comment text;
