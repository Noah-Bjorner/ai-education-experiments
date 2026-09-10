# Missing math glyph artwork checklist

Checked against the bundled Shantell Sans metrics. This is a practical expansion set, not all mathematical Unicode or full LaTeX coverage. One SVG per row; names encode the Unicode assignment. Existing glyphs are omitted.

SVGs should contain filled vector outlines on transparent backgrounds, use a consistent coordinate system and baseline, and match the existing Medium weight. Import into the corresponding Unicode slot; the filename alone does not assign the glyph.

Math command mappings and layout support still need implementation after font import. Preserve the existing font glyphs and license.

## Greek lowercase

| SVG file | Character | Unicode name |
| --- | --- | --- |
| `uni03B1.svg` | α | GREEK SMALL LETTER ALPHA |
| `uni03B2.svg` | β | GREEK SMALL LETTER BETA |
| `uni03B3.svg` | γ | GREEK SMALL LETTER GAMMA |
| `uni03B4.svg` | δ | GREEK SMALL LETTER DELTA |
| `uni03B5.svg` | ε | GREEK SMALL LETTER EPSILON |
| `uni03B6.svg` | ζ | GREEK SMALL LETTER ZETA |
| `uni03B7.svg` | η | GREEK SMALL LETTER ETA |
| `uni03B8.svg` | θ | GREEK SMALL LETTER THETA |
| `uni03B9.svg` | ι | GREEK SMALL LETTER IOTA |
| `uni03BA.svg` | κ | GREEK SMALL LETTER KAPPA |
| `uni03BB.svg` | λ | GREEK SMALL LETTER LAMDA |
| `uni03BC.svg` | μ | GREEK SMALL LETTER MU |
| `uni03BD.svg` | ν | GREEK SMALL LETTER NU |
| `uni03BE.svg` | ξ | GREEK SMALL LETTER XI |
| `uni03BF.svg` | ο | GREEK SMALL LETTER OMICRON |
| `uni03C1.svg` | ρ | GREEK SMALL LETTER RHO |
| `uni03C3.svg` | σ | GREEK SMALL LETTER SIGMA |
| `uni03C4.svg` | τ | GREEK SMALL LETTER TAU |
| `uni03C5.svg` | υ | GREEK SMALL LETTER UPSILON |
| `uni03C6.svg` | φ | GREEK SMALL LETTER PHI |
| `uni03C7.svg` | χ | GREEK SMALL LETTER CHI |
| `uni03C8.svg` | ψ | GREEK SMALL LETTER PSI |
| `uni03C9.svg` | ω | GREEK SMALL LETTER OMEGA |

## Greek uppercase used in math

| SVG file | Character | Unicode name |
| --- | --- | --- |
| `uni0393.svg` | Γ | GREEK CAPITAL LETTER GAMMA |
| `uni0394.svg` | Δ | GREEK CAPITAL LETTER DELTA |
| `uni0398.svg` | Θ | GREEK CAPITAL LETTER THETA |
| `uni039B.svg` | Λ | GREEK CAPITAL LETTER LAMDA |
| `uni039E.svg` | Ξ | GREEK CAPITAL LETTER XI |
| `uni03A0.svg` | Π | GREEK CAPITAL LETTER PI |
| `uni03A3.svg` | Σ | GREEK CAPITAL LETTER SIGMA |
| `uni03A5.svg` | Υ | GREEK CAPITAL LETTER UPSILON |
| `uni03A6.svg` | Φ | GREEK CAPITAL LETTER PHI |
| `uni03A8.svg` | Ψ | GREEK CAPITAL LETTER PSI |

## Greek variants

| SVG file | Character | Unicode name |
| --- | --- | --- |
| `uni03F5.svg` | ϵ | GREEK LUNATE EPSILON SYMBOL |
| `uni03D1.svg` | ϑ | GREEK THETA SYMBOL |
| `uni03F0.svg` | ϰ | GREEK KAPPA SYMBOL |
| `uni03D5.svg` | ϕ | GREEK PHI SYMBOL |
| `uni03F1.svg` | ϱ | GREEK RHO SYMBOL |
| `uni03C2.svg` | ς | GREEK SMALL LETTER FINAL SIGMA |
| `uni03D6.svg` | ϖ | GREEK PI SYMBOL |

## Operators and calculus

