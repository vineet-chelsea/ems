-- PostgreSQL Database Setup Script for EMS
-- Run this script as the postgres superuser
-- Usage: psql -U postgres -f setup-database.sql

-- Create database if it doesn't exist
CREATE DATABASE ems_db;

-- Create user if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'ems_user') THEN
        CREATE USER ems_user WITH PASSWORD 'ems_password';
    END IF;
END
$$;

-- Grant privileges on the database
GRANT ALL PRIVILEGES ON DATABASE ems_db TO ems_user;

-- Connect to the database and grant schema privileges
\c ems_db

-- Grant privileges on the public schema
GRANT ALL ON SCHEMA public TO ems_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ems_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ems_user;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ems_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ems_user;

-- Enable TimescaleDB extension (if installed)
-- CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

\echo 'Database and user setup complete!';
\echo 'Database: ems_db';
\echo 'User: ems_user';
\echo 'Password: ems_password';

