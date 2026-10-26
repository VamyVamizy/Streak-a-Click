const express = require('express');
const path = require('path');
const app = express();
const port = 3000;
require('dotenv').config();
const IP = process.env.IP;
const { createAuth } = require('./auth');
const { openDatabase, findByLogin, findByEmail, create, saveResetToken, consumeResetToken, updatePassword, loadProgress, saveProgress } = require('./database');
const { createMailer } = require('./mailer');

const defaultProgress = {
    clicks: 0,
    streak: 1,
    streakLevel: 1,
    strength: 1,
    decreaseValue: 50,
    force: 8,
    criticalChance: 0.02,
    overclocked: false,
    drainageLvl: 1,
    forceLvl: 1,
    criticalLvl: 1,
    drainageCost: 20,
    forceCost: 100,
    criticalCost: 300,
    timeFreezeUnlocked: false,
    timeFreezeDuration: 2,
    timeFreezeUpgradeCost: 1000,
    progressValues: []
};

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

openDatabase()
    .then(database => {
        const mailer = createMailer();
        const auth = createAuth({
            sessionSecret: process.env.SESSION_SECRET || 'replace-this-session-secret',
            resetBaseUrl: process.env.APP_URL,
            sendResetEmail: mailer.sendResetEmail,
            users: {
                findByLogin: login => findByLogin(database, login),
                findByEmail: email => findByEmail(database, email),
                create: (username, email, passwordHash, salt) => create(database, username, email, passwordHash, salt),
                saveResetToken: (userId, tokenHash, expiresAt) => saveResetToken(database, userId, tokenHash, expiresAt),
                consumeResetToken: tokenHash => consumeResetToken(database, tokenHash),
                updatePassword: (userId, passwordHash, salt) => updatePassword(database, userId, passwordHash, salt)
            }
        });

        app.use(auth.session);

        app.get('/login', (req, res) => {
            if (auth.isAuthenticated(req)) return res.redirect('/');
            res.render('login', { error: null, message: null, login: '' });
        });
        app.post('/login', (req, res, next) => auth.login(req, res).catch(next));
        app.get('/forgot-password', (req, res) => res.render('forgot-password', { error: null, message: null, email: '' }));
        app.post('/forgot-password', (req, res, next) => auth.forgotPassword(req, res).catch(next));
        app.get('/reset-password', (req, res) => {
            const token = String(req.query.token || '');
            if (!token) return res.redirect('/forgot-password');
            res.render('reset-password', { error: null, token });
        });
        app.post('/reset-password', (req, res, next) => auth.resetPassword(req, res).catch(next));
        app.get('/register', (req, res) => {
            if (auth.isAuthenticated(req)) return res.redirect('/');
            res.render('register', { error: null, username: '', email: '' });
        });
        app.post('/register', (req, res, next) => auth.register(req, res).catch(next));
        app.get('/logout', auth.logout);

        app.get('/api/progress', auth.requireAuth, async (req, res, next) => {
            try {
                const progress = await loadProgress(database, auth.getUserId(req));
                res.json(progress || defaultProgress);
            } catch (error) {
                next(error);
            }
        });

        app.put('/api/progress', auth.requireAuth, async (req, res, next) => {
            try {
                const progress = { ...defaultProgress, ...req.body };
                if (!Number.isFinite(progress.clicks) || !Number.isFinite(progress.streakLevel)) {
                    return res.status(400).json({ message: 'Invalid progress data.' });
                }
                await saveProgress(database, auth.getUserId(req), progress);
                res.sendStatus(204);
            } catch (error) {
                next(error);
            }
        });

        app.get('/', (req, res) => {
            const renderPage = progress => res.render('index', {
                title: 'Home',
                streak: Array.from({ length: progress.streakLevel }, (_, i) => [i + 1]),
                str: progress.strength,
                initialProgress: progress,
                isAuthenticated: auth.isAuthenticated(req),
                username: auth.getUserName(req)
            });
            if (!auth.isAuthenticated(req)) return renderPage(defaultProgress);
            loadProgress(database, auth.getUserId(req))
                .then(progress => renderPage(progress ? { ...defaultProgress, ...progress } : defaultProgress))
                .catch(() => renderPage(defaultProgress));
        });

        app.listen(port, IP, () => {
            console.log(`Server is running on ${IP || 'localhost'}:${port}`);
        });
    })
    .catch(error => {
        console.error('Database initialization failed:', error);
        process.exitCode = 1;
    });
