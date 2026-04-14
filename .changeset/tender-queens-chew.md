---
'atchara': minor
'@atcharajs/core': minor
---

improve the way parseEach is closing resources.

it was a bit awkward retaining the deferred API references
after the iterator has finished the consumption of the JSON
because it closes the session, hence any retrieval thereafter
seizes to work. it's better to let the user explicitly close
the session themselves, in an ergonomic way since they know
their own use case best.
