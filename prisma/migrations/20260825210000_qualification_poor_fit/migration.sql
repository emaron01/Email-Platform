-- Confirmed non-mandatory PRIMARY misses are a known poor fit, not an unknown.
ALTER TYPE "QualificationBucket" ADD VALUE IF NOT EXISTS 'POOR_FIT';
