export const citationInstructions = `Extract only reference entries present verbatim in documentText. Return their actual printed keys and complete referenceText substrings.
Common markers include [1], [1, 2], (Smith, 2023), (Smith et al., 2023), and Smith et al. (2023).
For an unnumbered bibliography use the first author's surname and the printed publication year as the key.
Do not complete truncated references or invent author names, titles, DOIs or years. Do not treat a nearby citation as proof of a claim.`;
