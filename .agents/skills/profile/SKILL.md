---
name: profile
description: Analyzes CPU profiles to identify performance bottlenecks and generate optimization recommendations (project)
---

# Profile Skill

Analyze CPU profiles to understand time distribution between native parsing, TypeScript decoding, and GC.

## Quick Start

### 1. Build with Profiling Symbols

```bash
npm run build:profile -w @atcharajs/native
npm run build -w atchara && npm run build -w @atcharajs/core
```

### 2. Collect CPU Profile

```bash
SCENARIO=throughput-baseline-simple npm run profile:cpu -w @atcharajs/bench

# With custom iterations
PROFILE_ITERATIONS=100000 SCENARIO=throughput-baseline-simple npm run profile:cpu -w @atcharajs/bench
```

Generates two profiles:

- `{scenario}-schema-building-{timestamp}.cpuprofile` - Schema creation
- `{scenario}-parsing-{timestamp}.cpuprofile` - JSON parsing

### 3. Analyze Profile

```bash
# Find latest profile
ls -lt packages/bench/profiles/*.cpuprofile | head -1

# Analyze
node .claude/skills/profile/analyze-profile.mjs packages/bench/profiles/<profile>.cpuprofile

# JSON output
node .claude/skills/profile/analyze-profile.mjs packages/bench/profiles/<profile>.cpuprofile --json
```

## Output

The analyzer shows time distribution across phases:

- **Native Parsing (NAPI)** - Time in the Rust parser
- **TypeScript Decoding** - Time in the TypeScript decoder (readObject, readString, etc.)
- **Garbage Collection** - GC overhead
- **Other** - Profiler overhead and miscellaneous

Also shows the native/decoding ratio excluding GC.

## Available Scenarios

Located in `packages/bench/scenarios/`:

- `throughput-baseline-simple` - Simple 4-field object
- `throughput-baseline-nested` - Nested structures
- `throughput-wide-object` - Many fields
- `throughput-1k-numbers` - Array of 1,000 numbers
- `throughput-string-heavy` - String-heavy payloads

## Commands

```bash
# Build
npm run build:profile -w @atcharajs/native

# Profile
SCENARIO=<name> npm run profile:cpu -w @atcharajs/bench

# Analyze
node .claude/skills/profile/analyze-profile.mjs <profile.cpuprofile>
node .claude/skills/profile/analyze-profile.mjs <profile.cpuprofile> --json
```

## Related Files

- `packages/bench/profiles/*.cpuprofile` - Profile data
- `packages/bench/scenarios/` - Profiling scenarios
- `packages/bench/profiler.js` - Profiler utility
- `.claude/skills/profile/analyze-profile.mjs` - Analyzer script
