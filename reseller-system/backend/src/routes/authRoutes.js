const express = require("express");
const { requireAuth } = require("../middlewares/auth");
const { validate } = require("../middlewares/validate");
const auth = require("../controllers/authController");

const router = express.Router();

router.post("/login", auth.loginValidation, validate, auth.login);
router.post("/register", auth.registerValidation, validate, auth.register);
router.get("/me", requireAuth, auth.me);

module.exports = router;
