# PowerShell script to check users in the EMS database

Write-Host "=== EMS Database Users ===" -ForegroundColor Cyan
Write-Host ""

# Method 1: List all users with basic info
Write-Host "1. All Users:" -ForegroundColor Yellow
docker exec ems_postgres psql -U ems_user -d ems_db -c "SELECT id, email, role, created_at FROM users ORDER BY created_at;"

Write-Host ""
Write-Host "2. Users with Device Permissions:" -ForegroundColor Yellow
docker exec ems_postgres psql -U ems_user -d ems_db -c @"
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
"@

Write-Host ""
Write-Host "3. Detailed Device Permissions:" -ForegroundColor Yellow
docker exec ems_postgres psql -U ems_user -d ems_db -c @"
SELECT 
    u.email,
    u.role,
    d.name as device_name,
    d.id as device_id
FROM users u
LEFT JOIN user_device_permissions udp ON u.id = udp.user_id
LEFT JOIN devices d ON udp.device_id = d.id
ORDER BY u.email, d.name;
"@

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green

