-- Delete all EM6400 events from device_events table
DELETE FROM device_events 
WHERE device_id IN (SELECT id FROM devices WHERE type = 'EM6400');

