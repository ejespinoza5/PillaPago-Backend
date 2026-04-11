const express = require("express");

const {
	changePassword,
	confirmEmailVerification,
	confirmEmailChange,
	getMe,
	googleLogin,
	loginEmail,
	requestEmailVerification,
	requestEmailChange,
	registerEmployeeEmail,
	registerOwnerEmail,
	registerEmail
} = require("../controllers/auth.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { upload } = require("../middlewares/upload.middleware");

const router = express.Router();

router.post("/google", googleLogin);
router.post("/email/register", upload.single("foto_perfil"), registerEmail);
router.post("/email/register-owner", upload.single("foto_perfil"), registerOwnerEmail);
router.post("/email/register-employee", upload.single("foto_perfil"), registerEmployeeEmail);
router.post("/email/login", loginEmail);
router.post("/email/verify/request", requireAuth, requestEmailVerification);
router.post("/email/verify/confirm", requireAuth, confirmEmailVerification);
router.post("/email/change/request", requireAuth, requestEmailChange);
router.post("/email/change/confirm", requireAuth, confirmEmailChange);
router.get("/me", requireAuth, getMe);
router.patch("/password", requireAuth, changePassword);

module.exports = router;
