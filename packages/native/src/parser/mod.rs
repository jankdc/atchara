mod array;
mod boolean;
mod literal;
mod null;
mod nullable;
pub mod number;
mod object;
mod optional;
mod record;
mod string;
mod tuple;
mod union;
mod value;
mod whitespace;

use crate::Schema;
use crate::errors::AtcharaError;
use crate::input::ParserContext;
use crate::schema::SchemaKind;

/// JavaScript safe integer range: -(2^53 - 1) to (2^53 - 1)
/// Numbers outside this range lose precision when represented as JavaScript numbers.
/// Used to validate integer schema types maintain exact precision.
pub(crate) const MAX_SAFE: i64 = 9007199254740991;
pub(crate) const MIN_SAFE: i64 = -9007199254740991;

/// Check if a schema is a literal or contains a literal after unwrapping
pub(crate) fn is_literal_schema(schema: &Schema, defs: &[Schema]) -> bool {
    match &schema.kind {
        SchemaKind::Literal(_) => true,
        SchemaKind::Optional(inner) => is_literal_schema(inner, defs),
        SchemaKind::Ref(idx) => defs.get(*idx).is_some_and(|d| is_literal_schema(d, defs)),
        _ => false,
    }
}

/// Result of a parse step - indicates whether parsing completed, needs more data, or failed.
#[derive(Debug)]
pub enum ParseResult {
    /// Parsing complete for current value
    Complete,
    /// Need more data to continue (minimum bytes hint)
    NeedMoreData(usize),
    /// An array element has been fully encoded and is ready for consumption
    ElementReady(u32),
    /// Parse error
    Error(AtcharaError),
}

impl ParseResult {
    #[inline]
    pub fn is_complete(&self) -> bool {
        matches!(self, ParseResult::Complete)
    }

    #[inline]
    pub fn is_needs_more(&self) -> bool {
        matches!(self, ParseResult::NeedMoreData(_))
    }
}

#[derive(Clone, Copy)]
pub struct ParserSnapshot {
    position: usize,
    line: usize,
    column: usize,
}

/// Parser state combining a input context with line/column tracking.
pub struct JsonParser<Ctx: ParserContext> {
    pub context: Ctx,
    line: usize,
    column: usize,
}

impl<Ctx: ParserContext> JsonParser<Ctx> {
    pub fn new(context: Ctx) -> Self {
        Self {
            context,
            line: 1,
            column: 1,
        }
    }

    /// Branchless line/column update for a single consumed character.
    #[inline(always)]
    pub fn track(&mut self, is_newline: bool) {
        let is_nl = is_newline as usize;
        self.line += is_nl;
        self.column = is_nl + (1 - is_nl) * (self.column + 1);
    }

    /// Batch line/column update for a span of consumed characters.
    #[inline(always)]
    pub fn track_span(&mut self, chars: usize, newlines: usize, after: usize) {
        let has_newline = (newlines != 0) as usize;
        self.line += newlines;
        self.column = (1 - has_newline) * (self.column + chars) + has_newline * (1 + after);
    }

    #[inline(always)]
    pub fn line(&self) -> usize {
        self.line
    }

    #[inline(always)]
    pub fn column(&self) -> usize {
        self.column
    }

    #[inline(always)]
    pub fn snapshot(&self) -> ParserSnapshot {
        ParserSnapshot {
            position: self.context.position(),
            line: self.line,
            column: self.column,
        }
    }

    #[inline(always)]
    pub fn restore(&mut self, snap: ParserSnapshot) {
        self.context.set_position(snap.position);
        self.line = snap.line;
        self.column = snap.column;
    }

    #[inline(always)]
    pub fn expect_byte(&mut self, expected: u8) -> Result<(), AtcharaError> {
        match self.context.peek_byte() {
            Some(b) if b == expected => {
                self.context.advance_byte();
                self.track(false);
                Ok(())
            }
            Some(b) => Err(AtcharaError::UnexpectedCharacter {
                char: b as char,
                line: self.line(),
                column: self.column(),
            }),
            None => Err(AtcharaError::UnexpectedEof),
        }
    }

    #[inline(always)]
    pub fn consume_byte(&mut self) {
        self.context.advance_byte();
        self.track(false);
    }
}
