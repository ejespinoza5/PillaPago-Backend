const express = require("express");

const {
  getEmployeeById,
  inactivateEmployee,
  leaveCurrentBusiness,
  listInactiveEmployees,
  reactivateEmployee,
  listActiveEmployees
} = require("../controllers/empleados.controller");
const { requireAuth } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get("/", requireAuth, listActiveEmployees);
router.get("/inactivos", requireAuth, listInactiveEmployees);
router.delete("/me/salir-negocio", requireAuth, leaveCurrentBusiness);
router.get("/:id", requireAuth, getEmployeeById);
router.patch("/:id/reactivar", requireAuth, reactivateEmployee);
router.delete("/:id", requireAuth, inactivateEmployee);

module.exports = router;