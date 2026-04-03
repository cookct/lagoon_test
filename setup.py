#!/usr/bin/env python3
"""
Lagoon setup script — run once after cloning to install dependencies and configure API keys.
Usage:
    python setup.py           # full setup (creates ./venv)
    python setup.py --no-venv # skip venv, install into current environment
"""

import sys
import os
import subprocess
import json
import shutil
import argparse

REQUIRED_PYTHON = (3, 10)
VENV_DIR = "venv"
REQUIREMENTS = "requirements.txt"
CONFIG_EXAMPLE = "app_config.json.example"
CONFIG_FILE = "app_config.json"


def fail(msg):
    print(f"\n[ERROR] {msg}", file=sys.stderr)
    sys.exit(1)


def check_python_version():
    v = sys.version_info[:2]
    if v < REQUIRED_PYTHON:
        fail(
            f"Python {REQUIRED_PYTHON[0]}.{REQUIRED_PYTHON[1]}+ is required. "
            f"You are running Python {v[0]}.{v[1]}.\n"
            f"Download the latest Python from https://www.python.org/downloads/"
        )
    print(f"  Python {v[0]}.{v[1]} — OK")


def create_venv():
    if os.path.isdir(VENV_DIR):
        print(f"  Virtual environment already exists at ./{VENV_DIR} — skipping creation")
        return
    print(f"  Creating virtual environment at ./{VENV_DIR} ...")
    result = subprocess.run([sys.executable, "-m", "venv", VENV_DIR])
    if result.returncode != 0:
        fail("Failed to create virtual environment.")
    print(f"  Virtual environment created.")


def get_pip_executable(use_venv):
    if not use_venv:
        return [sys.executable, "-m", "pip"]
    if sys.platform == "win32":
        pip = os.path.join(VENV_DIR, "Scripts", "pip.exe")
    else:
        pip = os.path.join(VENV_DIR, "bin", "pip")
    if not os.path.isfile(pip):
        fail(f"pip not found in venv at {pip}. Try removing ./{VENV_DIR} and re-running.")
    return [pip]


def install_dependencies(pip_cmd):
    if not os.path.isfile(REQUIREMENTS):
        fail(f"{REQUIREMENTS} not found. Are you running setup.py from the Lagoon directory?")
    print(f"  Installing dependencies from {REQUIREMENTS} ...")
    result = subprocess.run(pip_cmd + ["install", "-r", REQUIREMENTS])
    if result.returncode != 0:
        fail("Dependency installation failed. Check the output above for details.")
    print("  Dependencies installed.")


def setup_config():
    existing = os.path.isfile(CONFIG_FILE)

    if not existing:
        if not os.path.isfile(CONFIG_EXAMPLE):
            fail(f"{CONFIG_EXAMPLE} not found. Your clone may be incomplete.")
        shutil.copy(CONFIG_EXAMPLE, CONFIG_FILE)
        print(f"  Created {CONFIG_FILE} from template.")
        config = {}
    else:
        print(f"  {CONFIG_FILE} already exists.")
        with open(CONFIG_FILE) as f:
            try:
                config = json.load(f)
            except json.JSONDecodeError:
                config = {}

    # --- Venice key (optional) ---
    current_venice = config.get("venice_api_key", "")
    placeholder = "your-venice-api-key-here"
    has_valid_venice = current_venice and current_venice != placeholder

    if has_valid_venice:
        update = input(
            f"\n  Venice API key is already set. Update it? [y/N] "
        ).strip().lower()
        if update != "y":
            print("  Keeping existing Venice API key.")
        else:
            has_valid_venice = False

    if not has_valid_venice:
        print()
        print("  Venice API key is optional. Get yours at https://venice.ai/")
        key = input("  Enter Venice API key (or press Enter to skip): ").strip()
        if key:
            config["venice_api_key"] = key
        else:
            print("  Skipping Venice API key.")

    # --- Together.ai key (optional) ---
    current_together = config.get("together_api_key", "")
    placeholder_together = "your-together-api-key-here"
    has_valid_together = current_together and current_together != placeholder_together

    if has_valid_together:
        update = input(
            f"\n  Together.ai API key is already set. Update it? [y/N] "
        ).strip().lower()
        if update == "y":
            has_valid_together = False

    if not has_valid_together:
        print()
        print("  Together.ai API key is optional. Get yours at https://www.together.ai/")
        key = input("  Enter Together.ai API key (or press Enter to skip): ").strip()
        if key:
            config["together_api_key"] = key
        else:
            print("  Skipping Together.ai API key.")

    # --- Google key (optional) ---
    current_google = config.get("google_api_key", "")
    placeholder_google = "your-google-api-key-here"
    has_valid_google = current_google and current_google != placeholder_google

    if has_valid_google:
        update = input(
            f"\n  Google API key is already set. Update it? [y/N] "
        ).strip().lower()
        if update == "y":
            has_valid_google = False

    if not has_valid_google:
        print()
        print("  Google API key is optional.")
        key = input("  Enter Google API key (or press Enter to skip): ").strip()
        if key:
            config["google_api_key"] = key
        else:
            print("  Skipping Google API key.")

    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=4)
    print(f"\n  {CONFIG_FILE} saved.")


def offer_certs():
    print()
    answer = input(
        "  Enable HTTPS for mobile microphone access? (requires generate_certs.py) [y/N] "
    ).strip().lower()
    if answer != "y":
        return
    if not os.path.isfile("generate_certs.py"):
        print("  generate_certs.py not found — skipping. You can run it manually later.")
        return
    result = subprocess.run([sys.executable, "generate_certs.py"])
    if result.returncode != 0:
        print("  Certificate generation failed. You can run generate_certs.py manually later.")
    else:
        print("  HTTPS certificates generated.")


def main():
    parser = argparse.ArgumentParser(description="Lagoon setup script")
    parser.add_argument(
        "--no-venv",
        action="store_true",
        help="Skip virtual environment creation — install into current Python environment",
    )
    args = parser.parse_args()
    use_venv = not args.no_venv

    print("\n=== Lagoon Setup ===\n")

    print("[1/4] Checking Python version...")
    check_python_version()

    if use_venv:
        print("\n[2/4] Setting up virtual environment...")
        create_venv()
    else:
        print("\n[2/4] Skipping virtual environment (--no-venv).")

    print("\n[3/4] Installing dependencies...")
    pip_cmd = get_pip_executable(use_venv)
    install_dependencies(pip_cmd)

    print("\n[4/4] Configuring API keys...")
    setup_config()

    offer_certs()

    print()
    print("=" * 36)
    print("  Setup complete.")
    if use_venv:
        if sys.platform == "win32":
            activate = rf"  Activate venv:  {VENV_DIR}\Scripts\activate"
        else:
            activate = f"  Activate venv:  source {VENV_DIR}/bin/activate"
        print(activate)
    print("  Run Lagoon:     python app.py")
    print("=" * 36)
    print()


if __name__ == "__main__":
    main()
