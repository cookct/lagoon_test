#!/usr/bin/env python3
"""Convert THE_FIRST_ONES_LORE.md to PDF using basic Python."""

def md_to_pdf(input_file, output_file):
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Create HTML from markdown manually
    lines = content.split('\n')
    html_lines = []
    in_table = False
    in_code_block = False
    
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
            if not in_table:
                html_lines.append('<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; margin: 10px 0;">')
                in_table = True
            
            cells = [c.strip() for c in line.split('|') if c.strip()]
            if cells and not all(c.replace('-', '').replace('|', '') == '' for c in cells):
                # Check if it's a header separator
                if all(c.replace('-', '').replace(':', '') == '' for c in cells):
                    continue
                tag = 'th' if not any('<td>' in l for l in html_lines[-3:]) else 'td'
                row = '<tr>' + ''.join(f'<{tag}>{c}</{tag}>' for c in cells) + '</tr>'
                html_lines.append(row)
            continue
        else:
            if in_table:
                html_lines.append('</table>')
                in_table = False
        
        # Headers
        if line.startswith('# '):
            html_lines.append(f'<h1>{line[2:]}</h1>')
        elif line.startswith('## '):
            html_lines.append(f'<h2>{line[3:]}</h2>')
        elif line.startswith('### '):
            html_lines.append(f'<h3>{line[4:]}</h3>')
        elif line.startswith('#### '):
            html_lines.append(f'<h4>{line[5:]}</h4>')
        elif line.startswith('##### '):
            html_lines.append(f'<h5>{line[6:]}</h5>')
        # Horizontal rule
        elif line.strip() == '---':
            html_lines.append('<hr>')
        # Blockquote
        elif line.startswith('> '):
            html_lines.append(f'<blockquote>{line[2:]}</blockquote>')
        # Bold and italic
        elif line.strip():
            processed = line
            # Bold
            import re
            processed = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', processed)
            # Italic
            processed = re.sub(r'\*(.+?)\*', r'<em>\1</em>', processed)
            html_lines.append(f'<p>{processed}</p>')
        elif line.strip() == '':
            html_lines.append('')
    
    if in_table:
        html_lines.append('</table>')
    if in_code_block:
        html_lines.append('</code></pre>')
    
    html_content = f'''<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body {{ font-family: Georgia, serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 20px; }}
h1 {{ color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }}
h2 {{ color: #34495e; margin-top: 30px; }}
h3 {{ color: #7f8c8d; }}
table {{ width: 100%; margin: 20px 0; }}
th {{ background-color: #3498db; color: white; }}
td, th {{ padding: 10px; text-align: left; border: 1px solid #bdc3c7; }}
blockquote {{ background-color: #ecf0f1; padding: 15px; border-left: 4px solid #3498db; margin: 20px 0; font-style: italic; }}
pre {{ background-color: #2c3e50; color: #ecf0f1; padding: 15px; border-radius: 5px; overflow-x: auto; }}
hr {{ border: none; border-top: 2px solid #bdc3c7; margin: 30px 0; }}
</style>
</head>
<body>
{chr(10).join(html_lines)}
</body>
</html>'''
    
    with open('temp_lore.html', 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    print(f"Created temp_lore.html")
    print(f"HTML file ready for browser printing or PDF conversion")

if __name__ == '__main__':
    md_to_pdf('THE_FIRST_ONES_LORE.md', 'THE_FIRST_ONES_LORE.pdf')