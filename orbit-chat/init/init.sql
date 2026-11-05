-- Create database
CREATE DATABASE orbit_chat;

-- Set password for existing postgres user
ALTER USER postgres WITH PASSWORD 'postgreskey';

-- Grant privileges (superuser already has full privileges, but included for completeness)
GRANT ALL PRIVILEGES ON DATABASE orbit_chat TO postgres;