/*
  # Schedule monthly-token-grant Edge Function via pg_cron

  Runs every hour. The Edge Function itself is idempotent and only processes
  subscriptions whose `next_grant_at <= now()`, so hourly granularity is fine.

  Setup:
    - Enable pg_cron + pg_net extensions
    - Create the cron job that POSTs to the Edge Function
    - Uses a shared secret stored in vault (must be set out-of-band)

  Note: The CRON_SHARED_SECRET must also be set as an Edge Function secret
  with the SAME value, and stored in the Postgres `vault` for the cron call.
  See post-migration steps below.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any prior schedule (idempotent re-run)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tosche-monthly-token-grant') THEN
    PERFORM cron.unschedule('tosche-monthly-token-grant');
  END IF;
END $$;

-- The shared secret + project URL are read from vault.
-- These must be inserted before the cron fires:
--   SELECT vault.create_secret('<actual-secret>', 'cron_shared_secret');
--   SELECT vault.create_secret('https://utfyxsvxyvzxjqcgzjjl.supabase.co', 'project_url');

SELECT cron.schedule(
  'tosche-monthly-token-grant',
  '0 * * * *',  -- every hour at minute 0
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/monthly-token-grant',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
