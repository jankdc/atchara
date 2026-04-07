//! ParserContext trait and character classification.

// ============================================================================
// ParserContext trait - byte-reading operations shared by all contexts
// ============================================================================

pub trait ParserContext {
    fn peek_byte(&self) -> Option<u8>;
    fn remaining(&self) -> &[u8];
    fn advance_byte(&mut self);
    fn advance_bytes(&mut self, count: usize);
    fn position(&self) -> usize;
    fn set_position(&mut self, pos: usize);
    fn is_eof(&self) -> bool;
    fn slice_bytes(&self, start: usize, end: usize) -> &[u8];
}
