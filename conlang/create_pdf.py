from fpdf import FPDF

# Read the text file
with open('sample.txt', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace problematic Unicode characters with ASCII equivalents
content = content.replace('—', '--')
content = content.replace('–', '-')
content = content.replace('"', '"')
content = content.replace('"', '"')
content = content.replace(''', "'")
content = content.replace(''', "'")
content = content.replace('…', '...')
content = content.replace('•', '*')

# Create PDF
pdf = FPDF()
pdf.set_auto_page_break(auto=True, margin=15)
pdf.add_page()

# Set font - using a standard font that works well for long text
pdf.set_font('Helvetica', size=11)

# Split content into lines and add to PDF
lines = content.split('\n')

for line in lines:
    # Handle chapter headers (lines that start with #)
    if line.startswith('# '):
        pdf.set_font('Helvetica', 'B', 16)
        pdf.cell(0, 10, line[2:], ln=True, align='C')
        pdf.ln(5)
        pdf.set_font('Helvetica', size=11)
    elif line.strip() == '':
        pdf.ln(5)
    else:
        # Use multi_cell for long paragraphs with word wrap
        pdf.multi_cell(0, 6, line)

# Save the PDF
pdf.output('sample.pdf')
print("PDF created successfully: sample.pdf")