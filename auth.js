const crypto = require('crypto');
const expressSession = require('express-session');

function createAuth({ sessionSecret, users, sendResetEmail, resetBaseUrl }) {
    const session = expressSession({
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, sameSite: 'lax' }
    });

    function isAuthenticated(req) {
        return Boolean(req.session?.user);
    }

    function getUserName(req) {
        return req.session?.user?.username || null;
    }

    function getUserId(req) {
        return req.session?.user?.id || null;
    }

    function requireAuth(req, res, next) {
        if (isAuthenticated(req)) return next();
        return res.status(401).json({ message: 'Log in to continue.' });
    }

    function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
        const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');
        return { passwordHash, salt };
    }

    function passwordsMatch(password, user) {
        const expected = Buffer.from(hashPassword(password, user.salt).passwordHash, 'hex');
        const actual = Buffer.from(user.password_hash, 'hex');
        return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    }

    async function register(req, res) {
        const username = String(req.body.username || '').trim();
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');
        if (!/^[A-Za-z0-9_]{3,30}$/.test(username)) {
            return res.status(400).render('register', { error: 'Username must be 3-30 letters, numbers, or underscores.', username, email });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).render('register', { error: 'Enter a valid email address.', username, email });
        }
        if (password.length < 8) {
            return res.status(400).render('register', { error: 'Password must be at least 8 characters.', username, email });
        }
        if (await users.findByLogin(username) || await users.findByEmail(email)) {
            return res.status(409).render('register', { error: 'That username or email is already registered.', username, email });
        }
        const { passwordHash, salt } = hashPassword(password);
        const user = await users.create(username, email, passwordHash, salt);
        req.session.user = { id: user.id, username: user.username };
        return req.session.save(() => res.redirect('/'));
    }

    async function login(req, res) {
        const loginValue = String(req.body.login || '').trim();
        const password = String(req.body.password || '');
        const user = await users.findByLogin(loginValue);
        if (!user || !passwordsMatch(password, user)) {
            return res.status(401).render('login', { error: 'Invalid email or password.', login: loginValue });
        }
        req.session.user = { id: user.id, username: user.username };
        return req.session.save(() => res.redirect('/'));
    }

    async function forgotPassword(req, res) {
        const email = String(req.body.email || '').trim().toLowerCase();
        const user = await users.findByEmail(email);
        if (user) {
            const token = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            await users.saveResetToken(user.id, tokenHash, Date.now() + 30 * 60 * 1000);
            const resetUrl = `${resetBaseUrl || `${req.protocol}://${req.get('host')}`}/reset-password?token=${token}`;
            await sendResetEmail(user.email, resetUrl);
        }
        return res.render('forgot-password', { message: 'If that email is registered, a reset link has been sent.', error: null, email: '' });
    }

    async function resetPassword(req, res) {
        const token = String(req.body.token || '');
        const password = String(req.body.password || '');
        if (password.length < 8) {
            return res.status(400).render('reset-password', { error: 'Password must be at least 8 characters.', token });
        }
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const user = await users.consumeResetToken(tokenHash);
        if (!user) return res.status(400).render('forgot-password', { error: 'That reset link is invalid or expired.', message: null, email: '' });
        const { passwordHash, salt } = hashPassword(password);
        await users.updatePassword(user.id, passwordHash, salt);
        return res.render('login', { error: null, message: 'Password reset. You can now log in.', login: user.email });
    }

    function logout(req, res) {
        req.session.destroy(() => res.redirect('/'));
    }

    return { session, isAuthenticated, getUserName, getUserId, requireAuth, register, login, forgotPassword, resetPassword, logout };
}

module.exports = { createAuth };
