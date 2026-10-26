const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

function openDatabase() {
    const dataDirectory = path.join(__dirname, 'db');
    fs.mkdirSync(dataDirectory, { recursive: true });
    const database = new sqlite3.Database(path.join(dataDirectory, 'database.sqlite'));

    return new Promise((resolve, reject) => {
        database.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL COLLATE NOCASE UNIQUE,
            email TEXT COLLATE NOCASE UNIQUE,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            reset_token_hash TEXT,
            reset_token_expires_at INTEGER,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`, error => {
            if (error) return reject(error);
            database.run('ALTER TABLE users ADD COLUMN email TEXT COLLATE NOCASE', () => {
                database.run('ALTER TABLE users ADD COLUMN reset_token_hash TEXT', () => {
                    database.run('ALTER TABLE users ADD COLUMN reset_token_expires_at INTEGER', () => {
                        database.run(`CREATE TABLE IF NOT EXISTS game_progress (
                            user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                            state_json TEXT NOT NULL,
                            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                        )`, progressError => progressError ? reject(progressError) : resolve(database));
                    });
                });
            });
        });
    });
}

function findByLogin(database, login) {
    return new Promise((resolve, reject) => {
        database.get(`SELECT id, username, email, password_hash, salt, reset_token_hash,
            reset_token_expires_at FROM users WHERE username = ? OR email = ?`, [login, login],
            (error, row) => error ? reject(error) : resolve(row));
    });
}

function findByEmail(database, email) {
    return new Promise((resolve, reject) => {
        database.get('SELECT id, username, email FROM users WHERE email = ?', [email],
            (error, row) => error ? reject(error) : resolve(row));
    });
}

function create(database, username, email, passwordHash, salt) {
    return new Promise((resolve, reject) => {
        database.run('INSERT INTO users (username, email, password_hash, salt) VALUES (?, ?, ?, ?)',
            [username, email, passwordHash, salt], function (error) {
                if (error) return reject(error);
                resolve({ id: this.lastID, username, email });
            });
    });
}

function saveResetToken(database, userId, tokenHash, expiresAt) {
    return new Promise((resolve, reject) => {
        database.run('UPDATE users SET reset_token_hash = ?, reset_token_expires_at = ? WHERE id = ?',
            [tokenHash, expiresAt, userId], error => error ? reject(error) : resolve());
    });
}

function consumeResetToken(database, tokenHash) {
    return new Promise((resolve, reject) => {
        database.get(`SELECT id, username, email FROM users
            WHERE reset_token_hash = ? AND reset_token_expires_at > ?`,
        [tokenHash, Date.now()], (error, row) => error ? reject(error) : resolve(row));
    });
}

function updatePassword(database, userId, passwordHash, salt) {
    return new Promise((resolve, reject) => {
        database.run(`UPDATE users SET password_hash = ?, salt = ?,
            reset_token_hash = NULL, reset_token_expires_at = NULL WHERE id = ?`,
        [passwordHash, salt, userId], error => error ? reject(error) : resolve());
    });
}

function loadProgress(database, userId) {
    return new Promise((resolve, reject) => {
        database.get('SELECT state_json FROM game_progress WHERE user_id = ?', [userId], (error, row) => {
            if (error) return reject(error);
            if (!row) return resolve(null);
            try {
                resolve(JSON.parse(row.state_json));
            } catch (parseError) {
                reject(parseError);
            }
        });
    });
}

function saveProgress(database, userId, progress) {
    return new Promise((resolve, reject) => {
        database.run(`INSERT INTO game_progress (user_id, state_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP`,
        [userId, JSON.stringify(progress)], error => error ? reject(error) : resolve());
    });
}

module.exports = {
    openDatabase,
    findByLogin,
    findByEmail,
    create,
    saveResetToken,
    consumeResetToken,
    updatePassword,
    loadProgress,
    saveProgress
};
