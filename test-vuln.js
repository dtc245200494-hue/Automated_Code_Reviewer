// test-vuln.js - File test giả lập lỗ hổng bảo mật để thử nghiệm AI Security Bot
const mysql = require('mysql');

// 🚨 Lỗi 1: Hardcoded Secrets (Mật khẩu viết cứng)
const DB_CONFIG = {
  host: 'localhost',
  user: 'admin',
  password: 'SuperSecretAdminPassword2025!@#'
};

const connection = mysql.createConnection(DB_CONFIG);

// 🚨 Lỗi 2: SQL Injection (Nối chuỗi trực tiếp từ người dùng)
function handleLogin(req, res) {
  const username = req.body.username;
  const password = req.body.password;

  // Lỗ hổng SQLi nghiêm trọng: Không sử dụng parameterized queries
  const sqlQuery = "SELECT * FROM users WHERE username = '" + username + "' AND password = '" + password + "'";

  connection.query(sqlQuery, (err, results) => {
    if (err) {
      // 🚨 Lỗi 3: Sensitive Data Exposure (Log lỗi chi tiết ra console)
      console.log('Database Error details:', err);
      return res.status(500).send("Database error");
    }
    return res.json(results);
  });
}

module.exports = { handleLogin };
