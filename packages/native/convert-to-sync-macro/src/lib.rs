//! Proc macro that generates both sync and generator variants from async fn methods.
//!
//! For each `async fn` in an annotated `impl` block:
//! - **Sync variant**: strips `async` keyword, all `.await`, replaces source type → target type
//! - **Gen variant**: renames function to `{name}_gen`, renames `Self::foo(args).await`
//!   to `Self::foo_gen(args).await`, keeps non-Self `.await` calls intact
//!
//! Methods annotated with `#[boxed]` get special treatment in the gen variant:
//! the async body is wrapped in `Box::pin(async move { ... })` and the return type
//! becomes `Pin<Box<dyn Future<Output = T> + '_>>`. This breaks recursive future sizing.

use proc_macro::TokenStream;
use proc_macro2::Span;
use quote::quote;
use syn::parse::{Parse, ParseStream};
use syn::visit_mut::VisitMut;
use syn::{Expr, Ident, ImplItem, ItemImpl, ReturnType, Token, parse_macro_input, parse_quote};

/// Parsed macro arguments: `SourceType => TargetType`
struct ConvertArgs {
    source: Ident,
    target: syn::Type,
}

impl Parse for ConvertArgs {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        let source: Ident = input.parse()?;
        input.parse::<Token![=>]>()?;
        let target: syn::Type = input.parse()?;
        Ok(ConvertArgs { source, target })
    }
}

/// Strip all `.await` from expressions
struct StripAwait;

impl VisitMut for StripAwait {
    fn visit_expr_mut(&mut self, expr: &mut Expr) {
        syn::visit_mut::visit_expr_mut(self, expr);

        if let Expr::Await(await_expr) = expr {
            *expr = *await_expr.base.clone();
        }
    }
}

/// Replace source type identifier with target type in type positions
struct ReplaceCtxType {
    source: String,
    target: syn::Type,
}

impl VisitMut for ReplaceCtxType {
    fn visit_type_path_mut(&mut self, type_path: &mut syn::TypePath) {
        syn::visit_mut::visit_type_path_mut(self, type_path);

        if let Some(segment) = type_path.path.segments.last()
            && segment.ident == self.source
            && let syn::Type::Path(new_tp) = &self.target
        {
            *type_path = new_tp.clone();
        }
    }
}

/// Rename `Self::method(args).await` → `Self::method_gen(args).await`
/// Leave non-Self `.await` calls (context methods) unchanged.
///
/// Handles three patterns without double-renaming:
/// 1. `Self::foo().await`  → Await(Call(Path))
/// 2. `Self::foo().await?` → Try(Await(Call(Path))) — handled by (1) during recursion
/// 3. `Self::foo()?.await` → Await(Try(Call(Path)))
struct RenameSelfs;

impl VisitMut for RenameSelfs {
    fn visit_expr_mut(&mut self, expr: &mut Expr) {
        // Recurse into children first
        syn::visit_mut::visit_expr_mut(self, expr);

        if let Expr::Await(await_expr) = expr {
            // Pattern 1: Self::method(args).await
            // Also covers pattern 2 during recursion (the inner Await gets visited first)
            if let Expr::Call(call_expr) = &mut *await_expr.base {
                rename_self_call(call_expr);
            }
            // Pattern 3: Self::method(args)?.await
            if let Expr::Try(try_expr) = &mut *await_expr.base
                && let Expr::Call(call_expr) = &mut *try_expr.expr
            {
                rename_self_call(call_expr);
            }
        }

        // No handler for Try(Await(Call(Path))) — pattern 2 is handled by the
        // Await(Call(Path)) handler during recursion into Try's inner expr.
    }
}

/// Rename Self::method → Self::method_gen in a call expression
fn rename_self_call(call_expr: &mut syn::ExprCall) {
    if let Expr::Path(path_expr) = &mut *call_expr.func {
        let segments = &mut path_expr.path.segments;
        if segments.len() == 2 && segments[0].ident == "Self" {
            let old_name = segments[1].ident.to_string();
            segments[1].ident = Ident::new(&format!("{}_gen", old_name), segments[1].ident.span());
        }
    }
}

/// Check if a method has a `#[boxed]` attribute
fn has_boxed_attr(method: &syn::ImplItemFn) -> bool {
    method.attrs.iter().any(|a| a.path().is_ident("boxed"))
}

/// Remove `#[boxed]` attributes from a method
fn strip_boxed_attr(method: &mut syn::ImplItemFn) {
    method.attrs.retain(|a| !a.path().is_ident("boxed"));
}

#[proc_macro_attribute]
pub fn convert_to_sync(attr: TokenStream, input: TokenStream) -> TokenStream {
    let args = parse_macro_input!(attr as ConvertArgs);
    let item_impl = parse_macro_input!(input as ItemImpl);

    let mut sync_impl = item_impl.clone();
    let mut gen_impl = item_impl;

    // Sync: strip async, strip .await, replace source type → target type
    for item in &mut sync_impl.items {
        if let ImplItem::Fn(method) = item {
            strip_boxed_attr(method);
            method.sig.asyncness = None;
            StripAwait.visit_block_mut(&mut method.block);
        }
    }
    let mut replacer = ReplaceCtxType {
        source: args.source.to_string(),
        target: args.target,
    };
    replacer.visit_item_impl_mut(&mut sync_impl);

    // Gen: rename functions to *_gen, rename Self:: calls
    for item in &mut gen_impl.items {
        if let ImplItem::Fn(method) = item {
            let boxed = has_boxed_attr(method);
            strip_boxed_attr(method);

            let old_name = method.sig.ident.to_string();
            method.sig.ident = Ident::new(&format!("{}_gen", old_name), Span::call_site());
            RenameSelfs.visit_block_mut(&mut method.block);

            if boxed {
                // Break recursive future sizing: return Pin<Box<dyn Future>> instead of async fn.
                method.sig.asyncness = None;

                // Use the first named lifetime from generics for the dyn Future bound
                let lifetime = method
                    .sig
                    .generics
                    .params
                    .iter()
                    .find_map(|p| {
                        if let syn::GenericParam::Lifetime(lt) = p {
                            Some(lt.lifetime.clone())
                        } else {
                            None
                        }
                    })
                    .expect("#[boxed] methods must declare a named lifetime parameter");

                let body = method.block.clone();

                if let ReturnType::Type(arrow, ret_ty) = &method.sig.output {
                    method.sig.output = ReturnType::Type(
                        *arrow,
                        Box::new(
                            parse_quote!(std::pin::Pin<Box<dyn std::future::Future<Output = #ret_ty> + #lifetime>>),
                        ),
                    );
                }

                method.block = parse_quote!({
                    Box::pin(async move #body)
                });
            }
        }
    }

    let expanded = quote! {
        #sync_impl
        #gen_impl
    };

    expanded.into()
}
