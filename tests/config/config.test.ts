// Port target: jira-cloud-cli internal/config/config_test.go (506 lines)
//
// Note: the Go impl uses a TOML config + env overrides + OS keyring for the
// API token. Our initial impl uses `conf` (JSON). Before un-skipping these
// tests, decide whether to:
//   (a) keep our JSON-only approach and port only the env-override tests, or
//   (b) switch to TOML + keyring to match the Go behavior 1:1.
import { describe, it } from 'vitest';

describe.skip('config loader (port of internal/config/config_test.go)', () => {
  it.todo('env vars override config file values');
  it.todo('missing config raises helpful error');
  it.todo('tilde in paths expands to HOME');
  it.todo('workspace config overrides global');
  it.todo('API token read from keyring when not in file');
  it.todo('config schema versioning / migration');
});
