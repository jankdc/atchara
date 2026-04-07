//! FNV-1a 64-bit hash for record key lookup.

const FNV_1A_64_OFFSET_BASIS: u64 = 0xcbf29ce484222325;
const FNV_1A_64_PRIME: u64 = 0x00000100000001B3;

/// FNV-1a 64-bit hash function.
/// Simple, fast hash with good distribution for string keys.
#[inline]
pub fn fnv1a_64(bytes: &[u8]) -> u64 {
    let mut hash = FNV_1A_64_OFFSET_BASIS;
    for &byte in bytes {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(FNV_1A_64_PRIME);
    }
    hash
}
