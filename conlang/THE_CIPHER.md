# The Hidden Tongue: Universal 1:1 Cipher

This is a deterministic character-based cipher. Every English letter maps to a unique elven syllable. This ensures 100% round-trip accuracy for *any* English word, including names, technical terms, and slang.

## Part 1: The Character Map

| Letter | Elven Syllable | Letter | Elven Syllable |
| :---: | :--- | :---: | :--- |
| **A** | `tha` | **N** | `zorr` |
| **B** | `vor` | **O** | `a'o` |
| **C** | `khoz` | **P** | `azh` |
| **D** | `keth` | **Q** | `li` |
| **E** | `!mi` | **R** | `zor` |
| **F** | `kha` | **S** | `arr` |
| **G** | `zrr` | **T** | `mith` |
| **H** | `hrr` | **U** | `vhor` |
| **I** | `peth` | **V** | `vha` |
| **J** | `neth` | **W** | `gul` |
| **K** | `vorr` | **X** | `zar` |
| **L** | `meth` | **Y** | `azr` |
| **M** | `!ka` | **Z** | `zul` |

---

## Part 2: Formatting Rules

1.  **Words:** Each letter syllable is separated by a dash (`-`).
    - *Example:* `khoz-tha-mith` (cat)
2.  **Spaces:** Represented by the Glottal Binder (`'`).
3.  **Punctuation:** Standard punctuation (.,?!) is preserved.
4.  **Case:** Case is ignored for the elven output (lowercase by default).

---

## Part 3: LLM Handshake Protocol (Reverse Translation)

**"You are a 1:1 Cipher Decoder. Use the Character Map in Part 1 to translate the elven syllables back into English letters. Join the letters into words. Replace every (') with a space. Maintain punctuation. No creativity. 1:1 only."**

---

## Part 4: Gold Standard Proof

**English:** *"Master wants pie."*

1.  **Master:** `!ka-tha-arr-mith-!mi-zor`
2.  **Wants:** `gul-tha-zorr-mith-arr`
3.  **Pie:** `azh-peth-!mi`

**Conlang Result:**
> `!ka-tha-arr-mith-!mi-zor'gul-tha-zorr-mith-arr'azh-peth-!mi.`

**Back-Translation:**
*"master wants pie."*
