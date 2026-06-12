#!/usr/bin/env python3
"""Convert THE_FIRST_ONES_LORE.md to PDF using reportlab."""

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER
import re

def parse_markdown_to_pdf(md_file, pdf_file):
    with open(md_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    doc = SimpleDocTemplate(pdf_file, pagesize=letter,
                           rightMargin=72, leftMargin=72,
                           topMargin=72, bottomMargin=72)
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    styles.add(ParagraphStyle(name='Title1',
                             parent=styles['Heading1'],
                             fontSize=24,
                             spaceAfter=30,
                             textColor=colors.HexColor('#2c3e50')))
    
    styles.add(ParagraphStyle(name='Title2',
                             parent=styles['Heading2'],
                             fontSize=18,
                             spaceBefore=20,
                             spaceAfter=12,
                             textColor=colors.HexColor('#34495e')))
    
    styles.add(ParagraphStyle(name='Title3',
                             parent=styles['Heading3'],
                             fontSize=14,
                             spaceBefore=15,
                             spaceAfter=10,
                             textColor=colors.HexColor('#7f8c8d')))
    
    styles.add(ParagraphStyle(name='Body',
                             parent=styles['Normal'],
                             fontSize=11,
                             leading=16,
                             spaceAfter=8))
    
    styles.add(ParagraphStyle(name='Quote',
                             parent=styles['Normal'],
                             fontSize=11,
                             leading=16,
                             leftIndent=20,
                             rightIndent=20,
                             spaceBefore=10,
                             spaceAfter=10,
                             backColor=colors.HexColor('#ecf0f1'),
                             borderPadding=10))
    
    styles.add(ParagraphStyle(name='CodeBlock',
                             parent=styles['Normal'],
                             fontName='Courier',
                             fontSize=9,
                             leading=12,
                             leftIndent=20,
                             backColor=colors.HexColor('#f4f4f4')))
    
    story = []
    lines = content.split('\n')
    in_table = False
    table_data = []
    in_code_block = False
    code_lines = []
    
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # Code blocks
        if line.startswith('```'):
            if in_code_block:
                code_text = '\n'.join(code_lines)
                story.append(Paragraph(code_text.replace('<', '&lt;').replace('>', '&gt;'), styles['CodeBlock']))
                story.append(Spacer(1, 10))
                code_lines = []
                in_code_block = False
            else:
                in_code_block = True
            i += 1
            continue
        
        if in_code_block:
            code_lines.append(line)
            i += 1
            continue
        
        # Tables
        if '|' in line and not line.startswith('#'):
            cells = [c.strip() for c in line.split('|') if c.strip()]
            if cells:
                # Skip separator rows
                if all(c.replace('-', '').replace(':', '') == '' for c in cells):
                    i += 1
                    continue
                
                if not in_table:
                    in_table = True
                    table_data = []
                
                table_data.append(cells)
                i += 1
                continue
        
        if in_table and '|' not in line:
            # End of table
            if table_data:
                # Create table
                t = Table(table_data)
                t.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3498db')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, 0), 10),
                    ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                    ('BACKGROUND', (0, 1), (-1, -1), colors.white),
                    ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#bdc3c7')),
                    ('FONTSIZE', (0, 1), (-1, -1), 9),
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ]))
                story.append(t)
                story.append(Spacer(1, 15))
                table_data = []
            in_table = False
        
        # Horizontal rule
        if line.strip() == '---':
            story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#bdc3c7')))
            story.append(Spacer(1, 10))
            i += 1
            continue
        
        # Blockquote
        if line.startswith('> '):
            quote_text = line[2:].replace('<', '&lt;').replace('>', '&gt;')
            story.append(Paragraph(quote_text, styles['Quote']))
            i += 1
            continue
        
        # Headers
        if line.startswith('# '):
            story.append(Paragraph(line[2:], styles['Title1']))
            i += 1
            continue
        elif line.startswith('## '):
            story.append(Paragraph(line[3:], styles['Title2']))
            i += 1
            continue
        elif line.startswith('### '):
            story.append(Paragraph(line[4:], styles['Title3']))
            i += 1
            continue
        elif line.startswith('#### '):
            story.append(Paragraph(line[5:], styles['Heading4']))
            i += 1
            continue
        
        # Regular paragraphs
        if line.strip():
            # Process markdown formatting
            text = line
            text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
            text = re.sub(r'\*(.+?)\*', r'<i>\1</i>', text)
            text = text.replace('<', '&lt;').replace('>', '&gt;')
            text = re.sub(r'&lt;b&gt;(.+?)&lt;/b&gt;', r'<b>\1</b>', text)
            text = re.sub(r'&lt;i&gt;(.+?)&lt;/i&gt;', r'<i>\1</i>', text)
            story.append(Paragraph(text, styles['Body']))
        else:
            story.append(Spacer(1, 6))
        
        i += 1
    
    # Handle any remaining table
    if in_table and table_data:
        t = Table(table_data)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3498db')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#bdc3c7')),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        story.append(t)
    
    doc.build(story)
    print(f"Created {pdf_file}")

if __name__ == '__main__':
    parse_markdown_to_pdf('THE_FIRST_ONES_LORE.md', 'THE_FIRST_ONES_LORE.pdf')