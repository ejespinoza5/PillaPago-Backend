const { listBancosRecords } = require("../models/bancos.model");

async function listBancos(_req, res, next) {
  try {
    const bancos = await listBancosRecords();
    res.json(bancos);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listBancos
};