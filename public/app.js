let parsedJson = {};
let mappings = [];

function loadJson() {
    mappings = [];
    parsedJson = JSON.parse(document.getElementById("jsonInput").value);
    document.getElementById("jsonFields").innerHTML = "";
    extractFields(parsedJson, "");
}

function extractFields(obj, prefix) {
    for (let key in obj) {
        const path = prefix ? `${prefix}.${key}` : key;

        if (typeof obj[key] === "object") {
            extractFields(obj[key], path);
        } else {
            const li = document.createElement("li");
            li.textContent = path;
            li.draggable = true;

            li.addEventListener("dragstart", e => {
                e.dataTransfer.setData("text/plain", path);
            });

            document.getElementById("jsonFields").appendChild(li);
        }
    }
}

// HL7 drop targets
document.querySelectorAll(".hl7").forEach(li => {

    li.addEventListener("dragover", e => {
        e.preventDefault();
        li.classList.add("dragover");
    });

    li.addEventListener("dragleave", () => {
        li.classList.remove("dragover");
    });

    li.addEventListener("drop", e => {
        e.preventDefault();
        li.classList.remove("dragover");

        const jsonPath = e.dataTransfer.getData("text/plain");
        const field = Number(li.dataset.field);
        const component = li.dataset.component
            ? Number(li.dataset.component)
            : null;

        mappings.push({ jsonPath, field, component });

        li.textContent += " ← " + jsonPath;
    });
});

function generateHL7() {
    fetch("/generate-hl7", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            inputJson: parsedJson,
            mappings
        })
    })
        .then(res => res.json())
        .then(data => {
            document.getElementById("output").textContent = data.hl7;
        });
}
