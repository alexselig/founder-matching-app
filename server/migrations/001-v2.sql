CREATE TABLE IF NOT EXISTS founders (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  cohort_group TEXT NOT NULL,
  cohort_section TEXT NOT NULL,
  company_vertical TEXT NOT NULL,
  company_vertical_levels_json TEXT NOT NULL
    CHECK (json_valid(company_vertical_levels_json)),
  company TEXT NOT NULL,
  age INTEGER NOT NULL CHECK (
    typeof(age) = 'integer'
    AND age BETWEEN 0 AND 9007199254740991
  ),
  education TEXT NOT NULL,
  role TEXT NOT NULL,
  search_name TEXT NOT NULL,
  raw_json TEXT NOT NULL CHECK (json_valid(raw_json))
);

CREATE VIRTUAL TABLE IF NOT EXISTS founders_fts USING fts5(
  name,
  search_name,
  company,
  company_vertical,
  education,
  role,
  cohort_group,
  cohort_section,
  content = 'founders',
  content_rowid = 'rowid',
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS founders_fts_insert
AFTER INSERT ON founders
BEGIN
  INSERT INTO founders_fts(
    rowid,
    name,
    search_name,
    company,
    company_vertical,
    education,
    role,
    cohort_group,
    cohort_section
  )
  VALUES (
    new.rowid,
    new.name,
    new.search_name,
    new.company,
    new.company_vertical,
    new.education,
    new.role,
    new.cohort_group,
    new.cohort_section
  );
END;

CREATE TRIGGER IF NOT EXISTS founders_fts_delete
AFTER DELETE ON founders
BEGIN
  INSERT INTO founders_fts(
    founders_fts,
    rowid,
    name,
    search_name,
    company,
    company_vertical,
    education,
    role,
    cohort_group,
    cohort_section
  )
  VALUES (
    'delete',
    old.rowid,
    old.name,
    old.search_name,
    old.company,
    old.company_vertical,
    old.education,
    old.role,
    old.cohort_group,
    old.cohort_section
  );
END;

CREATE TRIGGER IF NOT EXISTS founders_fts_update
AFTER UPDATE ON founders
BEGIN
  INSERT INTO founders_fts(
    founders_fts,
    rowid,
    name,
    search_name,
    company,
    company_vertical,
    education,
    role,
    cohort_group,
    cohort_section
  )
  VALUES (
    'delete',
    old.rowid,
    old.name,
    old.search_name,
    old.company,
    old.company_vertical,
    old.education,
    old.role,
    old.cohort_group,
    old.cohort_section
  );

  INSERT INTO founders_fts(
    rowid,
    name,
    search_name,
    company,
    company_vertical,
    education,
    role,
    cohort_group,
    cohort_section
  )
  VALUES (
    new.rowid,
    new.name,
    new.search_name,
    new.company,
    new.company_vertical,
    new.education,
    new.role,
    new.cohort_group,
    new.cohort_section
  );
END;

CREATE TABLE IF NOT EXISTS web_enrichment_runs (
  id TEXT PRIMARY KEY NOT NULL,
  founder_id TEXT NOT NULL,
  query_fingerprint TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'complete'
    CHECK (
      status IN (
        'queued',
        'running',
        'complete',
        'partial',
        'failed'
      )
    ),
  retrieved_at TEXT NOT NULL,
  completed_at TEXT,
  warnings_json TEXT
    CHECK (warnings_json IS NULL OR json_valid(warnings_json)),
  error_json TEXT
    CHECK (error_json IS NULL OR json_valid(error_json)),
  query_context_json TEXT
    CHECK (query_context_json IS NULL OR json_valid(query_context_json)),
  raw_provider_metadata_json TEXT
    CHECK (
      raw_provider_metadata_json IS NULL
      OR json_valid(raw_provider_metadata_json)
    ),
  UNIQUE (id, founder_id),
  FOREIGN KEY (founder_id) REFERENCES founders(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS web_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  founder_id TEXT NOT NULL,
  rank INTEGER NOT NULL CHECK (
    typeof(rank) = 'integer'
    AND rank BETWEEN 1 AND 5
  ),
  classification TEXT NOT NULL
    CHECK (classification IN ('founder', 'company', 'both')),
  title TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  domain TEXT NOT NULL,
  snippet TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_result_id TEXT,
  retrieved_at TEXT NOT NULL,
  confidence REAL CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  ),
  entity_match_json TEXT NOT NULL CHECK (json_valid(entity_match_json)),
  stale_after TEXT,
  raw_provider_metadata_json TEXT
    CHECK (
      raw_provider_metadata_json IS NULL
      OR json_valid(raw_provider_metadata_json)
    ),
  UNIQUE (run_id, rank),
  UNIQUE (run_id, canonical_url),
  FOREIGN KEY (run_id, founder_id)
    REFERENCES web_enrichment_runs(id, founder_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  FOREIGN KEY (founder_id) REFERENCES founders(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_web_enrichment_runs_founder_id
  ON web_enrichment_runs(founder_id);

CREATE INDEX IF NOT EXISTS idx_web_enrichment_runs_query_fingerprint
  ON web_enrichment_runs(query_fingerprint);

CREATE INDEX IF NOT EXISTS idx_web_enrichment_runs_retrieved_at
  ON web_enrichment_runs(retrieved_at DESC);

CREATE INDEX IF NOT EXISTS idx_web_results_founder_id
  ON web_results(founder_id);

CREATE INDEX IF NOT EXISTS idx_web_results_retrieved_at
  ON web_results(retrieved_at DESC);

CREATE TABLE IF NOT EXISTS dinner_configurations (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  founder_ids_json TEXT NOT NULL CHECK (json_valid(founder_ids_json)),
  configuration_json TEXT NOT NULL CHECK (json_valid(configuration_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dinner_versions (
  id TEXT PRIMARY KEY NOT NULL,
  configuration_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (
    typeof(version) = 'integer'
    AND version BETWEEN 1 AND 9007199254740991
  ),
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  created_at TEXT NOT NULL,
  UNIQUE (configuration_id, version),
  FOREIGN KEY (configuration_id) REFERENCES dinner_configurations(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dinner_versions_configuration_id
  ON dinner_versions(configuration_id);
