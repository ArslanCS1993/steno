import json
import os
import sys
import threading
import time

# Optional import: Allows generator and CLI to work even if 'keyboard' is missing
try:
    import keyboard
except ImportError:
    keyboard = None

# Path to the dictionary file in the project folder
DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.json")

# Physical 10-finger mapping: assigns each key (including number row) to its specific finger
FINGER_MAP = {
    "Left Pinky": "1qaz",
    "Left Ring": "2wsx",
    "Left Middle": "3edc",
    "Left Index": "45rfvtg",
    "Left Thumb": "b",
    "Right Thumb": "n",
    "Right Index": "67yhujm",
    "Right Middle": "8ik,",
    "Right Ring": "9ol.",
    "Right Pinky": "0p;/'"
}

# Reverse lookup dictionary: key char -> finger name
KEY_TO_FINGER = {}
for finger, keys in FINGER_MAP.items():
    for k in keys:
        KEY_TO_FINGER[k] = finger

# Set of all valid chordable keys
ALLOWED = set(KEY_TO_FINGER.keys())

# Mirror mappings for alternating/bimanual key ergonomics:
# Tones: Right hand 0, 9, 8, 7 -> Left hand 1, 2, 3, 4
# Pinky letters: ; -> a, / -> z
# Ring letters: l -> s
MIRROR_KEYS = {
    "0": "1", "9": "2", "8": "3", "7": "4",
    ";": "a", "/": "z",
    "l": "s"
}


def canonicalize_chord(chord_str: str) -> str:
    """Canonicalizes mirrored keys (e.g. 7;i -> 4ai, 4lhi -> 4shi)."""
    return "".join(sorted(MIRROR_KEYS.get(k, k) for k in chord_str))


def word_to_chord(word: str):
    """
    Converts a word into a chord using Rule 1: First-come, first-served per finger.
    A finger can only hold one key at a time.
    If the chord has only 1 letter, adds number '1' (or '2') to make it a valid multi-key chord.
    """
    used_fingers = {}
    chord_keys = []
    skipped = []

    for ch in word.lower():
        if ch not in KEY_TO_FINGER:
            skipped.append((ch, "not in finger mapping"))
            continue

        finger = KEY_TO_FINGER[ch]
        # First key to claim this finger wins
        if finger not in used_fingers:
            used_fingers[finger] = ch
            chord_keys.append(ch)
        else:
            prev_key = used_fingers[finger]
            skipped.append((ch, f"conflict with '{prev_key}' on {finger}"))

    # Single-letter rule: add a number key so it requires a physical chord
    if len(chord_keys) <= 1:
        num = "1"
        # If '1' is on the same finger as the letter, pick '2'
        if KEY_TO_FINGER.get(num) in used_fingers:
            num = "2"
        chord_keys.append(num)
        used_fingers[KEY_TO_FINGER[num]] = num

    # Sorted alphabetically so chord order doesn't matter when pressed
    sorted_chord = "".join(sorted(chord_keys))
    return "".join(chord_keys), sorted_chord, used_fingers, skipped


def load_dictionary():
    """Loads chords, roots, and grammar from data.json."""
    if not os.path.exists(DATA_FILE):
        return {}, {}, {}, {}
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        try:
            raw = json.load(f)
            flat_source = raw.get("flat_chords", raw) if isinstance(raw, dict) else {}
            tree_source = raw.get("roots", {}) if isinstance(raw, dict) else {}
            grammar_source = raw.get("grammar", {}) if isinstance(raw, dict) else {}
            rules_source = raw.get("grammar_rules", {}) if isinstance(raw, dict) else {}

            normalized_flat = {}
            for k, v in flat_source.items():
                if isinstance(v, str):
                    normalized_flat["".join(sorted(k))] = v

            return normalized_flat, tree_source, grammar_source, rules_source
        except json.JSONDecodeError:
            print("Error: data.json contains invalid JSON.")
            return {}, {}, {}, {}


def get_word_grammar(word: str, grammar_dict: dict):
    """Retrieves or generates grammar inflection forms for a word."""
    if not word:
        return None
    lower = word.lower().strip()
    if lower in grammar_dict:
        return grammar_dict[lower]
    # Smart regular fallback for regular verbs
    return {
        "pos": "verb",
        "forms": {
            "1": lower + "d" if lower.endswith("e") else lower + "ed",
            "2": lower[:-1] + "ing" if lower.endswith("e") else lower + "ing",
            "3": lower + "es" if lower.endswith(("s", "sh", "ch", "x", "z")) else lower + "s"
        }
    }


