#!/bin/bash
# Bash script to check users in the EMS database

echo "=== EMS Database Users ==="
echo ""

# Method 1: List all users with basic info
echo "1. All Users:"
docker exec ems_postgres psql -U ems_user -d ems_db -c "SELECT id, email, role, created_at FROM users ORDER BY created_at;"

echo ""
echo "2. Users with Device Permissions:"
docker exec ems_postgres psql -U ems_user -d ems_db -c "
SELECT 
    u.id,
    u.email,
    u.role,
    u.created_at,
    COUNT(udp.device_id) as device_count,
    STRING_AGG(d.name, ', ') as device_names
FROM users u
LEFT JOIN user_device_permissions udp ON u.id = udp.user_id
LEFT JOIN devices d ON udp.device_id = d.id
GROUP BY u.id, u.email, u.role, u.created_at
ORDER BY u.created_at;
"

echo ""
echo "3. Detailed Device Permissions:"
docker exec ems_postgres psql -U ems_user -d ems_db -c "
SELECT 
    u.email,
    u.role,
    d.name as device_name,
    d.id as device_id
FROM users u
LEFT JOIN user_device_permissions udp ON u.id = udp.user_id
LEFT JOIN devices d ON udp.device_id = d.id
ORDER BY u.email, d.name;
"

echo ""
echo "=== Done ==="

