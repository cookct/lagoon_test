import re
import sys

class HiddenTongueTranslator:
    def __init__(self):
        # The 1:1 Character Map
        self.char_to_syl = {
            'a': 'tha', 'b': 'vor', 'c': 'khoz', 'd': 'keth', 'e': '!mi',
            'f': 'kha', 'g': 'zrr', 'h': 'hrr', 'i': 'peth', 'j': 'neth',
            'k': 'vorr', 'l': 'meth', 'm': '!ka', 'n': 'zorr', 'o': "a'o",
            'p': 'azh', 'q': 'li', 'r': 'zor', 's': 'arr', 't': 'mith',
            'u': 'vhor', 'v': 'vha', 'w': 'gul', 'x': 'zar', 'y': 'azr', 'z': 'zul'
        }
        self.syl_to_char = {v: k for k, v in self.char_to_syl.items()}

    def to_cipher(self, text):
        text = text.lower()
        encoded_chars = []
        for char in text:
            if char in self.char_to_syl:
                encoded_chars.append(self.char_to_syl[char])
            elif char == ' ':
                encoded_chars.append("'")
            else:
                encoded_chars.append(char)
        return "-".join(encoded_chars)

    def to_english(self, cipher):
        syllables = cipher.strip().split("-")
        decoded_chars = []
        for syl in syllables:
            if syl in self.syl_to_char:
                decoded_chars.append(self.syl_to_char[syl])
            elif syl == "'":
                decoded_chars.append(" ")
            else:
                decoded_chars.append(syl)
        return "".join(decoded_chars)

def run_interactive():
    translator = HiddenTongueTranslator()
    print("--- Hidden Tongue Translator (V11) ---")
    print("Commands: '1' for English->Cipher, '2' for Cipher->English, 'exit' to quit")
    
    while True:
        choice = input("\nSelect Mode (1/2): ").strip().lower()
        if choice == 'exit':
            break
        elif choice == '1':
            text = input("Enter English: ")
            print(f"Cipher: {translator.to_cipher(text)}")
        elif choice == '2':
            cipher = input("Enter Cipher: ")
            print(f"English: {translator.to_english(cipher)}")
        else:
            print("Invalid choice. Enter 1, 2, or exit.")

if __name__ == "__main__":
    translator = HiddenTongueTranslator()
    
    if len(sys.argv) > 1:
        # Command line mode
        mode = sys.argv[1]
        input_text = " ".join(sys.argv[2:])
        if mode == "--to-cipher":
            print(translator.to_cipher(input_text))
        elif mode == "--to-english":
            print(translator.to_english(input_text))
        else:
            print("Usage: python3 translator.py [--to-cipher | --to-english] \"text\"")
    else:
        # Interactive mode
        run_interactive()
