#!/usr/bin/env python3
"""Convert THE_FIRST_ONES_LORE.md to styled HTML."""

import re

def md_to_html(input_file, output_file):
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    html_lines = []
    in_table = False
    in_code_block = False
    in_blockquote = False
    blockquote_lines = []
    
    for line in lines:
        # Code blocks
        if line.startswith('```'):
            if in_code_block:
                html_lines.append('</code></pre>')
                in_code_block = False
            else:
                html_lines.append('<pre><code>')
                in_code_block = True
            continue
        
        if in_code_block:
            html_lines.append(line)
            continue
        
        # Tables
        if '|' in line and not line.startswith('#'):
            cells = [c.strip() for c in line.split('|') if c.strip()]
            if cells:
                # Skip separator rows
                if all(c.replace('-', '').replace(':', '') == '' for c in cells):
                    continue
                
                if not in_table:
                    html_lines.append('<table>')
                    in_table = True
                    # First row is header
                    html_lines.append('<thead><tr>' + ''.join(f'<th>{c}</th>' for c in cells) + '</tr></thead><tbody>')
                else:
                    html_lines.append('<tr>' + ''.join(f'<td>{c}</td>' for c in cells) + '</tr>')
                continue
        else:
            if in_table:
                html_lines.append('</tbody></table>')
                in_table = False
        
        # Blockquotes
        if line.startswith('> '):
            if not in_blockquote:
                in_blockquote = True
                blockquote_lines = []
            blockquote_lines.append(line[2:])
            continue
        else:
            if in_blockquote:
                bq_content = '<br>\n'.join(blockquote_lines)
                html_lines.append(f'<blockquote>{bq_content}</blockquote>')
                in_blockquote = False
                blockquote_lines = []
        
        # Horizontal rule
        if line.strip() == '---':
            html_lines.append('<hr>')
            continue
        
        # Headers
        if line.startswith('# '):
            html_lines.append(f'<h1>{line[2:]}</h1>')
        elif line.startswith('## '):
            html_lines.append(f'<h2 id="{make_id(line[3:])}">{line[3:]}</h2>')
        elif line.startswith('### '):
            html_lines.append(f'<h3>{line[4:]}</h3>')
        elif line.startswith('#### '):
            html_lines.append(f'<h4>{line[5:]}</h4>')
        elif line.startswith('##### '):
            html_lines.append(f'<h5>{line[6:]}</h5>')
        # Regular paragraphs
        elif line.strip():
            processed = process_inline(line)
            html_lines.append(f'<p>{processed}</p>')
        else:
            html_lines.append('')
    
    # Close any open tags
    if in_table:
        html_lines.append('</tbody></table>')
    if in_code_block:
        html_lines.append('</code></pre>')
    if in_blockquote:
        bq_content = '<br>\n'.join(blockquote_lines)
        html_lines.append(f'<blockquote>{bq_content}</blockquote>')
    
    html_content = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>THE FIRST ONES — Worldbuilding Bible</title>
<style>
* {{
    box-sizing: border-box;
}}
body {{
    font-family: 'Crimson Text', Georgia, 'Times New Roman', serif;
    line-height: 1.8;
    max-width: 900px;
    margin: 0 auto;
    padding: 40px 20px;
    background-color: #faf9f7;
    color: #2c2c2c;
}}
h1 {{
    font-size: 2.5em;
    color: #1a1a1a;
    border-bottom: 3px solid #8b4513;
    padding-bottom: 15px;
    margin-bottom: 10px;
}}
h2 {{
    font-size: 1.8em;
    color: #3a3a3a;
    margin-top: 50px;
    border-bottom: 1px solid #ccc;
    padding-bottom: 10px;
}}
h3 {{
    font-size: 1.4em;
    color: #4a4a4a;
    margin-top: 35px;
}}
h4 {{
    font-size: 1.2em;
    color: #5a5a5a;
    margin-top: 25px;
}}
h5 {{
    font-size: 1.1em;
    color: #6a6a6a;
    margin-top: 20px;
}}
p {{
    margin-bottom: 1em;
    text-align: justify;
}}
blockquote {{
    background: linear-gradient(135deg, #f5f0e8 0%, #ebe5d9 100%);
    border-left: 4px solid #8b4513;
    padding: 20px 25px;
    margin: 25px 0;
    font-style: italic;
    color: #4a4a4a;
}}
blockquote em {{
    font-style: normal;
}}
table {{
    width: 100%;
    border-collapse: collapse;
    margin: 25px 0;
    background: white;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}}
thead {{
    background: linear-gradient(135deg, #5a4a3a 0%, #3a3020 100%);
    color: white;
}}
th {{
    padding: 15px;
    text-align: left;
    font-weight: 600;
}}
td {{
    padding: 12px 15px;
    border-bottom: 1px solid #e0d8c8;
}}
tr:hover {{
    background-color: #f9f6f0;
}}
hr {{
    border: none;
    height: 2px;
    background: linear-gradient(90deg, transparent, #8b4513, transparent);
    margin: 40px 0;
}}
pre {{
    background: #2d2d2d;
    color: #f8f8f2;
    padding: 20px;
    border-radius: 8px;
    overflow-x: auto;
    font-family: 'Fira Code', 'Consolas', monospace;
    font-size: 0.9em;
    line-height: 1.5;
}}
code {{
    font-family: 'Fira Code', 'Consolas', monospace;
    background: #f0ebe0;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.9em;
}}
pre code {{
    background: none;
    padding: 0;
}}
strong {{
    color: #1a1a1a;
    font-weight: 700;
}}
em {{
    color: #4a4a4a;
}}
a {{
    color: #8b4513;
    text-decoration: none;
    border-bottom: 1px dotted #8b4513;
}}
a:hover {{
    color: #a0522d;
    border-bottom: 1px solid #a0522d;
}}
.toc {{
    background: #f5f0e8;
    border: 1px solid #d4c8b0;
    padding: 25px 30px;
    margin: 30px 0;
    border-radius: 8px;
}}
.toc h2 {{
    margin-top: 0;
    border-bottom: none;
    color: #3a3020;
}}
.toc ol {{
    padding-left: 25px;
}}
.toc li {{
    margin: 8px 0;
}}
.toc a {{
    color: #5a4a3a;
}}
.preface {{
    background: linear-gradient(135deg, #f8f4ec 0%, #f0ebe0 100%);
    border-left: 5px solid #8b4513;
    padding: 30px;
    margin: 40px 0;
    font-size: 1.05em;
}}
.preface h2 {{
    margin-top: 0;
    border-bottom: none;
}}
@media print {{
    body {{
        background: white;
        padding: 20px;
    }}
    hr {{
        page-break-after: always;
    }}
}}
</style>
<link href="https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet">
</head>
<body>
{chr(10).join(html_lines)}
</body>
</html>'''
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    print(f"Created {output_file}")

def process_inline(text):
    """Process inline markdown formatting."""
    # Bold
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    # Italic
    text = re.sub(r'\*(.+?)\*', r'<em>\1</em>', text)
    # Inline code
    text = re.sub(r'`(.+?)`', r'<code>\1</code>', text)
    # Links
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', text)
    return text

def make_id(text):
    """Create an HTML id from header text."""
    # Remove markdown formatting
    text = re.sub(r'[#*`]', '', text)
    # Lowercase and replace spaces/special chars
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s-]+', '-', text)
    return text

if __name__ == '__main__':
    md_to_html('THE_FIRST_ONES_LORE.md', 'THE_FIRST_ONES_LORE.html')