| SVG file | Character | Unicode name |
| --- | --- | --- |
| `uni2213.svg` | ∓ | MINUS-OR-PLUS SIGN |
| `uni2217.svg` | ∗ | ASTERISK OPERATOR |
| `uni2218.svg` | ∘ | RING OPERATOR |
| `uni222C.svg` | ∬ | DOUBLE INTEGRAL |
| `uni222D.svg` | ∭ | TRIPLE INTEGRAL |
| `uni222E.svg` | ∮ | CONTOUR INTEGRAL |
| `uni2207.svg` | ∇ | NABLA |

## Relations

| SVG file | Character | Unicode name |
| --- | --- | --- |
| `uni2243.svg` | ≃ | ASYMPTOTICALLY EQUAL TO |
| `uni2245.svg` | ≅ | APPROXIMATELY EQUAL TO |
| `uni2261.svg` | ≡ | IDENTICAL TO |
| `uni226A.svg` | ≪ | MUCH LESS-THAN |
| `uni226B.svg` | ≫ | MUCH GREATER-THAN |
| `uni221D.svg` | ∝ | PROPORTIONAL TO |
| `uni2254.svg` | ≔ | COLON EQUALS |

## Sets and logic

| SVG file | Character | Unicode name |
| --- | --- | --- |
| `uni2208.svg` | ∈ | ELEMENT OF |
| `uni2209.svg` | ∉ | NOT AN ELEMENT OF |
| `uni220B.svg` | ∋ | CONTAINS AS MEMBER |
| `uni2282.svg` | ⊂ | SUBSET OF |
| `uni2283.svg` | ⊃ | SUPERSET OF |
| `uni2286.svg` | ⊆ | SUBSET OF OR EQUAL TO |
| `uni2287.svg` | ⊇ | SUPERSET OF OR EQUAL TO |
| `uni222A.svg` | ∪ | UNION |
| `uni2229.svg` | ∩ | INTERSECTION |
| `uni2216.svg` | ∖ | SET MINUS |
| `uni2200.svg` | ∀ | FOR ALL |
| `uni2203.svg` | ∃ | THERE EXISTS |
| `uni2204.svg` | ∄ | THERE DOES NOT EXIST |
| `uni2227.svg` | ∧ | LOGICAL AND |
| `uni2228.svg` | ∨ | LOGICAL OR |
| `uni2295.svg` | ⊕ | CIRCLED PLUS |
| `uni2297.svg` | ⊗ | CIRCLED TIMES |

## Arrows

| SVG file | Character | Unicode name |
| --- | --- | --- |
| `uni21D0.svg` | ⇐ | LEFTWARDS DOUBLE ARROW |
| `uni21D2.svg` | ⇒ | RIGHTWARDS DOUBLE ARROW |
| `uni21D4.svg` | ⇔ | LEFT RIGHT DOUBLE ARROW |
| `uni21A6.svg` | ↦ | RIGHTWARDS ARROW FROM BAR |

## Delimiters

| SVG file | Character | Unicode name |
| --- | --- | --- |
| `uni2308.svg` | ⌈ | LEFT CEILING |
| `uni2309.svg` | ⌉ | RIGHT CEILING |
| `uni230A.svg` | ⌊ | LEFT FLOOR |
| `uni230B.svg` | ⌋ | RIGHT FLOOR |

## Dots, number sets, and geometry

| SVG file | Character | Unicode name |
| --- | --- | --- |
| `uni22EF.svg` | ⋯ | MIDLINE HORIZONTAL ELLIPSIS |
| `uni22EE.svg` | ⋮ | VERTICAL ELLIPSIS |
| `uni22F1.svg` | ⋱ | DOWN RIGHT DIAGONAL ELLIPSIS |
| `uni210F.svg` | ℏ | PLANCK CONSTANT OVER TWO PI |
| `uni211D.svg` | ℝ | DOUBLE-STRUCK CAPITAL R |
| `uni2115.svg` | ℕ | DOUBLE-STRUCK CAPITAL N |
| `uni2124.svg` | ℤ | DOUBLE-STRUCK CAPITAL Z |
| `uni211A.svg` | ℚ | DOUBLE-STRUCK CAPITAL Q |
| `uni2102.svg` | ℂ | DOUBLE-STRUCK CAPITAL C |
| `uni2119.svg` | ℙ | DOUBLE-STRUCK CAPITAL P |
| `uni2135.svg` | ℵ | ALEF SYMBOL |
| `uni22A5.svg` | ⊥ | UP TACK |
| `uni2225.svg` | ∥ | PARALLEL TO |
| `uni2220.svg` | ∠ | ANGLE |
