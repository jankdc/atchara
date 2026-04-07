# Binary Format Specification

This document specifies the binary encoding format produced by the Rust parser and consumed by the TypeScript decoder.

## Overview

Atchara uses a **schema-driven binary encoding** that eliminates type tags and field names by relying on schema knowledge. The decoder uses the same schema to interpret the binary structure.

**Properties:**

- All multi-byte values use **big-endian** (network byte order)
- No type tags stored (schema provides structure)
- Offset table appended for O(1) random access

## Result Format

The native parser returns a tuple `(isError: boolean, data: Buffer)`:

- **Success**: `(false, [value_data][offset_table][count])`
- **Error**: `(true, [error_data])`

The TypeScript layer checks `isError` and either decodes the value data or reconstructs an `AtcharaError` to throw.

## Primitive Types

### String

```
[length: u32][utf-8 bytes]
```

| Field  | Type | Size    | Description                    |
| ------ | ---- | ------- | ------------------------------ |
| length | u32  | 4 bytes | Byte count of UTF-8 data       |
| bytes  | -    | n bytes | Raw UTF-8 (no null terminator) |

**Example:** `"John"` → `00 00 00 04 4A 6F 68 6E`

### Number

```
[value: f64]
```

| Field | Type | Size    | Description                 |
| ----- | ---- | ------- | --------------------------- |
| value | f64  | 8 bytes | IEEE 754 double, big-endian |

**Example:** `30` → `40 3E 00 00 00 00 00 00`

### Integer

Same encoding as Number. Validation occurs during parsing:

- Must be whole number (no fractional part)
- Must be in JavaScript safe integer range: `-(2^53-1)` to `2^53-1`

### Boolean

```
[value: u8]
```

| Value | Meaning |
| ----- | ------- |
| 0x00  | false   |
| 0x01  | true    |

### Literal

Encoding depends on literal type:

| Literal Type | Encoding            |
| ------------ | ------------------- |
| String       | Same as String      |
| Number       | Same as Number      |
| Boolean      | Same as Boolean     |
| Null         | No bytes (implicit) |

## Container Types

### Array

```
[count: u32][element₀][element₁]...[elementₙ₋₁]
```

| Field    | Type | Size    | Description             |
| -------- | ---- | ------- | ----------------------- |
| count    | u32  | 4 bytes | Number of elements      |
| elements | -    | varies  | Each per element schema |

**Example:** `[1, 2, 3]` as `array(number())`

```
00 00 00 03                         // count: 3
3F F0 00 00 00 00 00 00             // 1.0
40 00 00 00 00 00 00 00             // 2.0
40 08 00 00 00 00 00 00             // 3.0
```

### Tuple

```
[element₀][element₁]...[elementₙ₋₁]
```

No length prefix. Schema defines element count and types.

**Example:** `[1, "hi"]` as `tuple([number(), string()])`

```
3F F0 00 00 00 00 00 00             // 1.0
00 00 00 02 68 69                   // "hi"
```

### Object

```
[offset_0: u32][offset_1: u32]...[offset_{n-1}: u32][values...]
```

| Field    | Type | Size        | Description                        |
| -------- | ---- | ----------- | ---------------------------------- |
| offset_i | u32  | 4 bytes × n | Relative offset to field i's value |
| values   | -    | varies      | Field values in schema order       |

**Properties:**

- n = number of fields in schema (known at encode time)
- Offsets are relative to start of values section (after offset table)
- `0xFFFFFFFF` indicates absent optional field
- Values stored in schema order (not parse order)
- O(1) random access to any field

**Example:** `{"name":"John","age":30}` with schema (name=0, age=1, email?=2)

```
00 00 00 00                         // offset[0] = 0 (name at values+0)
00 00 00 08                         // offset[1] = 8 (age at values+8)
FF FF FF FF                         // offset[2] = absent (optional email)
00 00 00 04 4A 6F 68 6E             // "John" (8 bytes)
40 3E 00 00 00 00 00 00             // 30.0 (8 bytes)
```

### Record

```
[count: u32][kv_data_size: u32][key_value_pairs][hash_index]
```

**Key-Value Pairs** (in parse order):

```
[key_length: u16][key_bytes][value]...
```

**Hash Index** (sorted by hash for binary search):

```
[hash: u64][offset: u32]...
```

Each entry is 12 bytes. Offsets are absolute byte positions pointing to corresponding key-value pair.

| Field        | Type | Size    | Description                        |
| ------------ | ---- | ------- | ---------------------------------- |
| count        | u32  | 4 bytes | Number of entries                  |
| kv_data_size | u32  | 4 bytes | Total size of key-value pairs data |
| key_length   | u16  | 2 bytes | Key string byte count              |
| key_bytes    | -    | n bytes | UTF-8 key                          |
| value        | -    | varies  | Value per schema                   |
| hash         | u64  | 8 bytes | FNV-1a 64-bit hash of key          |
| offset       | u32  | 4 bytes | Absolute offset to key-value pair  |

**Example:** `{"x":1,"y":2}` as `record(number())`

