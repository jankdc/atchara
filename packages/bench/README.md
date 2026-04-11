# @atcharajs/bench

Comprehensive benchmarking suite for the Atchara JSON parser, comparing performance against industry-standard validators like Zod, Valibot, Yup, and Joi.

## Usage

```bash
npm run bench              # runs direct + HTTP benchmarks

npm run bench:direct       # runs parsers directly (Vitest)
npm run bench:http         # HTTP load test (k6)

npm run visualize          # visualize results in HTML
npm run clean              # cleanup benchmark artifacts
```

## Benchmark Modes

Each benchmark includes both Atchara modes for comparison:

- **Atchara (Deferred)**: Parse only, no `.toValue()` - demonstrates lazy evaluation advantage
- **Atchara (Full Decode)**: Parse + `.toValue()` - fair apples-to-apples comparison with competitors

## Benchmark Files

`characteristics.bench.js`

Tests the performance characteristics of different Atchara parser types.

`comparison.bench.js`

Compares both Atchara modes against other parsers (Zod, Valibot, Yup, Joi), organized into three test categories (throughput, validation, mixed validity).

## Benchmark Scenarios

Located in `scenarios/`, each scenario provides:

- Test data (object and JSON string)
- Schema definitions for all the parsers
- Support for profiling via CPU profiler

## Results

Benchmark results are saved to `benchmark-results.json` in Vitest's standard format.

> You can also visualize the benchmarks using `npm run visualize` which will read that JSON, generate an HTML displaying those numbers. The script will also open that HTML for you.
