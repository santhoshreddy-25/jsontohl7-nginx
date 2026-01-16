const express = require("express");
const bodyParser = require("body-parser");

const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(express.static("public"));

app.post("/generate-hl7", (req, res) => {
    const { inputJson, mappings } = req.body;

    // ---------- MSH ----------
    const msh =
        "MSH|^~\\&|APP|HOSP|SYS|FAC|" +
        getDate() +
        "||ADT^A01|MSG00001|P|2.3";

    // ---------- PID ----------
    let pidFields = [];
    pidFields[0] = "PID";

    mappings.forEach(m => {
        const value = getValue(inputJson, m.jsonPath);
        if (!value) return;

        if (m.component) {
            if (!pidFields[m.field]) {
                pidFields[m.field] = [];
            }
            pidFields[m.field][m.component - 1] = value;
        } else {
            pidFields[m.field] = value;
        }
    });

    // Build composite fields
    for (let i = 0; i < pidFields.length; i++) {
        if (Array.isArray(pidFields[i])) {
            pidFields[i] = pidFields[i].join("^");
        }
    }

    const pid = pidFields.join("|");

    const hl7 = msh + "\r" + pid;

    res.json({ hl7 });
});

function getValue(obj, path) {
    return path.split(".").reduce((o, p) => (o ? o[p] : null), obj);
}

function getDate() {
    const d = new Date();
    return (
        d.getFullYear() +
        String(d.getMonth() + 1).padStart(2, "0") +
        String(d.getDate()).padStart(2, "0")
    );
}

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
