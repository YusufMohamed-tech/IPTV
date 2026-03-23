const express = require("express");
const { body, param } = require("express-validator");
const { requireAuth, requireRoles } = require("../middlewares/auth");
const { validate } = require("../middlewares/validate");
const admin = require("../controllers/adminController");
const { adminReport } = require("../controllers/reportController");

const router = express.Router();

router.use(requireAuth, requireRoles("admin"));

router.get("/dashboard", admin.dashboard);

router.get("/resellers", admin.listResellers);
router.post("/resellers", admin.resellerValidation, validate, admin.createReseller);
router.patch("/resellers/:id", admin.resellerUpdateValidation, validate, admin.updateReseller);
router.delete("/resellers/:id", [param("id").isMongoId()], validate, admin.deleteReseller);
router.post("/resellers/:id/credits", admin.creditValidation, validate, admin.assignCredits);

router.get("/packages", admin.listPackages);
router.post("/packages", admin.packageValidation, validate, admin.createPackage);
router.patch("/packages/:id", [param("id").isMongoId()], validate, admin.updatePackage);
router.delete("/packages/:id", [param("id").isMongoId()], validate, admin.deletePackage);

router.get("/servers", admin.listServers);
router.post("/servers", admin.serverValidation, validate, admin.createServer);
router.patch("/servers/:id", [param("id").isMongoId()], validate, admin.updateServer);
router.delete("/servers/:id", [param("id").isMongoId()], validate, admin.deleteServer);

router.get("/activity", admin.activity);
router.get("/notifications", admin.notifications);
router.get("/reports", admin.reportValidation, validate, adminReport);

module.exports = router;
