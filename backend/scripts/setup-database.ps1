# PowerShell script to setup PostgreSQL database for EMS
# This script helps create the database and user if they don't exist

Write-Host "PostgreSQL Database Setup for EMS" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Check if psql is available
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlPath) {
    Write-Host "ERROR: psql command not found. Please ensure PostgreSQL is installed and in your PATH." -ForegroundColor Red
    Write-Host ""
    Write-Host "Common PostgreSQL installation paths:" -ForegroundColor Yellow
    Write-Host "  - C:\Program Files\PostgreSQL\15\bin\psql.exe" -ForegroundColor Gray
    Write-Host "  - C:\Program Files\PostgreSQL\16\bin\psql.exe" -ForegroundColor Gray
    exit 1
}

Write-Host "Found psql at: $($psqlPath.Source)" -ForegroundColor Green
Write-Host ""

# Prompt for postgres password
$postgresPassword = Read-Host "Enter PostgreSQL 'postgres' user password (or press Enter to skip if using trust authentication)"

# Build psql command
if ($postgresPassword) {
    $env:PGPASSWORD = $postgresPassword
}

Write-Host ""
Write-Host "Creating database and user..." -ForegroundColor Yellow

try {
    # Create database
    Write-Host "Creating database 'ems_db'..." -ForegroundColor Cyan
    $createDbResult = psql -U postgres -c "CREATE DATABASE ems_db;" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Database created" -ForegroundColor Green
    } else {
        if ($createDbResult -match "already exists") {
            Write-Host "  ⚠ Database already exists (this is OK)" -ForegroundColor Yellow
        } else {
            Write-Host "  ⚠ Database creation: $createDbResult" -ForegroundColor Yellow
        }
    }

    # Create user
    Write-Host "Creating user 'ems_user'..." -ForegroundColor Cyan
    $createUserSQL = @"
DO `$`$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'ems_user') THEN
        CREATE USER ems_user WITH PASSWORD 'ems_password';
    ELSE
        ALTER USER ems_user WITH PASSWORD 'ems_password';
    END IF;
END
`$`$;
"@
    $createUserResult = $createUserSQL | psql -U postgres 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ User created/updated" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ User creation: $createUserResult" -ForegroundColor Yellow
    }

    # Grant database privileges
    Write-Host "Granting database privileges..." -ForegroundColor Cyan
    $grantDbResult = psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE ems_db TO ems_user;" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Database privileges granted" -ForegroundColor Green
    }

    # Grant schema privileges (connect to database first)
    Write-Host "Granting schema privileges..." -ForegroundColor Cyan
    $grantSchemaSQL = @"
GRANT ALL ON SCHEMA public TO ems_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ems_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ems_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ems_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ems_user;
"@
    $grantSchemaResult = $grantSchemaSQL | psql -U postgres -d ems_db 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Schema privileges granted" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "Setup complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Database configuration:" -ForegroundColor Cyan
    Write-Host "  Database: ems_db" -ForegroundColor White
    Write-Host "  User: ems_user" -ForegroundColor White
    Write-Host "  Password: ems_password" -ForegroundColor White
    Write-Host ""
    Write-Host "You can now start the backend with: npm run dev" -ForegroundColor Green

} catch {
    Write-Host ""
    Write-Host "ERROR: Failed to setup database" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Manual setup:" -ForegroundColor Yellow
    Write-Host "1. Connect to PostgreSQL: psql -U postgres" -ForegroundColor Gray
    Write-Host "2. Run the SQL commands from: scripts/setup-database.sql" -ForegroundColor Gray
    exit 1
} finally {
    $env:PGPASSWORD = $null
}
