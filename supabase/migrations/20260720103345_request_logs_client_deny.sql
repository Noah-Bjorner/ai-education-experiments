create policy request_logs_no_client_access
  on public.request_logs
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);