```
00 00 00 02                         // count: 2
00 00 00 16                         // kv_data_size: 22 bytes
00 01 78                            // key length 1, "x"
3F F0 00 00 00 00 00 00             // 1.0
00 01 79                            // key length 1, "y"
40 00 00 00 00 00 00 00             // 2.0
[hash("x"): 8 bytes][offset: 4]     // hash index entry for "x"
[hash("y"): 8 bytes][offset: 4]     // hash index entry for "y"
```

## Special Types

### Nullable

```
[flag: u8][value if flag=1]
```

| Flag | Meaning                      |
| ---- | ---------------------------- |
| 0x00 | null (no value follows)      |
| 0x01 | value present (decode inner) |

**Example:** `nullable(string())`

- Null: `00`
- `"hi"`: `01 00 00 00 02 68 69`

### Optional

Object fields marked optional are simply omitted from the binary when not present. No flag byte is written.

This differs from `nullable`: optional means field may not exist; nullable means field exists but value may be null.

### Union

```
[variant_index: u8][value]
```

| Field         | Type | Size   | Description                 |
| ------------- | ---- | ------ | --------------------------- |
| variant_index | u8   | 1 byte | 0-indexed variant (max 255) |
| value         | -    | varies | Value per variant schema    |

**Example:** `union([string(), number()])`

- `"hi"`: `00 00 00 00 02 68 69`
- `42`: `01 40 45 00 00 00 00 00 00`

## Offset Table

Appended at the end of the binary buffer for O(1) random access to schema-indexed values.

```
[value_data][offset₀: u32][offset₁: u32]...[offsetₙ₋₁: u32][count: u32]
```

| Field   | Type | Size        | Description                           |
| ------- | ---- | ----------- | ------------------------------------- |
| offsets | u32  | 4 bytes × n | Byte positions sorted by schema index |
| count   | u32  | 4 bytes     | Number of offsets (last 4 bytes)      |

**Reading the table:**

1. Read last 4 bytes as `count`
2. Table starts at `buffer.length - 4 - (count × 4)`
3. Offset for schema index `i` is at `tableStart + (i × 4)`

**Example:** Object with 2 fields (schema indices 0 and 1)

```
[...value data (22 bytes)...]
00 00 00 00                         // offset[0] = 0
00 00 00 0A                         // offset[1] = 10
00 00 00 02                         // count = 2
```

## Type Summary

| Type     | Format                                                 |
| -------- | ------------------------------------------------------ |
| String   | `[u32 length][utf-8 bytes]`                            |
| Number   | `[f64]` (8 bytes)                                      |
| Integer  | `[f64]` (8 bytes, validated during parse)              |
| Boolean  | `[u8]` (0 or 1)                                        |
| Array    | `[u32 count][elements...]`                             |
| Tuple    | `[elements...]` (no length prefix)                     |
| Object   | `[u32 offset]...[values...]` (offset table)            |
| Record   | `[u32 count][u32 kv_size][kv_pairs...][hash_index...]` |
| Nullable | `[u8 flag][value if flag=1]`                           |
| Union    | `[u8 variant_index][value]`                            |

## Error Encoding

When the result discriminator is `0x01`, error data follows with this format:

```
[error_code: u8][payload...]
```

### Error Codes

| Code | Error Type           | Payload                                                     |
| ---- | -------------------- | ----------------------------------------------------------- |
| 0    | UNEXPECTED_EOF       | (none)                                                      |
| 1    | INVALID_UTF8         | `[line: u32][column: u32][message: string]`                 |
| 2    | UNEXPECTED_CHARACTER | `[line: u32][column: u32][char: string]`                    |
| 3    | VALIDATION_ERROR     | `[line: u32][column: u32][expected: string][found: string]` |
| 4    | MISSING_REQUIRED     | `[line: u32][column: u32][field: string]`                   |
| 5    | UNEXPECTED_FIELD     | `[line: u32][column: u32][field: string]`                   |
| 6    | UNION_NO_MATCH       | `[line: u32][column: u32][count: u32][nested_errors...]`    |
| 7    | INVALID_SCHEMA       | `[message: string]`                                         |

### String Encoding in Errors

Strings in error payloads use the same format as value strings:

```
[length: u32][utf-8 bytes]
```

### Nested Errors (UNION_NO_MATCH)

For `UNION_NO_MATCH` errors, nested variant errors are encoded recursively:

```
[error_code: u8][line: u32][column: u32][count: u32]
  [nested_error_0]
  [nested_error_1]
  ...
  [nested_error_{count-1}]
```

Each nested error follows the same encoding format, allowing arbitrary nesting depth.

## Decoder Operations

### Random Access Complexity

| Operation            | Complexity | Notes                          |
| -------------------- | ---------- | ------------------------------ |
| Object field access  | O(1)       | Direct offset table lookup     |
| Record key lookup    | O(log n)   | Binary search by hash          |
| Array element access | O(i)       | Must skip i preceding elements |
| Offset table lookup  | O(1)       | Direct array access            |
| Full materialization | O(n)       | Decode entire structure        |
