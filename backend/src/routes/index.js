import { Router } from "express";
import rateLimit from "express-rate-limit";

const router = Router();

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many authentication attempts. Please try again later." },
});

const mutationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many write requests. Please slow down and try again." },
});

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
    return typeof value === "string" && UUID_REGEX.test(value.trim());
}

function isNonEmptyString(value, maxLength = 500) {
    return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

function isValidEmail(value) {
    if (typeof value !== "string" || value.length > 320) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function validateAuthBody(req, res, next) {
    const { email, password } = req.body ?? {};
    if (!isValidEmail(email)) {
        return res.status(400).json({ error: "A valid email is required." });
    }
    if (typeof password !== "string" || password.length < 6 || password.length > 128) {
        return res.status(400).json({ error: "Password must be between 6 and 128 characters." });
    }
    return next();
}

function validateCandidateProfileBody(req, res, next) {
    const allowedFields = [
        "campaign_name",
        "office_title",
        "jurisdiction",
        "biography",
        "campaign_website",
        "volunteer_opportunities",
    ];
    const payload = req.body ?? {};
    const providedKeys = Object.keys(payload);

    if (providedKeys.length === 0) {
        return res.status(400).json({ error: "At least one candidate profile field must be provided." });
    }

    for (const key of providedKeys) {
        if (!allowedFields.includes(key)) {
            return res.status(400).json({ error: `Unsupported field: ${key}` });
        }
        if (!isNonEmptyString(payload[key], 4000)) {
            return res.status(400).json({ error: `${key} must be a non-empty string.` });
        }
    }

    return next();
}

function validateChecklistStatus(req, res, next) {
    const { itemId } = req.params;
    const { status } = req.body ?? {};

    if (!isUuid(itemId)) {
        return res.status(400).json({ error: "itemId must be a valid UUID." });
    }

    if (!["pending", "completed"].includes(status)) {
        return res.status(400).json({ error: "status must be either pending or completed." });
    }

    return next();
}

function validateTreasurerCreate(req, res, next) {
    const { full_name, email, phone } = req.body ?? {};
    if (!isNonEmptyString(full_name, 200)) {
        return res.status(400).json({ error: "full_name is required." });
    }
    if (email != null && email !== "" && !isValidEmail(email)) {
        return res.status(400).json({ error: "email must be valid when provided." });
    }
    if (phone != null && phone !== "" && !isNonEmptyString(phone, 40)) {
        return res.status(400).json({ error: "phone must be a valid string when provided." });
    }
    return next();
}

function validateTreasurerAssign(req, res, next) {
    const { candidate_id, treasurer_id } = req.body ?? {};
    if (!isUuid(candidate_id) || !isUuid(treasurer_id)) {
        return res.status(400).json({ error: "candidate_id and treasurer_id must be valid UUIDs." });
    }
    return next();
}

function validateDocumentCreate(req, res, next) {
    const { title, file_path } = req.body ?? {};
    if (!isNonEmptyString(title, 300)) {
        return res.status(400).json({ error: "title is required." });
    }
    if (!isNonEmptyString(file_path, 1000)) {
        return res.status(400).json({ error: "file_path is required." });
    }
    return next();
}

function validateTransactionCreate(req, res, next) {
    const { type, amount } = req.body ?? {};
    if (!["donation", "expense"].includes(type)) {
        return res.status(400).json({ error: "type must be donation or expense." });
    }
    if (typeof amount !== "number" || Number.isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: "amount must be a positive number." });
    }
    return next();
}

router.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "ccsp-backend" });
});

router.post("/auth/register", authLimiter, validateAuthBody, (_req, res) => {
    res.status(201).json({ message: "Register endpoint scaffolded" });
});

router.post("/auth/login", authLimiter, validateAuthBody, (_req, res) => {
    res.json({ message: "Login endpoint scaffolded" });
});

router.get("/candidate/profile", (_req, res) => {
    res.json({ message: "Candidate profile endpoint scaffolded" });
});

router.put("/candidate/profile", mutationLimiter, validateCandidateProfileBody, (_req, res) => {
    res.json({ message: "Candidate profile upsert endpoint scaffolded" });
});

router.get("/checklist", (_req, res) => {
    res.json({ message: "Checklist endpoint scaffolded" });
});

router.patch("/checklist/:itemId/status", mutationLimiter, validateChecklistStatus, (_req, res) => {
    res.json({ message: "Checklist status endpoint scaffolded" });
});

router.get("/deadlines", (_req, res) => {
    res.json({ message: "Deadlines endpoint scaffolded" });
});

router.get("/treasurers", (_req, res) => {
    res.json({ message: "Treasurer list endpoint scaffolded" });
});

router.post("/treasurers", mutationLimiter, validateTreasurerCreate, (_req, res) => {
    res.status(201).json({ message: "Treasurer create endpoint scaffolded" });
});

router.post("/treasurers/assign", mutationLimiter, validateTreasurerAssign, (_req, res) => {
    res.json({ message: "Treasurer assignment endpoint scaffolded" });
});

router.get("/documents", (_req, res) => {
    res.json({ message: "Documents list endpoint scaffolded" });
});

router.post("/documents", mutationLimiter, validateDocumentCreate, (_req, res) => {
    res.status(201).json({ message: "Document create endpoint scaffolded" });
});

router.get("/transactions", (_req, res) => {
    res.json({ message: "Transactions list endpoint scaffolded" });
});

router.post("/transactions", mutationLimiter, validateTransactionCreate, (_req, res) => {
    res.status(201).json({ message: "Transaction create endpoint scaffolded" });
});

router.get("/reminders", (_req, res) => {
    res.json({ message: "Reminders endpoint scaffolded" });
});

export default router;
