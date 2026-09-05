export const SAMPLES = [
  {
    id: 'sqli',
    name: 'SQL Injection',
    category: 'A03:2021-Injection',
    language: 'python',
    severity: 'Cao',
    description: 'Truy vấn SQL nối chuỗi trực tiếp từ tham số người dùng nhập.',
    code: `import sqlite3
from flask import Flask, request

app = Flask(__name__)

@app.route('/user_search')
def search_user():
    username = request.args.get('username')
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()

    # LỖ HỔNG: Nối chuỗi trực tiếp tạo điều kiện SQL Injection
    query = f"SELECT id, username, email FROM users WHERE username = '{username}'"
    cursor.execute(query)
    
    users = cursor.fetchall()
    conn.close()
    return {"results": users}`
  },
  {
    id: 'xss',
    name: 'Cross-Site Scripting (XSS)',
    category: 'A03:2021-Injection',
    language: 'javascript',
    severity: 'Cao',
    description: 'Render trực tiếp dữ liệu người dùng vào DOM qua innerHTML mà không sanitize.',
    code: `// Express.js + Vanilla DOM rendering
app.get('/profile', (req, res) => {
    const userBio = req.query.bio;
    
    // Giả lập template render không escape
    const htmlResponse = \`
      <div class="profile-card">
        <h2>Hồ sơ người dùng</h2>
        <!-- LỖ HỔNG XSS: Render trực tiếp thẻ HTML độc hại -->
        <div id="user-bio">\${userBio}</div>
      </div>
    \`;
    res.send(htmlResponse);
});`
  },
  {
    id: 'secret',
    name: 'Hardcoded Secret / API Key',
    category: 'A07:2021-Identification & Auth Failures',
    language: 'javascript',
    severity: 'Cao',
    description: 'Viết cứng API Secret và Database Password trực tiếp trong mã nguồn.',
    code: `import express from 'express';
import Stripe from 'stripe';

const app = express();

// LỖ HỔNG: Viết cứng Secret Key và mật khẩu database trong mã nguồn
const STRIPE_SECRET_KEY = "MOCK_SECRET_KEY_EX_1234567890_NEVER_HARDCODE";
const DB_PASSWORD = "SuperSecretDbPassword2025!";
const JWT_SECRET = "my-super-secret-jwt-key-12345";

const stripe = new Stripe(STRIPE_SECRET_KEY);

app.post('/checkout', async (req, res) => {
    const payment = await stripe.paymentIntents.create({
        amount: 1000,
        currency: 'usd'
    });
    res.json(payment);
});`
  },
  {
    id: 'command_injection',
    name: 'OS Command Injection',
    category: 'A03:2021-Injection',
    language: 'javascript',
    severity: 'Nghiêm trọng (Critical)',
    description: 'Thực thi lệnh shell hệ điều hành với input người dùng mà không qua whitelist/escape.',
    code: `const express = require('express');
const { exec } = require('child_process');
const app = express();

app.get('/api/ping', (req, res) => {
    const targetHost = req.query.host;

    // LỖ HỔNG: Kẻ tấn công có thể chèn "; rm -rf /" hoặc "8.8.8.8 && cat /etc/passwd"
    exec(\`ping -c 4 \${targetHost}\`, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).send(stderr);
        }
        res.send(stdout);
    });
});`
  },
  {
    id: 'path_traversal',
    name: 'Path Traversal (Đọc file tùy ý)',
    category: 'A01:2021-Broken Access Control',
    language: 'python',
    severity: 'Cao',
    description: 'Ghép nối tên file người dùng gửi để đọc nội dung mà không kiểm tra thư mục gốc.',
    code: `import os
from flask import Flask, request, send_file, abort

app = Flask(__name__)
STORAGE_DIR = "/var/www/uploads"

@app.route('/download')
def download_file():
    filename = request.args.get('file')
    # LỖ HỔNG: Kẻ tấn công nhập: "../../etc/passwd" hoặc "..\\\\windows\\\\system.ini"
    file_path = os.path.join(STORAGE_DIR, filename)
    
    if os.path.exists(file_path):
        return send_file(file_path)
    return abort(404, "File not found")`
  },
  {
    id: 'clean_code',
    name: 'Code An Toàn (Clean Code - No Vulnerabilities)',
    category: 'Secure Coding Best Practice',
    language: 'python',
    severity: 'An toàn (Clean)',
    description: 'Code sử dụng Prepared Statements và biến môi trường đúng chuẩn.',
    code: `import os
import sqlite3
from flask import Flask, request, jsonify

app = Flask(__name__)
DATABASE_PATH = os.getenv('DB_PATH', 'secure_app.db')

@app.route('/user_search')
def search_user():
    username = request.args.get('username', '').strip()
    if not username:
        return jsonify({"error": "Username is required"}), 400

    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()

    # AN TOÀN: Sử dụng Tham số hóa (Parameterized Query)
    query = "SELECT id, username, email FROM users WHERE username = ?"
    cursor.execute(query, (username,))
    
    users = cursor.fetchall()
    conn.close()
    return jsonify({"results": users})`
  }
];
