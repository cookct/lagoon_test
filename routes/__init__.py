"""Lagoon V1 Routes"""
from .configs import configs_bp
from .chats import chats_bp
from .system_prompts import system_prompts_bp
from .files import files_bp
from .chat import chat_bp
from .macros import macros_bp
from .models import models_bp
from .anchors import anchors_bp
from .custom_endpoints import custom_endpoints_bp

__all__ = ['configs_bp', 'chats_bp', 'system_prompts_bp', 'files_bp', 'chat_bp', 'macros_bp', 'models_bp', 'anchors_bp', 'custom_endpoints_bp']