def save_word(word: str, custom_chord: str = None):
    """
    Generates a chord for a word, resolves any collisions with numbers,
    and saves to data.json.
    """
    flat_data, tree_data, _, _ = load_dictionary()

    if custom_chord:
        sorted_chord = "".join(sorted(custom_chord.lower()))
        keys_str = custom_chord
        skipped = []
        fingers = {}
    else:
        keys_str, sorted_chord, fingers, skipped = word_to_chord(word)

    if not sorted_chord:
        print(f"Error: Could not generate any chord for '{word}'.")
        return

    # Check for collisions with existing words; resolve by adding number 1, 2, 3...
    existing_word = flat_data.get(sorted_chord)
    if existing_word and existing_word.strip() != word.strip():
        base_chord = sorted_chord
        for n in range(1, 10):
            candidate = "".join(sorted(base_chord + str(n)))
            if candidate not in flat_data or flat_data[candidate].strip() == word.strip():
                print(f"[Collision Resolved] '{base_chord}' is taken by '{existing_word.strip()}'. Using '{candidate}' for '{word}'.")
                sorted_chord = candidate
                break

    # Trailing space enables continuous word-by-word chording
    word_output = word.strip() + " "
    flat_data[sorted_chord] = word_output

    # Read existing file to preserve roots structure if present
    full_payload = {"roots": tree_data, "flat_chords": flat_data}
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(full_payload, f, indent=2, ensure_ascii=False)

    print("\n--- Word Added Successfully ---")
    print(f"Word:        '{word.strip()}'")
    print(f"Keys kept:   '{keys_str}'")
    print(f"Chord:       '{sorted_chord}'")
    print(f"Fingers:     {len(fingers)}/10")
    if skipped:
        print("Skipped:     " + ", ".join([f"{c} ({r})" for c, r in skipped]))
    else:
        print("Skipped:     None (All fingers matched!)")
    print("--------------------------------\n")


