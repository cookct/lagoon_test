
import json
import re
from datetime import datetime

class ExportService:
    @staticmethod
    def compile_chat(messages, options):
        """
        Compiles a chat history into a formatted document string.
        
        options:
            - format: 'html' | 'markdown' | 'text'
            - include_user: bool (Include user prompts?)
            - include_system: bool (Include system instructions?)
            - clean_ooc: bool (Remove (( ... )) wrappers?)
            - title: str
        """
        fmt = options.get('format', 'text')
        include_user = options.get('include_user', True)
        include_system = options.get('include_system', False)
        clean_ooc = options.get('clean_ooc', True)
        title = options.get('title', 'Exported Chat')
        
        output_lines = []
        
        if fmt == 'markdown':
            output_lines.append(f"# {title}\n")
            output_lines.append(f"*Exported on {datetime.now().strftime('%Y-%m-%d %H:%M')}*\n")
            output_lines.append("---\n")
        elif fmt == 'html':
            output_lines.append(f"<h1>{title}</h1>")
            output_lines.append(f"<p><em>Exported on {datetime.now().strftime('%Y-%m-%d %H:%M')}</em></p>")
            output_lines.append("<hr>")
        else:
            output_lines.append(f"{title.upper()}")
            output_lines.append(f"Exported on {datetime.now().strftime('%Y-%m-%d %H:%M')}")
            output_lines.append("=" * 40 + "\n")

        for msg in messages:
            role = msg.get('role')
            content = msg.get('content', '')
            
            # Filtering
            if role == 'system' and not include_system:
                continue
            if role == 'user' and not include_user:
                continue
            
            # Cleaning OOC
            if clean_ooc and role == 'user':
                # Remove (( ... )) patterns at start of line
                content = re.sub(r'^\(\((.*?)\)\)\s*', '', content, flags=re.DOTALL)
                # Remove inline (( ... ))
                content = re.sub(r'\(\((.*?)\)\)', '', content, flags=re.DOTALL)
                content = content.strip()
                if not content: continue # Skip if only OOC

            # Formatting
            if fmt == 'markdown':
                if role == 'user':
                    output_lines.append(f"**User:** {content}\n")
                elif role == 'assistant':
                    output_lines.append(f"{content}\n") # Assistant text is usually narrative
                elif role == 'system':
                    output_lines.append(f"> *System: {content}*\n")
                
                output_lines.append("---\n")
                
            elif fmt == 'html':
                if role == 'user':
                    output_lines.append(f"<div class='user-msg'><strong>User:</strong> {content.replace(chr(10), '<br>')}")
                elif role == 'assistant':
                    # Convert markdown-ish italics to HTML for basic formatting
                    formatted = content.replace('\n', '<br>')
                    formatted = re.sub(r'\*(.*?)\*', r'<em>\1</em>', formatted)
                    output_lines.append(f"<div class='assistant-msg'>{formatted}")
                elif role == 'system':
                    output_lines.append(f"<div class='system-msg'><em>System: {content}</em>")
                
                output_lines.append("<hr>")
                
            else: # Text
                prefix = f"[{role.upper()}]: "
                output_lines.append(f"{prefix}{content}")
                output_lines.append("-" * 20)

        if fmt == 'html':
            # Wrap in basic template
            body = "\n".join(output_lines)
            return f"""
            <!DOCTYPE html>
            <html>
            <head>
                <title>{title}</title>
                <style>
                    body {{ font-family: 'Georgia', serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 40px; color: #333; }}
                    h1 {{ text-align: center; color: #111; }}
                    .user-msg {{ color: #555; margin-bottom: 20px; font-weight: bold; }}
                    .assistant-msg {{ margin-bottom: 20px; }}
                    .system-msg {{ color: #888; font-size: 0.9em; margin-bottom: 10px; }}
                    hr {{ border: 0; border-top: 1px solid #ddd; margin: 30px 0; }}
                </style>
            </head>
            <body>
                {body}
            </body>
            </html>
            """
            
        return "\n".join(output_lines)
