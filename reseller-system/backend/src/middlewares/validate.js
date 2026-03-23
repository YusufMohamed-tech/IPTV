const { validationResult } = require("express-validator");

function validate(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(400).json({
      error: "Validation failed",
      details: result.array().map((item) => ({ field: item.path, message: item.msg })),
    });
  }

  return next();
}

module.exports = { validate };