def run_steno():
    """Starts the system-wide steno typing listener with zero-latency hook worker."""
    if keyboard is None:
        print("Error: The 'keyboard' library is required to run the listener.")
        print("Please run: pip install keyboard")
        return

    dictionary, roots_tree, grammar_dict, grammar_rules = load_dictionary()
    print("==================================================", flush=True)
    print("   Steno Keyboard Engine Started (Morpheme & Grammar Enabled)", flush=True)
    print(f"   Loaded {len(dictionary)} base chords + {len(roots_tree)} roots + {len(grammar_dict)} grammar forms", flush=True)
    print("   Hold SPACE for normal typing bypass. Press 1-4 after any word for grammar.", flush=True)
    print("   Press Ctrl + C in this terminal to exit.", flush=True)
    print("==================================================", flush=True)

    pressed_keys = set()
    history = set()
    is_writing = False  # Guard flag: prevents simulated keystrokes from self-triggering
    last_action_time = time.time()
    
    # 2-Step Morpheme & Grammar State Machine
    active_root = None
    root_timestamp = 0.0
    last_word = None
    last_word_forms = None
    grammar_timestamp = 0.0

    def send_expansion(keys_to_delete, text_to_type):
        """Types out chord in a separate thread so Windows hook never blocks."""
        nonlocal is_writing
        is_writing = True
        try:
            for _ in keys_to_delete:
                keyboard.send("backspace")
            keyboard.write(text_to_type)
        finally:
            is_writing = False

    def on_key(event):
        nonlocal pressed_keys, history, is_writing, last_action_time, active_root, root_timestamp
        nonlocal last_word, last_word_forms, grammar_timestamp

        try:
            # 1. Ignore simulated typing output created by this script
            if is_writing:
                return

            # 2. Guard against keys with no name (Fn, media/volume keys)
            if not event.name:
                return

            key = event.name.lower()
            now = time.time()

            # 3. Grammar Modifier Tap: Single number (1, 2, 3, 4) right after a word
            if key in ("1", "2", "3", "4") and event.event_type == "down" and not pressed_keys and last_word_forms and (now - grammar_timestamp < 4.0):
                if key in last_word_forms.get("forms", {}):
                    inflected = last_word_forms["forms"][key]
                    pos = last_word_forms.get("pos", "word")
                    prev_len = len(last_word) + 1  # includes trailing space
                    print(f" ✨ [Grammar Morph] '{last_word}' + {key} -> '{inflected}' ({pos})", flush=True)
                    total_backspaces = [key] + ["bs"] * prev_len
                    threading.Thread(
                        target=send_expansion,
                        args=(total_backspaces, inflected + " "),
                        daemon=True
                    ).start()
                    last_word = inflected
                    last_word_forms = None
                    active_root = None
                    return

            # 4. Bypass / Commit mode: If Space is pressed, commit/reset morpheme state so next chord is a separate word
            if key == "space" and event.event_type == "down":
                pressed_keys.clear()
                history.clear()
                last_word = None
                last_word_forms = None
                if active_root:
                    print(f"   --> [Root Committed] '{active_root['lemma']}' committed via Space. Next chord is a separate word.", flush=True)
                    active_root = None
                    # Eat the extra space so the text stays single-spaced
                    threading.Thread(target=lambda: (time.sleep(0.02), keyboard.send("backspace")), daemon=True).start()
                return

            if len(key) > 1:
                return  # Ignore modifier keys (Shift, Ctrl, Alt, etc.)

            # 5. Stuck-key protection: If keys remain held > 1.2s, auto-reset
            if pressed_keys and (now - last_action_time > 1.2):
                pressed_keys.clear()
                history.clear()

            # Timeout active root after 2.5s of inactivity
            if active_root and (now - root_timestamp > 2.5):
                active_root = None

            last_action_time = now

            # 6. Key Down: Record key to active set and chord history
            if event.event_type == "down":
                if key in ALLOWED:
                    pressed_keys.add(key)
                    history.add(key)

            # 7. Key Up: Release key from active set
            elif event.event_type == "up":
                pressed_keys.discard(key)

                # 8. Chord Release: When all keys are released, expand the chord
                if not pressed_keys and history:
                    combo = "".join(sorted(history))
                    keys_to_erase = list(history)
                    has_space_with_chord = keyboard.is_pressed("space")
                    
                    # STEP 2 CHECK: Is there an active root waiting for a morpheme?
                    if active_root and "derivatives" in active_root and combo in active_root["derivatives"]:
                        deriv = active_root["derivatives"][combo]
                        target_word = deriv["word"] + " "
                        prev_root_len = len(active_root["lemma"]) + 1  # includes trailing space
                        print(f" [Morpheme Attached] Root '{active_root['lemma']}' + '{deriv['morpheme']}' -> '{deriv['word']}'", flush=True)
                        
                        # Erase the previous root word and type the derived word
                        total_backspaces = keys_to_erase + ["bs"] * prev_root_len
                        threading.Thread(
                            target=send_expansion,
                            args=(total_backspaces, target_word),
                            daemon=True
                        ).start()
                        active_root = None

                        # Track for grammar inflection
                        last_word = deriv["word"].strip()
                        last_word_forms = get_word_grammar(last_word, grammar_dict)
                        grammar_timestamp = time.time()
                    else:
                        # STEP 1: Standard Chord / Check if this chord is a Root
                        mapped = dictionary.get(combo)
                        resolved_combo = combo
                        if not mapped:
                            canon = canonicalize_chord(combo)
                            if canon in dictionary:
                                mapped = dictionary[canon]
                                resolved_combo = canon

                        if mapped:
                            if resolved_combo != combo:
                                print(f" [Mirrored Chord] '{combo}' (canonical '{resolved_combo}') -> '{mapped.strip()}'", flush=True)
                            else:
                                print(f" [Chord Detected] '{combo}' -> '{mapped.strip()}'", flush=True)
                            threading.Thread(
                                target=send_expansion,
                                args=(keys_to_erase, mapped),
                                daemon=True
                            ).start()

                            # Track for grammar inflection
                            last_word = mapped.strip()
                            last_word_forms = get_word_grammar(last_word, grammar_dict)
                            grammar_timestamp = time.time()

                            # If Space was held WITH the chord, finalize immediately and do not arm root
                            if has_space_with_chord:
                                print(f"   --> [Finalized Word] '{last_word}' committed with Space chord.", flush=True)
                                active_root = None
                            elif combo in roots_tree:
                                active_root = roots_tree[combo]
                                root_timestamp = time.time()
                                print(f"   --> [Root Armed] Waiting for derivational morphemes: {', '.join([d['morpheme'] for d in active_root['derivatives'].values()])}...", flush=True)
                            else:
                                active_root = None
                        else:
                            active_root = None
                            last_word = None
                            last_word_forms = None

                    history.clear()

        except Exception as e:
            # Catch errors to prevent the background listener thread from dying
            print(f"[Listener Error] {e}", flush=True)

    # Hook all keyboard events and wait until interrupted
    keyboard.hook(on_key)
    keyboard.wait()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        cmd = sys.argv[1].lower()
        if cmd in ("--add", "-a") and len(sys.argv) > 2:
            target_word = sys.argv[2]
            save_word(target_word)
        elif cmd in ("--generate", "-g") and len(sys.argv) > 2:
            target_word = sys.argv[2]
            keys_str, sorted_c, fingers, skipped = word_to_chord(target_word)
            print(f"Word:      {target_word}")
            print(f"Keys kept: {keys_str} (sorted: {sorted_c})")
            print(f"Fingers:   {len(fingers)}/10")
            print(f"Skipped:   {skipped if skipped else 'None'}")
        elif cmd in ("--list", "-l"):
            flat_d, tree_d = load_dictionary()
            print(f"Current Base Chords ({len(flat_d)} entries):")
            for chord, word in sorted(flat_d.items()):
                print(f"  {chord:<10} -> {word}")
            print(f"\nMorpheme Roots Tree ({len(tree_d)} roots):")
            for chord, root_data in sorted(tree_d.items()):
                deriv_list = [f"{d['morpheme']}->{d['word']} ({d['chord']})" for d in root_data.get('derivatives', {}).values()]
                print(f"  {chord:<10} [{root_data['lemma'].upper()}] derivatives: {', '.join(deriv_list)}")
        else:
            print("Usage:")
            print("  python main.py                  # Run steno engine")
            print("  python main.py --add <word>     # Generate & save chord to data.json")
            print("  python main.py --generate <word># Preview chord generation without saving")
            print("  python main.py --list           # View all saved chords")
    else:
        run_steno()
