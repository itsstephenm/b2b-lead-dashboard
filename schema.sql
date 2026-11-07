-- B2B Lead Capture Dashboard
-- Database Schema
-- Run this script once to create the required table in your PostgreSQL database.

CREATE TABLE IF NOT EXISTS leads (
    id         SERIAL PRIMARY KEY,
    full_name  VARCHAR(255) NOT NULL,
    company    VARCHAR(255),
    email      VARCHAR(255) NOT NULL,
    phone      VARCHAR(50),
    purpose    VARCHAR(255),
    source     VARCHAR(100) DEFAULT 'Direct',
    score      INT          DEFAULT 10,
    status     VARCHAR(50)  DEFAULT 'New',
    created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- Lead Notes
CREATE TABLE IF NOT EXISTS lead_notes (
    id         SERIAL PRIMARY KEY,
    lead_id    INTEGER REFERENCES leads(id) ON DELETE CASCADE,
    note       TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Profiles (RBAC & Approval Queue)
CREATE TABLE IF NOT EXISTS profiles (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email      VARCHAR(255) UNIQUE NOT NULL,
    role       VARCHAR(50) DEFAULT 'Employee',
    status     VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
