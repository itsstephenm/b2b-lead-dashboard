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
