const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const GitHubStrategy = require("passport-github2").Strategy;
const db = require("./db");
require("dotenv").config();

const router = express.Router();

// === Настройка Nodemailer (SendGrid или Gmail) ===
const transporter = nodemailer.createTransport({
  service: "SendGrid",
  auth: {
    api_key: process.env.SENDGRID_API_KEY,
  },
});

// === Passport: Google ===
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      const email = profile.emails[0].value;
      const name = profile.displayName;

      db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
        if (err) return done(err);

        if (user) {
          // Уже есть — логиним
          return done(null, user);
        }

        // Новый пользователь через Google
        db.run(
          "INSERT INTO users (name, email, is_verified, oauth_provider) VALUES (?, ?, 1, 'google')",
          [name, email],
          function (err) {
            if (err) return done(err);
            db.get("SELECT * FROM users WHERE id = ?", [this.lastID], (err, newUser) => {
              done(null, newUser);
            });
          }
        );
      });
    }
  )
);

// === Passport: GitHub ===
passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      const email = profile.emails?.[0]?.value || `${profile.username}@github.user`;
      const name = profile.displayName || profile.username;

      // Аналогично Google — проверка/создание пользователя
      db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
        if (err) return done(err);
        if (user) return done(null, user);

        db.run(
          "INSERT INTO users (name, email, is_verified, oauth_provider) VALUES (?, ?, 1, 'github')",
          [name, email],
          function (err) {
            if (err) return done(err);
            db.get("SELECT * FROM users WHERE id = ?", [this.lastID], (err, newUser) => {
              done(null, newUser);
            });
          }
        );
      });
    }
  )
);

// Сериализация пользователя в сессию (для JWT не обязательно, но оставим)
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  db.get("SELECT * FROM users WHERE id = ?", [id], (err, user) => done(err, user));
});

// === Обычная регистрация с подтверждением email ===
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Заполните все поля" });
  }

  const hash = await bcrypt.hash(password, 10);
  const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: "1d" });

  db.run(
    "INSERT INTO users (name, email, password, confirmation_token) VALUES (?, ?, ?, ?)",
    [name, email, hash, token],
    function (err) {
      if (err) {
        return res.status(400).json({ error: "Email уже существует" });
      }

      // Отправляем письмо подтверждения
      const confirmLink = `http://localhost:3000/api/confirm-email?token=${token}`;

      transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: email,
        subject: "Подтвердите ваш аккаунт в SyntaxDuel",
        html: `
          <h1>Добро пожаловать в SyntaxDuel!</h1>
          <p>Привет, ${name}!</p>
          <p>Нажмите на ссылку ниже, чтобы подтвердить email:</p>
          <a href="${confirmLink}">Подтвердить email</a>
          <p>Ссылка действительна 24 часа.</p>
          <p>Если это не вы — просто проигнорируйте письмо.</p>
        `,
      }, (error) => {
        if (error) console.error("Ошибка отправки email:", error);
      });

      res.json({ success: true, message: "Проверьте почту для подтверждения" });
    }
  );
});

// Подтверждение email
router.get("/confirm-email", (req, res) => {
  const { token } = req.query;

  try {
    const { email } = jwt.verify(token, process.env.JWT_SECRET);

    db.run("UPDATE users SET is_verified = 1, confirmation_token = NULL WHERE email = ? AND confirmation_token = ?", [email, token], function (err) {
      if (err || this.changes === 0) {
        return res.status(400).send("Неверный или просроченный токен");
      }

      res.send(`
        <h1>Аккаунт подтверждён!</h1>
        <p>Теперь можете войти: <a href="/login.html">Войти</a></p>
      `);
    });
  } catch (err) {
    res.status(400).send("Неверный токен");
  }
});

// Логин обычный (только подтверждённые)
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
    if (!user || !user.is_verified) return res.status(401).json({ error: "Аккаунт не подтверждён или не существует" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Неверный пароль" });

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email } });
  });
});

// OAuth роуты
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));
router.get("/google/callback", passport.authenticate("google", { failureRedirect: "/login.html" }), (req, res) => {
  // Успешный логин через Google
  const user = req.user;
  const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.redirect(`/?token=${token}`); // или сохраняем в localStorage через фронт
});

router.get("/github", passport.authenticate("github", { scope: ["user:email"] }));
router.get("/github/callback", passport.authenticate("github", { failureRedirect: "/login.html" }), (req, res) => {
  const user = req.user;
  const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.redirect(`/?token=${token}`);
});

module.exports = router;