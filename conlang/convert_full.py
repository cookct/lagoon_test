import re

# Read the full text
with open('sample.txt', 'r', encoding='utf-8') as f:
    content = f.read()

# Split into chapters
chapters = re.split(r'^# (\w+)$', content, flags=re.MULTILINE)

# Build HTML
html_parts = []
html_parts.append('''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>THE UNSETTLED WORLD - Chapters 1-7</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Georgia', 'Times New Roman', serif;
            line-height: 1.8;
            color: #e0e0e0;
            background-color: #1a1a2e;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
        }
        h1 {
            text-align: center;
            font-size: 2.5em;
            margin-bottom: 10px;
            color: #c9a959;
            letter-spacing: 3px;
        }
        .subtitle {
            text-align: center;
            font-style: italic;
            color: #888;
            margin-bottom: 10px;
            font-size: 1.1em;
        }
        .author {
            text-align: center;
            color: #c9a959;
            font-size: 1.2em;
            margin-bottom: 50px;
            letter-spacing: 1px;
        }
        .chapter {
            margin-bottom: 60px;
        }
        .chapter-title {
            font-size: 1.8em;
            color: #c9a959;
            text-align: center;
            margin-bottom: 30px;
            letter-spacing: 2px;
            border-bottom: 1px solid #3a3a5e;
            padding-bottom: 15px;
        }
        p {
            margin-bottom: 1.5em;
            text-indent: 2em;
            text-align: justify;
        }
        p:first-of-type {
            text-indent: 0;
        }
        .scene-break {
            text-align: center;
            margin: 40px 0;
            color: #c9a959;
            font-size: 1.2em;
            letter-spacing: 5px;
        }
        hr.divider {
            border: none;
            height: 1px;
            background: linear-gradient(to right, transparent, #3a3a5e, transparent);
            margin: 50px 0;
        }
        @media (max-width: 600px) {
            body {
                padding: 20px 15px;
            }
            h1 {
                font-size: 1.8em;
            }
            .chapter-title {
                font-size: 1.4em;
            }
        }
    </style>
</head>
<body>
    <h1>THE UNSETTLED WORLD</h1>
    <p class="subtitle">Chapters One through Seven</p>
    <p class="author">by A.H. Cook</p>
    
    <hr class="divider">
''')

def process_text(text):
    """Convert markdown-style formatting to HTML"""
    # Handle italics
    text = re.sub(r'\*([^*]+)\*', r'<em>\1</em>', text)
    
    # Split into paragraphs (double newlines or scene breaks)
    paragraphs = re.split(r'\n\n+', text)
    
    result = []
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        
        # Check for scene break
        if para == '---':
            result.append('<div class="scene-break">* * *</div>')
        else:
            # Clean up single newlines within paragraphs
            para = para.replace('\n', ' ')
            # Escape any remaining HTML
            para = para.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            # Restore our em tags
            para = para.replace('&lt;em&gt;', '<em>').replace('&lt;/em&gt;', '</em>')
            result.append(f'<p>{para}</p>')
    
    return '\n'.join(result)

# Process chapters
# chapters[0] is empty (before first #), then alternating: title, content
i = 1
while i < len(chapters):
    if i < len(chapters) - 1:
        title = chapters[i]
        content = chapters[i + 1]
        
        # Convert title to word form
        title_words = {
            'ONE': 'ONE', 'TWO': 'TWO', 'THREE': 'THREE', 'FOUR': 'FOUR',
            'FIVE': 'FIVE', 'SIX': 'SIX', 'SEVEN': 'SEVEN'
        }
        display_title = title_words.get(title, title)
        
        html_parts.append(f'<div class="chapter">')
        html_parts.append(f'<h2 class="chapter-title">{display_title}</h2>')
        html_parts.append(process_text(content))
        html_parts.append('</div>')
        html_parts.append('<hr class="divider">')
        
        i += 2
    else:
        break

# Add footer
html_parts.append('''
    <footer style="text-align: center; margin-top: 50px; padding-top: 20px; border-top: 1px solid #3a3a5e; color: #666;">
        <p>THE UNSETTLED WORLD</p>
        <p style="font-size: 0.9em;">A novel by A.H. Cook</p>
    </footer>
</body>
</html>
''')

# Write output
with open('chapters_1_7.html', 'w', encoding='utf-8') as f:
    f.write('\n'.join(html_parts))

print("Conversion complete. Output written to chapters_1_7.html")