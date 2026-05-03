# @atcharajs/core

## 0.2.0

### Minor Changes

- [#2](https://github.com/jankdc/atchara/pull/2) [`5e58c3e`](https://github.com/jankdc/atchara/commit/5e58c3ee0ca702e4e11acb0dcadf082c6e3e87a4) Thanks [@jankdc](https://github.com/jankdc)! - improve the way parseEach is closing resources.

  it was a bit awkward retaining the deferred API references
  after the iterator has finished the consumption of the JSON
  because it closes the session, hence any retrieval thereafter
  seizes to work. it's better to let the user explicitly close
  the session themselves, in an ergonomic way since they know
  their own use case best.
