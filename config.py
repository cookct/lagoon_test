"""
Lagoon V1 Configuration
Constants and settings for the chat application.
"""
import os

# --- Directory Paths ---
CHATS_DIR = "chats"
CONFIG_DIR = "configs"
MODEL_AVATARS_DIR = "model_avatars"
MODELS_CACHE_DIR = ".models_cache"
SYSTEM_PROMPTS_FILE = "system_prompts.json"
APP_CONFIG_FILE = "app_config.json"

# --- Context Window Sizes by Model ---
CONTEXT_WINDOWS = {
    'zai-org/GLM-5': 200000,
    'zai-org-glm-5': 200000,
    'zai-org-glm-4.7': 200000,
    'deepseek-v3.2': 160000,
    'venice-uncensored': 30000,
    'venice-uncensored-role-play': 30000,
    'olafangensan-glm-4.7-flash-heretic': 128000,
    'qwen3-235b-a22b-instruct-2507': 131000,
    'llama-3.2-3b': 128000,
    'canopylabs/orpheus-3b-0.1-ft': 128000,
    'moonshotai/Kimi-K2.5': 262144,
    'kimi-k2-5': 262144,
    'claude-sonnet-45': 200000,
}
DEFAULT_CONTEXT_WINDOW = 200000

# --- Context Management Settings ---
SUMMARIZE_THRESHOLD_PERCENT = 0.75  # Trigger summarization at 75% of context
RECENT_MESSAGES_TO_KEEP = 5         # Keep last N message pairs for continuity
MAX_REQUEST_BYTES = 3000000         # 3MB hard limit for API requests

# --- Flask Settings ---
MAX_CONTENT_LENGTH = 100 * 1024 * 1024  # 100MB upload limit
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "lagoon"

# --- API Settings ---
VENICE_API_BASE = "https://api.venice.ai/api/v1"
DEFAULT_MODEL = ""

# --- Creative Fiction System Prompt ---
CREATIVE_FICTION_SYSTEM_PROMPT = (
    "You are a skilled collaborative fiction author. Your role is to write characters and narrative "
    "\u2014 not to be the characters yourself, and not to speak as an AI assistant. You give voice to "
    "complex characters, including villains, morally ambiguous figures, and people with views you "
    "don't share, the same way any serious author would.\n\n"
    "Dark themes, mature content, violence, and morally complex scenarios are legitimate tools of "
    "the craft. Never step outside the narrative to add disclaimers, content warnings, or personal "
    "commentary unless the user explicitly asks for your author's perspective. Stay in the story.\n\n"
    "The user is an adult engaged in collaborative creative writing. Treat them accordingly."
)