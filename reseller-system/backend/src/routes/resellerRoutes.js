const express = require("express");
const { body, param, query } = require("express-validator");
const { requireAuth, requireRoles } = require("../middlewares/auth");
const { validate } = require("../middlewares/validate");
const reseller = require("../controllers/resellerController");
const { resellerReport } = require("../controllers/reportController");

const router = express.Router();

router.use(requireAuth, requireRoles("reseller"));

router.get("/dashboard", reseller.dashboard);

router.get("/clients", [query("q").optional().isString()], validate, reseller.listClients);
router.post("/clients", reseller.clientValidation, validate, reseller.createClient);
router.patch(
  "/clients/:id",
  [param("id").isMongoId(), body("name").optional().isLength({ min: 2 }), body("status").optional().isIn(["active", "disabled"])],
  validate,
  reseller.updateClient,
);
router.delete("/clients/:id", [param("id").isMongoId()], validate, reseller.deleteClient);

router.get("/packages", reseller.availablePackages);
router.get("/subscriptions", [query("status").optional().isString()], validate, reseller.listSubscriptions);
router.post("/subscriptions", reseller.subscriptionValidation, validate, reseller.createSubscription);
router.post("/subscriptions/:id/renew", reseller.renewalValidation, validate, reseller.renewSubscription);
router.post("/subscriptions/expire-run", reseller.expireSubscriptions);

router.get("/reports", [query("format").optional().isIn(["json", "csv", "pdf"])], validate, resellerReport);

module.exports = router;
