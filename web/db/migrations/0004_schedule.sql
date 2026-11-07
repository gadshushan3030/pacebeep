-- A local time of day next to the day, and an approval status. No time zone: the server keeps
-- what the coach said ("Tuesday, 18:00"); the phone, which knows its own zone, turns that into
-- the moment it schedules the reminder for. Without a time there is no reminder.
-- Workouts the coach creates or changes are 'pending' until the runner approves them in the app
-- (possibly moving the time). Default 'approved' so existing rows and the starter workouts and
-- the web form's workouts never wait.
alter table workouts
  add column scheduled_time time,
  add column status text not null default 'approved' check (status in ('pending', 'approved'));
