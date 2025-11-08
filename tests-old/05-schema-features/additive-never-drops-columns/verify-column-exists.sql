-- Verify that email column still exists after GenLogic runs
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email';
