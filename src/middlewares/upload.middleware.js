const multer = require("multer");

const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES
  },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      callback(new Error("Solo se permiten archivos de imagen"));
      return;
    }

    callback(null, true);
  }
});

module.exports = {
  upload
};
