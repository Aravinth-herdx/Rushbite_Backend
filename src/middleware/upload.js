const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/octet-stream'];
const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 5242880; // 5MB

const createStorage = (folder) => {
  const uploadDir = path.join(__dirname, '../../uploads', folder);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const timestamp = Date.now();
      const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${timestamp}_${sanitized}`);
    },
  });
};

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_TYPES.includes(file.mimetype) || ALLOWED_EXTS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (jpg, jpeg, png, webp) are allowed'), false);
  }
};

/**
 * Upload a single file to the specified folder
 * Attaches req.fileUrl = '/uploads/{folder}/{filename}'
 */
const uploadSingle = (fieldName, folder) => {
  const storage = createStorage(folder);
  const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_SIZE } });

  return [
    upload.single(fieldName),
    (req, res, next) => {
      if (req.file) {
        const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
        req.fileUrl = `/uploads/${folder}/${req.file.filename}`;
        req.fileFullUrl = `${baseUrl}/uploads/${folder}/${req.file.filename}`;
      }
      next();
    },
  ];
};

/**
 * Upload multiple files (up to maxCount) to the specified folder
 * Attaches req.fileUrls = ['/uploads/{folder}/{filename}', ...]
 * Also sets req.fileUrl = first url for backward compat
 */
const uploadMultiple = (fieldName, folder, maxCount = 7) => {
  const storage = createStorage(folder);
  const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_SIZE } });

  return [
    upload.array(fieldName, maxCount),
    (req, res, next) => {
      if (req.files && req.files.length > 0) {
        req.fileUrls = req.files.map((f) => `/uploads/${folder}/${f.filename}`);
        req.fileUrl = req.fileUrls[0]; // backward compat
      } else {
        req.fileUrls = [];
      }
      next();
    },
  ];
};

module.exports = { uploadSingle, uploadMultiple };
