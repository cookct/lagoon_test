from flask import Flask, send_file

app = Flask(__name__)

@app.route('/')
def serve_chapters():
    return send_file('chapters_1_7.html')

@app.route('/chapters')
def chapters():
    return send_file('chapters_1_7.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5003, debug=False)