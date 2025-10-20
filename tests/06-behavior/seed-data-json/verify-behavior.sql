SELECT
  key,
  config->>'debug' as debug,
  config->'max_connections' as max_connections,
  jsonb_array_length(config->'features') as feature_count,
  jsonb_array_length(tags) as tag_count
FROM settings
ORDER BY key;
